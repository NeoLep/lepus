import { createHash } from 'node:crypto'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import { resolveFilePath } from './file-system'

const MAX_PATCH_FILE_BYTES = 1024 * 1024
const MAX_CHANGES = 50
const MAX_REPLACEMENTS = 200
const MAX_DIFF_CHARACTERS = 120_000

export type TextPatchChange = {
  oldText: string
  newText: string
  replaceAll?: boolean
}

export type ApplyTextPatchArguments = {
  path: string
  workspacePath: string
  changes: TextPatchChange[]
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function countOccurrences(content: string, search: string): number {
  let count = 0
  let index = 0
  while ((index = content.indexOf(search, index)) !== -1) {
    count += 1
    index += search.length
  }
  return count
}

function lineNumberAt(content: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

function diffLines(value: string, prefix: '-' | '+'): string[] {
  return value.split('\n').map((line) => `${prefix}${line}`)
}

export async function applyTextPatch(
  input: ApplyTextPatchArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (!Array.isArray(input.changes) || input.changes.length < 1) {
    throw new Error('changes 至少需要包含一项修改')
  }
  if (input.changes.length > MAX_CHANGES) {
    throw new Error(`单次最多包含 ${MAX_CHANGES} 项修改`)
  }
  const patchCharacters = input.changes.reduce(
    (total, change) =>
      total + String(change.oldText ?? '').length + String(change.newText ?? '').length,
    0
  )
  if (patchCharacters > MAX_PATCH_FILE_BYTES) {
    throw new Error(`补丁内容不能超过 ${MAX_PATCH_FILE_BYTES} 个字符`)
  }

  const filePath = resolveFilePath(input.path, input.workspacePath)
  const fileInfo = await lstat(filePath)
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error('只能修改普通文本文件，且不允许符号链接')
  }
  if (fileInfo.size > MAX_PATCH_FILE_BYTES) {
    throw new Error(`文件超过补丁编辑上限 ${MAX_PATCH_FILE_BYTES} 字节`)
  }

  const original = await readFile(filePath, { encoding: 'utf8', signal })
  if (original.includes('\0')) throw new Error('暂不支持修改二进制文件')
  let updated = original
  let replacements = 0
  let additions = 0
  let deletions = 0
  const diff = [`--- ${filePath}`, `+++ ${filePath}`]

  for (let changeIndex = 0; changeIndex < input.changes.length; changeIndex += 1) {
    signal?.throwIfAborted()
    const change = input.changes[changeIndex]
    if (typeof change.oldText !== 'string' || !change.oldText) {
      throw new Error(`changes[${changeIndex}].old_text 必须是非空字符串`)
    }
    if (typeof change.newText !== 'string') {
      throw new Error(`changes[${changeIndex}].new_text 必须是字符串`)
    }
    const occurrences = countOccurrences(updated, change.oldText)
    if (occurrences === 0) {
      throw new Error(`第 ${changeIndex + 1} 项修改未找到 old_text，文件未写入`)
    }
    if (!change.replaceAll && occurrences !== 1) {
      throw new Error(
        `第 ${changeIndex + 1} 项 old_text 匹配到 ${occurrences} 处；请提供更多上下文或明确 replace_all`
      )
    }
    const replacementCount = change.replaceAll ? occurrences : 1
    if (replacements + replacementCount > MAX_REPLACEMENTS) {
      throw new Error(`单次补丁替换次数不能超过 ${MAX_REPLACEMENTS}`)
    }
    const firstIndex = updated.indexOf(change.oldText)
    const startLine = lineNumberAt(updated, firstIndex)
    const oldLineCount = change.oldText.split('\n').length
    const newLineCount = change.newText.split('\n').length
    diff.push(
      `@@ change ${changeIndex + 1}, line ${startLine}, replacements ${replacementCount} @@`,
      ...diffLines(change.oldText, '-'),
      ...diffLines(change.newText, '+')
    )
    additions += newLineCount * replacementCount
    deletions += oldLineCount * replacementCount
    replacements += replacementCount
    updated = change.replaceAll
      ? updated.split(change.oldText).join(change.newText)
      : updated.replace(change.oldText, change.newText)
  }

  if (Buffer.byteLength(updated, 'utf8') > MAX_PATCH_FILE_BYTES) {
    throw new Error(`修改后的文件不能超过 ${MAX_PATCH_FILE_BYTES} 字节`)
  }
  if (updated === original) throw new Error('补丁没有产生任何内容变化')

  const fullDiff = diff.join('\n')
  const diffTruncated = fullDiff.length > MAX_DIFF_CHARACTERS
  await writeFile(filePath, updated, { encoding: 'utf8', signal })

  return {
    path: filePath,
    replacements,
    additions,
    deletions,
    beforeHash: hash(original),
    afterHash: hash(updated),
    diff: diffTruncated ? `${fullDiff.slice(0, MAX_DIFF_CHARACTERS)}\n… diff truncated` : fullDiff,
    diffTruncated
  }
}
