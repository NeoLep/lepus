import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal'])

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
}

function inIpv4Range(address: string, network: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask)
}

export function isUnsafeNetworkAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4]
    ].some(([network, bits]) => inIpv4Range(address, network as string, bits as number))
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    if (normalized === '::' || normalized === '::1') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized))
      return true
    if (normalized.startsWith('ff')) return true
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    return mapped ? isUnsafeNetworkAddress(mapped) : false
  }
  return true
}

export function isPrivateNetworkAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return [
      ['10.0.0.0', 8],
      ['172.16.0.0', 12],
      ['192.168.0.0', 16]
    ].some(([network, bits]) => inIpv4Range(address, network as string, bits as number))
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    return mapped ? isPrivateNetworkAddress(mapped) : false
  }
  return false
}

function parseHttpUrl(value: string, allowHttp: boolean): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('url 必须是有效的绝对 URL')
  }
  const allowedProtocols = allowHttp ? new Set(['http:', 'https:']) : new Set(['https:'])
  if (!allowedProtocols.has(url.protocol)) {
    throw new Error(allowHttp ? '仅允许 HTTP 或 HTTPS 地址' : '仅允许 HTTPS 地址')
  }
  if (url.username || url.password) throw new Error('URL 不允许包含用户名或密码')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error('不允许访问本机或元数据服务')
  }
  return url
}

export function normalizeTrustedBrowserOrigin(value: string): string {
  const url = parseHttpUrl(value.trim(), true)
  return url.origin
}

export function normalizeTrustedBrowserOrigins(values: string[]): string[] {
  if (values.length > 50) throw new Error('信任地址最多添加 50 个')
  return [
    ...new Set(
      values.map((value) => {
        if (typeof value !== 'string' || value.length > 2048) {
          throw new Error('信任地址必须是长度不超过 2048 的字符串')
        }
        return normalizeTrustedBrowserOrigin(value)
      })
    )
  ]
}

export function isTrustedBrowserUrl(value: string, trustedOrigins: string[]): boolean {
  try {
    return trustedOrigins.includes(normalizeTrustedBrowserOrigin(value))
  } catch {
    return false
  }
}

export async function validatePublicHttpUrl(value: string): Promise<URL> {
  const url = parseHttpUrl(value, false)
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isUnsafeNetworkAddress(address))) {
    throw new Error('目标解析到本机、内网、保留或不可公开路由的地址')
  }
  return url
}

export async function validateBrowserHttpUrl(
  value: string,
  options: { allowPrivate: boolean }
): Promise<URL> {
  const url = parseHttpUrl(value, true)
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length) throw new Error('目标地址无法解析')
  const blockedAddress = addresses.find(
    ({ address }) =>
      isUnsafeNetworkAddress(address) && !(options.allowPrivate && isPrivateNetworkAddress(address))
  )
  if (blockedAddress) {
    throw new Error(
      options.allowPrivate
        ? '目标解析到本机、链路本地、保留或其他禁止访问的地址'
        : '目标解析到内网、本机、保留或不可公开路由的地址；局域网页面请使用 browser_open_private 并获得用户确认'
    )
  }
  return url
}
