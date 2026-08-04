import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import { resolveFilePath } from './file-system'

const HEADER_BYTES = 64 * 1024
const ARCHIVE_EXTENSIONS = new Set(['.7z', '.bz2', '.gz', '.rar', '.tar', '.tgz', '.xz', '.zip'])
const EXECUTABLE_EXTENSIONS = new Set([
  '.app',
  '.apk',
  '.bat',
  '.cmd',
  '.com',
  '.dmg',
  '.exe',
  '.iso',
  '.jar',
  '.js',
  '.msi',
  '.pkg',
  '.ps1',
  '.sh'
])

export type FileKind = {
  detectedMimeType: string
  detectedExtension?: string
  category: 'text' | 'image' | 'pdf' | 'archive' | 'executable' | 'binary' | 'unknown'
  dangerous: boolean
  archive: boolean
  warnings: string[]
  image?: { width: number; height: number }
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((value, index) => buffer[index] === value)
}

function jpegSize(buffer: Buffer): { width: number; height: number } | undefined {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if (length < 2) break
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return undefined
}

export function inspectFileHeader(buffer: Buffer, filename = ''): FileKind {
  const extension = path.extname(filename).toLowerCase()
  let detectedMimeType = 'application/octet-stream'
  let detectedExtension: string | undefined
  let category: FileKind['category'] = 'unknown'
  let image: FileKind['image']

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    detectedMimeType = 'image/png'
    detectedExtension = '.png'
    category = 'image'
    if (buffer.length >= 24)
      image = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  } else if (
    buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
  ) {
    detectedMimeType = 'image/gif'
    detectedExtension = '.gif'
    category = 'image'
    if (buffer.length >= 10)
      image = { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  } else if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    detectedMimeType = 'image/jpeg'
    detectedExtension = '.jpg'
    category = 'image'
    image = jpegSize(buffer)
  } else if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    detectedMimeType = 'image/webp'
    detectedExtension = '.webp'
    category = 'image'
  } else if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    detectedMimeType = 'application/pdf'
    detectedExtension = '.pdf'
    category = 'pdf'
  } else if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])
  ) {
    detectedMimeType = 'application/zip'
    detectedExtension = '.zip'
    category = 'archive'
  } else if (startsWith(buffer, [0x1f, 0x8b])) {
    detectedMimeType = 'application/gzip'
    detectedExtension = '.gz'
    category = 'archive'
  } else if (startsWith(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    detectedMimeType = 'application/vnd.rar'
    detectedExtension = '.rar'
    category = 'archive'
  } else if (startsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    detectedMimeType = 'application/x-7z-compressed'
    detectedExtension = '.7z'
    category = 'archive'
  } else if (buffer.length > 262 && buffer.subarray(257, 262).toString('ascii') === 'ustar') {
    detectedMimeType = 'application/x-tar'
    detectedExtension = '.tar'
    category = 'archive'
  } else if (startsWith(buffer, [0x4d, 0x5a]) || startsWith(buffer, [0x7f, 0x45, 0x4c, 0x46])) {
    detectedMimeType = 'application/x-executable'
    category = 'executable'
  } else if (!buffer.includes(0) && buffer.length > 0) {
    detectedMimeType = 'text/plain'
    category = 'text'
  } else if (buffer.length > 0) {
    category = 'binary'
  }

  const archive = category === 'archive' || ARCHIVE_EXTENSIONS.has(extension)
  const dangerous = category === 'executable' || EXECUTABLE_EXTENSIONS.has(extension) || archive
  const warnings: string[] = []
  if (archive) warnings.push('压缩包内容未检查，本应用不支持预览或解压')
  if (category === 'executable' || EXECUTABLE_EXTENSIONS.has(extension))
    warnings.push('文件可能包含可执行代码，请勿在不信任来源时打开')
  if (
    detectedExtension &&
    extension &&
    extension !== detectedExtension &&
    !(detectedExtension === '.jpg' && extension === '.jpeg')
  ) {
    warnings.push(`扩展名 ${extension} 与检测类型 ${detectedExtension} 不一致`)
  }
  return {
    detectedMimeType,
    ...(detectedExtension ? { detectedExtension } : {}),
    category,
    dangerous,
    archive,
    warnings,
    ...(image ? { image } : {})
  }
}

async function sha256File(filePath: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath, { signal })) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

export async function inspectFile(
  input: { path: string; workspacePath: string; includeHash?: boolean },
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const filePath = resolveFilePath(input.path, input.workspacePath)
  const info = await lstat(filePath)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('只能检查普通文件，且不允许符号链接')
  const handle = await open(filePath, 'r')
  const header = Buffer.alloc(Math.min(HEADER_BYTES, info.size))
  try {
    await handle.read(header, 0, header.length, 0)
  } finally {
    await handle.close()
  }
  signal?.throwIfAborted()
  const kind = inspectFileHeader(header, filePath)
  return {
    path: filePath,
    name: path.basename(filePath),
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
    extension: path.extname(filePath).toLowerCase(),
    ...kind,
    ...(input.includeHash === false ? {} : { sha256: await sha256File(filePath, signal) })
  }
}
