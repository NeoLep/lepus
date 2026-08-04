import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { resolveFilePath } from './file-system'

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.output',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target'
])
const MAX_WALKED_ENTRIES = 25_000
const MAX_SEARCHABLE_FILE_BYTES = 1024 * 1024

type WalkedFile = {
  path: string
  relativePath: string
  size: number
  modifiedAt: string
}

export type SearchFilesArguments = {
  path: string
  workspacePath: string
  pattern: string
  includeHidden?: boolean
  maxResults?: number
}

export type SearchTextArguments = {
  path: string
  workspacePath: string
  query: string
  filePattern?: string
  useRegex?: boolean
  caseSensitive?: boolean
  includeHidden?: boolean
  maxResults?: number
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replaceAll('\\', '/')
  let expression = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]
    if (character === '*') {
      if (normalized[index + 1] === '*') {
        index += 1
        if (normalized[index + 1] === '/') {
          index += 1
          expression += '(?:.*/)?'
        } else {
          expression += '.*'
        }
      } else {
        expression += '[^/]*'
      }
    } else if (character === '?') {
      expression += '[^/]'
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`${expression}$`)
}

function shouldSkipName(name: string, includeHidden: boolean): boolean {
  if (!includeHidden && name.startsWith('.')) return true
  return DEFAULT_IGNORED_DIRECTORIES.has(name)
}

async function walkFiles(
  rootPath: string,
  includeHidden: boolean,
  signal?: AbortSignal
): Promise<{ files: WalkedFile[]; truncated: boolean; skipped: number }> {
  const rootInfo = await lstat(rootPath)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('搜索路径必须是普通文件夹，且不允许将符号链接作为搜索根目录')
  }

  const files: WalkedFile[] = []
  const pendingDirectories = [rootPath]
  let walkedEntries = 0
  let skipped = 0

  while (pendingDirectories.length) {
    signal?.throwIfAborted()
    const directory = pendingDirectories.pop()!
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      skipped += 1
      continue
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      signal?.throwIfAborted()
      walkedEntries += 1
      if (walkedEntries > MAX_WALKED_ENTRIES) {
        return { files, truncated: true, skipped }
      }
      if (shouldSkipName(entry.name, includeHidden)) continue
      const entryPath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        skipped += 1
        continue
      }
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath)
        continue
      }
      if (!entry.isFile()) {
        skipped += 1
        continue
      }
      try {
        const info = await lstat(entryPath)
        files.push({
          path: entryPath,
          relativePath: path.relative(rootPath, entryPath).replaceAll(path.sep, '/'),
          size: info.size,
          modifiedAt: info.mtime.toISOString()
        })
      } catch {
        skipped += 1
      }
    }
  }

  return { files, truncated: false, skipped }
}

function normalizedLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('max_results 必须是 1 到 500 之间的整数')
  }
  return limit
}

export async function searchFiles(
  input: SearchFilesArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const rootPath = resolveFilePath(input.path, input.workspacePath)
  const matcher = globToRegExp(input.pattern)
  const maxResults = normalizedLimit(input.maxResults, 100)
  const walked = await walkFiles(rootPath, input.includeHidden ?? false, signal)
  const matched = walked.files.filter((file) => matcher.test(file.relativePath))
  return {
    path: rootPath,
    pattern: input.pattern,
    results: matched.slice(0, maxResults),
    totalMatches: matched.length,
    truncated: walked.truncated || matched.length > maxResults,
    skipped: walked.skipped
  }
}

function lineMatches(
  line: string,
  query: string,
  useRegex: boolean,
  caseSensitive: boolean,
  expression?: RegExp
): Array<{ column: number; match: string }> {
  if (useRegex) {
    if (!expression) return []
    expression.lastIndex = 0
    const matches: Array<{ column: number; match: string }> = []
    let match: RegExpExecArray | null
    while ((match = expression.exec(line))) {
      matches.push({ column: match.index + 1, match: match[0] })
      if (!match[0]) expression.lastIndex += 1
    }
    return matches
  }

  const haystack = caseSensitive ? line : line.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const matches: Array<{ column: number; match: string }> = []
  let fromIndex = 0
  while (fromIndex <= haystack.length) {
    const index = haystack.indexOf(needle, fromIndex)
    if (index === -1) break
    matches.push({ column: index + 1, match: line.slice(index, index + query.length) })
    fromIndex = index + Math.max(needle.length, 1)
  }
  return matches
}

function validateSearchRegex(query: string): void {
  if (query.length > 1000) throw new Error('正则表达式不能超过 1000 个字符')
  if (/(\([^)]*[*+][^)]*\))\s*(?:[*+]|\{\d)/.test(query)) {
    throw new Error('正则表达式包含可能导致性能问题的嵌套量词')
  }
  new RegExp(query)
}

export async function searchText(
  input: SearchTextArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (!input.query) throw new Error('query 不能为空')
  if (input.useRegex) validateSearchRegex(input.query)
  const searchExpression = input.useRegex
    ? new RegExp(input.query, `${input.caseSensitive ? '' : 'i'}g`)
    : undefined
  const rootPath = resolveFilePath(input.path, input.workspacePath)
  const fileMatcher = globToRegExp(input.filePattern ?? '**/*')
  const maxResults = normalizedLimit(input.maxResults, 100)
  const walked = await walkFiles(rootPath, input.includeHidden ?? false, signal)
  const results: Array<Record<string, unknown>> = []
  let skipped = walked.skipped

  for (const file of walked.files) {
    if (results.length >= maxResults) break
    if (!fileMatcher.test(file.relativePath) || file.size > MAX_SEARCHABLE_FILE_BYTES) {
      if (file.size > MAX_SEARCHABLE_FILE_BYTES) skipped += 1
      continue
    }
    signal?.throwIfAborted()
    try {
      const content = await readFile(file.path, 'utf8')
      if (content.includes('\0')) {
        skipped += 1
        continue
      }
      const lines = content.split(/\r?\n/)
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]
        const matches = lineMatches(
          line,
          input.query,
          input.useRegex ?? false,
          input.caseSensitive ?? false,
          searchExpression
        )
        for (const match of matches) {
          results.push({
            path: file.path,
            relativePath: file.relativePath,
            line: lineIndex + 1,
            column: match.column,
            match: match.match,
            preview: line.length > 500 ? `${line.slice(0, 500)}…` : line
          })
          if (results.length >= maxResults) break
        }
        if (results.length >= maxResults) break
      }
    } catch {
      skipped += 1
    }
  }

  return {
    path: rootPath,
    query: input.query,
    filePattern: input.filePattern ?? '**/*',
    useRegex: input.useRegex ?? false,
    caseSensitive: input.caseSensitive ?? false,
    results,
    truncated: walked.truncated || results.length >= maxResults,
    skipped
  }
}
