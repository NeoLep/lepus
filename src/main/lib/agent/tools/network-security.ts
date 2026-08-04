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

export async function validatePublicHttpUrl(value: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('url 必须是有效的绝对 URL')
  }
  if (url.protocol !== 'https:') throw new Error('仅允许 HTTPS 下载')
  if (url.username || url.password) throw new Error('URL 不允许包含用户名或密码')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error('不允许访问本机或元数据服务')
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isUnsafeNetworkAddress(address))) {
    throw new Error('目标解析到本机、内网、保留或不可公开路由的地址')
  }
  return url
}
