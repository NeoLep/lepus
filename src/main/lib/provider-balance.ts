import type {
  ProviderBalance,
  ProviderBalanceInfo,
  ProviderBalanceProvider
} from '@/ipc/chat/constants'

const PROVIDER_HOSTS: Record<ProviderBalanceProvider, string> = {
  deepseek: 'api.deepseek.com',
  kimi: 'api.moonshot.cn',
  siliconflow: 'api.siliconflow.cn',
  openrouter: 'openrouter.ai'
}

export function detectBalanceProvider(value: string): ProviderBalanceProvider | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      (url.port !== '' && url.port !== '443') ||
      url.username ||
      url.password
    )
      return null
    return (
      (Object.entries(PROVIDER_HOSTS).find(([, host]) => url.hostname === host)?.[0] as
        ProviderBalanceProvider | undefined) ?? null
    )
  } catch {
    return null
  }
}

function numericString(value: unknown, provider: string, field: string): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !Number.isFinite(Number(value))) {
    throw new Error(`${provider} 余额响应中的 ${field} 无效`)
  }
  return String(value)
}

async function request(
  provider: string,
  url: string,
  apiKey: string
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error(`${provider} API Key 无效或已失效`)
    if (response.status === 403) throw new Error(`${provider} 拒绝了余额查询请求`)
    if (response.status === 429) throw new Error(`${provider} 请求过于频繁，请稍后再试`)
    throw new Error(`${provider} 余额查询失败（HTTP ${response.status}）`)
  }
  const payload = await response.json()
  if (!payload || typeof payload !== 'object')
    throw new Error(`${provider} 返回了无法识别的余额数据`)
  return payload as Record<string, unknown>
}

function result(
  provider: ProviderBalanceProvider,
  balances: ProviderBalanceInfo[]
): ProviderBalance {
  return {
    provider,
    isAvailable: balances.some((item) => Number(item.totalBalance) > 0),
    balances,
    queriedAt: new Date().toISOString()
  }
}

export async function queryProviderBalance(
  provider: ProviderBalanceProvider,
  apiKey: string
): Promise<ProviderBalance> {
  if (provider === 'deepseek') {
    const payload = await request('DeepSeek', 'https://api.deepseek.com/user/balance', apiKey)
    if (typeof payload['is_available'] !== 'boolean' || !Array.isArray(payload['balance_infos'])) {
      throw new Error('DeepSeek 返回了无法识别的余额数据')
    }
    const balances = payload['balance_infos'].map((item) => {
      if (!item || typeof item !== 'object') throw new Error('DeepSeek 返回了无效的余额明细')
      const info = item as Record<string, unknown>
      if (info['currency'] !== 'CNY' && info['currency'] !== 'USD') {
        throw new Error('DeepSeek 返回了不支持的余额币种')
      }
      return {
        currency: info['currency'],
        totalBalance: numericString(info['total_balance'], 'DeepSeek', 'total_balance'),
        grantedBalance: numericString(info['granted_balance'], 'DeepSeek', 'granted_balance'),
        toppedUpBalance: numericString(info['topped_up_balance'], 'DeepSeek', 'topped_up_balance')
      } satisfies ProviderBalanceInfo
    })
    return {
      provider,
      isAvailable: payload['is_available'],
      balances,
      queriedAt: new Date().toISOString()
    }
  }

  if (provider === 'kimi') {
    const payload = await request('Kimi', 'https://api.moonshot.cn/v1/users/me/balance', apiKey)
    const data = payload['data']
    if (!data || typeof data !== 'object' || payload['status'] !== true) {
      throw new Error('Kimi 返回了无法识别的余额数据')
    }
    const info = data as Record<string, unknown>
    return result(provider, [
      {
        currency: 'CNY',
        totalBalance: numericString(info['available_balance'], 'Kimi', 'available_balance'),
        grantedBalance: numericString(info['voucher_balance'], 'Kimi', 'voucher_balance'),
        toppedUpBalance: numericString(info['cash_balance'], 'Kimi', 'cash_balance')
      }
    ])
  }

  if (provider === 'siliconflow') {
    const payload = await request('硅基流动', 'https://api.siliconflow.cn/v1/user/info', apiKey)
    const data = payload['data']
    if (!data || typeof data !== 'object' || payload['status'] !== true) {
      throw new Error('硅基流动返回了无法识别的余额数据')
    }
    const info = data as Record<string, unknown>
    return result(provider, [
      {
        currency: 'CNY',
        totalBalance: numericString(info['totalBalance'], '硅基流动', 'totalBalance'),
        grantedBalance: numericString(info['balance'], '硅基流动', 'balance'),
        toppedUpBalance: numericString(info['chargeBalance'], '硅基流动', 'chargeBalance')
      }
    ])
  }

  const payload = await request('OpenRouter', 'https://openrouter.ai/api/v1/key', apiKey)
  const data = payload['data']
  if (!data || typeof data !== 'object') throw new Error('OpenRouter 返回了无法识别的额度数据')
  const info = data as Record<string, unknown>
  const remaining = info['limit_remaining']
  if (remaining === null || remaining === undefined) {
    throw new Error('当前 OpenRouter API Key 未设置额度上限，无法计算剩余额度')
  }
  return result(provider, [
    {
      currency: 'USD',
      totalBalance: numericString(remaining, 'OpenRouter', 'limit_remaining'),
      grantedBalance: '0',
      toppedUpBalance: numericString(remaining, 'OpenRouter', 'limit_remaining')
    }
  ])
}
