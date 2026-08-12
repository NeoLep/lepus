import type { DeepSeekBalance } from '@/ipc/chat/constants'

const DEEPSEEK_API_HOST = 'api.deepseek.com'

export function isOfficialDeepSeekBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === DEEPSEEK_API_HOST &&
      (url.port === '' || url.port === '443') &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function readBalanceString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`DeepSeek 余额响应中的 ${field} 无效`)
  }
  return value
}

export async function queryDeepSeekBalance(apiKey: string): Promise<DeepSeekBalance> {
  const response = await fetch('https://api.deepseek.com/user/balance', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  })

  if (!response.ok) {
    if (response.status === 401) throw new Error('DeepSeek API Key 无效或已失效')
    if (response.status === 403) throw new Error('DeepSeek 拒绝了余额查询请求')
    if (response.status === 429) throw new Error('DeepSeek 请求过于频繁，请稍后再试')
    throw new Error(`DeepSeek 余额查询失败（HTTP ${response.status}）`)
  }

  const payload = (await response.json()) as Record<string, unknown>
  if (typeof payload['is_available'] !== 'boolean' || !Array.isArray(payload['balance_infos'])) {
    throw new Error('DeepSeek 返回了无法识别的余额数据')
  }

  const balances = payload['balance_infos'].map((item) => {
    if (!item || typeof item !== 'object') throw new Error('DeepSeek 返回了无效的余额明细')
    const info = item as Record<string, unknown>
    if (info['currency'] !== 'CNY' && info['currency'] !== 'USD') {
      throw new Error('DeepSeek 返回了不支持的余额币种')
    }
    const currency: 'CNY' | 'USD' = info['currency']
    return {
      currency,
      totalBalance: readBalanceString(info['total_balance'], 'total_balance'),
      grantedBalance: readBalanceString(info['granted_balance'], 'granted_balance'),
      toppedUpBalance: readBalanceString(info['topped_up_balance'], 'topped_up_balance')
    }
  })

  return {
    isAvailable: payload['is_available'],
    balances,
    queriedAt: new Date().toISOString()
  }
}
