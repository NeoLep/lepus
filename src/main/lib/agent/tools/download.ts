import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { resolveFilePath } from './file-system'
import { validatePublicHttpUrl } from './network-security'
import { inspectFileHeader } from './file-inspection'

const MAX_REDIRECTS = 5
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024
const ABSOLUTE_MAX_BYTES = 500 * 1024 * 1024

export type DownloadProgress = { bytesReceived: number; totalBytes?: number; percent?: number }

function safeFilename(value: string): string {
  const cleaned = [...value]
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character
    )
    .join('')
    .replace(/^\.+$/, '_')
    .trim()
  return cleaned.slice(0, 180) || 'download'
}

function filenameFromResponse(response: Response, url: URL): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  let candidate = encoded ? decodeURIComponent(encoded) : plain
  if (!candidate) candidate = path.basename(decodeURIComponent(url.pathname)) || 'download'
  return safeFilename(candidate)
}

async function fetchPublic(
  urlValue: string,
  signal?: AbortSignal
): Promise<{ response: Response; url: URL }> {
  let url = await validatePublicHttpUrl(urlValue)
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': 'Lepus/1.0' }
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url }
    if (redirects === MAX_REDIRECTS) throw new Error('下载重定向次数过多')
    const location = response.headers.get('location')
    if (!location) throw new Error('重定向响应缺少 Location')
    await response.body?.cancel()
    url = await validatePublicHttpUrl(new URL(location, url).toString())
  }
  throw new Error('下载重定向次数过多')
}

export async function downloadFile(
  input: { url: string; destinationPath?: string; workspacePath: string; maxBytes?: number },
  signal?: AbortSignal,
  onProgress?: (progress: DownloadProgress) => void
): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(120_000)
  const downloadSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  if (maxBytes > ABSOLUTE_MAX_BYTES) throw new Error(`max_bytes 不能超过 ${ABSOLUTE_MAX_BYTES}`)
  const { response, url } = await fetchPublic(input.url, downloadSignal)
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
  const declaredSize = Number(response.headers.get('content-length'))
  const totalBytes = Number.isFinite(declaredSize) && declaredSize >= 0 ? declaredSize : undefined
  if (totalBytes !== undefined && totalBytes > maxBytes)
    throw new Error(`资源超过下载上限 ${maxBytes} 字节`)
  const requestedPath = input.destinationPath?.trim()
  const outputPath = resolveFilePath(
    requestedPath || filenameFromResponse(response, url),
    input.workspacePath
  )
  await mkdir(path.dirname(outputPath), { recursive: true })
  try {
    await lstat(outputPath)
    throw new Error('目标文件已存在，下载不会覆盖已有文件')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${randomUUID()}.part`
  )
  const hash = createHash('sha256')
  let bytesReceived = 0
  let lastReported = 0
  const headerChunks: Buffer[] = []
  let headerBytes = 0
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesReceived += chunk.length
      if (bytesReceived > maxBytes) return callback(new Error(`资源超过下载上限 ${maxBytes} 字节`))
      hash.update(chunk)
      if (headerBytes < 64 * 1024) {
        const selected = chunk.subarray(0, Math.min(chunk.length, 64 * 1024 - headerBytes))
        headerChunks.push(selected)
        headerBytes += selected.length
      }
      if (bytesReceived - lastReported >= 64 * 1024 || bytesReceived === totalBytes) {
        lastReported = bytesReceived
        onProgress?.({
          bytesReceived,
          ...(totalBytes === undefined
            ? {}
            : { totalBytes, percent: Math.min(100, (bytesReceived / totalBytes) * 100) })
        })
      }
      callback(null, chunk)
    }
  })
  try {
    onProgress?.({
      bytesReceived: 0,
      ...(totalBytes === undefined ? {} : { totalBytes, percent: 0 })
    })
    await pipeline(
      Readable.fromWeb(response.body as never),
      meter,
      createWriteStream(temporaryPath, { flags: 'wx' }),
      { signal: downloadSignal }
    )
    await rename(temporaryPath, outputPath)
    onProgress?.({
      bytesReceived,
      ...(totalBytes === undefined ? {} : { totalBytes, percent: 100 })
    })
    const declaredMimeType =
      response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream'
    const inspection = inspectFileHeader(Buffer.concat(headerChunks), outputPath)
    const warnings = [...inspection.warnings]
    if (
      declaredMimeType !== 'application/octet-stream' &&
      declaredMimeType !== inspection.detectedMimeType
    ) {
      warnings.push(
        `服务器声明类型 ${declaredMimeType} 与检测类型 ${inspection.detectedMimeType} 不一致`
      )
    }
    return {
      path: outputPath,
      filename: path.basename(outputPath),
      bytes: bytesReceived,
      mimeType: declaredMimeType,
      detectedMimeType: inspection.detectedMimeType,
      category: inspection.category,
      dangerous: inspection.dangerous,
      archive: inspection.archive,
      warnings,
      sha256: hash.digest('hex'),
      sourceUrl: input.url,
      finalUrl: url.toString()
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}
