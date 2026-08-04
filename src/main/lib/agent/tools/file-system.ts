import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import { constants as fsConstants, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const MAX_FILE_BYTES = 1024 * 1024
const DEFAULT_MAX_CHARACTERS = 100_000
const MAX_RETURNED_CHARACTERS = 500_000

export type ReadFileArguments = {
  path: string
  workspacePath: string
  startLine?: number
  endLine?: number
  maxCharacters?: number
}

export type WriteFileArguments = {
  path: string
  workspacePath: string
  content: string
  mode: 'create' | 'overwrite' | 'append'
}

export type ListDirectoryArguments = {
  path: string
  workspacePath: string
  includeHidden?: boolean
  maxEntries?: number
}

export type DeletePathArguments = {
  path: string
  workspacePath: string
}

export type CreateDirectoryArguments = {
  path: string
  workspacePath: string
  recursive?: boolean
}

export type TransferFileArguments = {
  sourcePath: string
  destinationPath: string
  workspacePath: string
}

export function resolveFilePath(value: string, workspacePath: string): string {
  if (!workspacePath) throw new Error('请先在“文件与权限”设置中选择工作文件夹')
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(workspacePath, value))
}

export function isPathInsideWorkspace(filePath: string, workspacePath: string): boolean {
  if (!workspacePath) return false
  const canonicalize = (value: string): string => {
    try {
      return realpathSync(value)
    } catch {
      try {
        return path.join(realpathSync(path.dirname(value)), path.basename(value))
      } catch {
        return path.resolve(value)
      }
    }
  }
  const relative = path.relative(canonicalize(workspacePath), canonicalize(filePath))
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

function requirePositiveInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} 必须是大于 0 的整数`)
  return value
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export async function readTextFile(
  input: ReadFileArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const filePath = resolveFilePath(input.path, input.workspacePath)
  const startLine = requirePositiveInteger(input.startLine, 'start_line') ?? 1
  const endLine = requirePositiveInteger(input.endLine, 'end_line')
  if (endLine !== undefined && endLine < startLine) {
    throw new Error('end_line 不能小于 start_line')
  }
  const maxCharacters =
    requirePositiveInteger(input.maxCharacters, 'max_characters') ?? DEFAULT_MAX_CHARACTERS
  if (maxCharacters > MAX_RETURNED_CHARACTERS) {
    throw new Error(`max_characters 不能超过 ${MAX_RETURNED_CHARACTERS}`)
  }

  const fileInfo = await lstat(filePath)
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error('只能读取普通文件，且不允许符号链接')
  }
  if (fileInfo.size > MAX_FILE_BYTES) {
    throw new Error(`文件超过读取上限 ${MAX_FILE_BYTES} 字节`)
  }

  const content = await readFile(filePath, { encoding: 'utf8', signal })
  if (content.includes('\0')) throw new Error('暂不支持读取二进制文件')
  const lines = content.split(/\r?\n/)
  const selected = lines.slice(startLine - 1, endLine).join('\n')
  const truncated = selected.length > maxCharacters

  return {
    path: filePath,
    size: fileInfo.size,
    startLine,
    endLine: Math.min(endLine ?? lines.length, lines.length),
    totalLines: lines.length,
    truncated,
    content: truncated ? selected.slice(0, maxCharacters) : selected
  }
}

export async function writeTextFile(
  input: WriteFileArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const filePath = resolveFilePath(input.path, input.workspacePath)
  const bytes = byteLength(input.content)
  if (bytes > MAX_FILE_BYTES) throw new Error(`写入内容不能超过 ${MAX_FILE_BYTES} 字节`)

  if (input.mode !== 'create') {
    const targetInfo = await lstat(filePath)
    if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) {
      throw new Error('只能覆盖或追加普通文件，且不允许符号链接')
    }
  }

  if (input.mode === 'append') {
    signal?.throwIfAborted()
    await appendFile(filePath, input.content, { encoding: 'utf8' })
  } else {
    await writeFile(filePath, input.content, {
      encoding: 'utf8',
      flag: input.mode === 'create' ? 'wx' : 'w',
      signal
    })
  }

  const fileInfo = await stat(filePath)
  return { path: filePath, mode: input.mode, bytesWritten: bytes, size: fileInfo.size }
}

export async function listDirectory(
  input: ListDirectoryArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const directoryPath = resolveFilePath(input.path, input.workspacePath)
  const maxEntries = input.maxEntries ?? 200
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) {
    throw new Error('max_entries 必须是 1 到 1000 之间的整数')
  }
  const directoryInfo = await lstat(directoryPath)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error('只能读取普通文件夹，且不允许将符号链接作为目标文件夹')
  }

  signal?.throwIfAborted()
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true })
  const visibleEntries = input.includeHidden
    ? directoryEntries
    : directoryEntries.filter((entry) => !entry.name.startsWith('.'))
  visibleEntries.sort((left, right) => {
    const leftDirectory = left.isDirectory() ? 0 : 1
    const rightDirectory = right.isDirectory() ? 0 : 1
    return leftDirectory - rightDirectory || left.name.localeCompare(right.name)
  })
  const selectedEntries = visibleEntries.slice(0, maxEntries)
  const entries = await Promise.all(
    selectedEntries.map(async (entry) => {
      signal?.throwIfAborted()
      const entryPath = path.join(directoryPath, entry.name)
      const entryInfo = await lstat(entryPath)
      return {
        name: entry.name,
        path: entryPath,
        type: entry.isSymbolicLink()
          ? 'symlink'
          : entry.isDirectory()
            ? 'directory'
            : entry.isFile()
              ? 'file'
              : 'other',
        size: entryInfo.size,
        modifiedAt: entryInfo.mtime.toISOString()
      }
    })
  )

  return {
    path: directoryPath,
    entries,
    totalEntries: visibleEntries.length,
    truncated: visibleEntries.length > selectedEntries.length,
    hiddenExcluded: !input.includeHidden
  }
}

export async function createDirectory(
  input: CreateDirectoryArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const directoryPath = resolveFilePath(input.path, input.workspacePath)
  const recursive = input.recursive ?? false
  signal?.throwIfAborted()

  try {
    const existing = await lstat(directoryPath)
    if (recursive && existing.isDirectory() && !existing.isSymbolicLink()) {
      return { path: directoryPath, recursive, created: false, alreadyExisted: true }
    }
    throw new Error('目标路径已存在，无法创建文件夹')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }

  await mkdir(directoryPath, { recursive })
  const createdInfo = await lstat(directoryPath)
  if (!createdInfo.isDirectory() || createdInfo.isSymbolicLink()) {
    throw new Error('创建后的目标不是普通文件夹')
  }
  return { path: directoryPath, recursive, created: true, alreadyExisted: false }
}

async function validateFileTransfer(input: TransferFileArguments): Promise<{
  sourcePath: string
  destinationPath: string
  size: number
}> {
  const sourcePath = resolveFilePath(input.sourcePath, input.workspacePath)
  const destinationPath = resolveFilePath(input.destinationPath, input.workspacePath)
  const sourceInfo = await lstat(sourcePath)
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
    throw new Error('源路径必须是普通文件，且不允许符号链接')
  }

  const destinationParent = path.dirname(destinationPath)
  const parentInfo = await lstat(destinationParent)
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error('目标父路径必须是已存在的普通文件夹')
  }

  const canonicalSource = realpathSync(sourcePath)
  const canonicalDestination = path.join(
    realpathSync(destinationParent),
    path.basename(destinationPath)
  )
  const normalizeForComparison = (value: string): string =>
    process.platform === 'win32' ? value.toLocaleLowerCase() : value
  if (normalizeForComparison(canonicalSource) === normalizeForComparison(canonicalDestination)) {
    throw new Error('源文件和目标文件不能是同一路径')
  }

  try {
    await lstat(destinationPath)
    throw new Error('目标路径已存在；为避免覆盖，请使用新的目标文件名')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }

  return { sourcePath, destinationPath, size: sourceInfo.size }
}

export async function copyRegularFile(
  input: TransferFileArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const transfer = await validateFileTransfer(input)
  signal?.throwIfAborted()
  await copyFile(transfer.sourcePath, transfer.destinationPath, fsConstants.COPYFILE_EXCL)
  return { ...transfer, operation: 'copy' }
}

export async function moveRegularFile(
  input: TransferFileArguments,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const transfer = await validateFileTransfer(input)
  signal?.throwIfAborted()
  try {
    await rename(transfer.sourcePath, transfer.destinationPath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EXDEV') {
      throw new Error('暂不支持跨磁盘移动；请先复制文件，再将原文件移入废纸篓')
    }
    throw error
  }
  return { ...transfer, operation: 'move' }
}

export async function validateDeleteTarget(
  input: DeletePathArguments
): Promise<{ path: string; name: string; type: 'file' | 'directory' | 'symlink' | 'other' }> {
  const targetPath = resolveFilePath(input.path, input.workspacePath)
  const resolvedTarget = path.resolve(targetPath)
  const workspaceRoot = path.resolve(input.workspacePath)
  const filesystemRoot = path.parse(resolvedTarget).root
  const userHome = path.resolve(homedir())
  const targetContainsWorkspace = isPathInsideWorkspace(workspaceRoot, resolvedTarget)

  if (
    resolvedTarget === filesystemRoot ||
    resolvedTarget === userHome ||
    resolvedTarget === workspaceRoot ||
    targetContainsWorkspace
  ) {
    throw new Error('禁止删除磁盘根目录、用户主目录、工作文件夹或其父目录')
  }

  const targetInfo = await lstat(targetPath)
  return {
    path: targetPath,
    name: path.basename(targetPath),
    type: targetInfo.isSymbolicLink()
      ? 'symlink'
      : targetInfo.isDirectory()
        ? 'directory'
        : targetInfo.isFile()
          ? 'file'
          : 'other'
  }
}
