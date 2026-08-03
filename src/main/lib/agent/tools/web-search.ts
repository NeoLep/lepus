import type { SearchProviderConfig, SearchProviderId } from '@/ipc/chat/constants'

export type WebSearchResult = {
  title: string
  url: string
  snippet: string
  publishedAt?: string
}

type SearchResponse = {
  provider: SearchProviderId
  query: string
  results: WebSearchResult[]
}

const SEARCH_TIMEOUT_MS = 15_000

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function resultFrom(
  value: unknown,
  fields: { title: string; url: string; snippet: string; publishedAt?: string }
): WebSearchResult | null {
  const item = asRecord(value)
  const title = asString(item[fields.title]).trim()
  const url = asString(item[fields.url]).trim()
  if (!title || !url) return null
  try {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null
  } catch {
    return null
  }
  const publishedAt = fields.publishedAt ? asString(item[fields.publishedAt]).trim() : ''
  return {
    title,
    url,
    snippet: asString(item[fields.snippet]).trim(),
    ...(publishedAt ? { publishedAt } : {})
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      ...init?.headers
    }
  })
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300)
    throw new Error(`搜索服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`)
  }
  return response.json()
}

function requireApiKey(config: SearchProviderConfig): string {
  const value = config.apiKey.trim()
  if (!value) throw new Error(`${config.provider} API Key 未配置`)
  return value
}

async function searchBrave(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<WebSearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))
  const payload = asRecord(
    await requestJson(url.toString(), {
      headers: { 'X-Subscription-Token': requireApiKey(config) }
    })
  )
  return asArray(asRecord(payload['web'])['results'])
    .map((item) => resultFrom(item, { title: 'title', url: 'url', snippet: 'description' }))
    .filter((item): item is WebSearchResult => item !== null)
    .slice(0, limit)
}

async function searchTavily(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<WebSearchResult[]> {
  const payload = asRecord(
    await requestJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireApiKey(config)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, max_results: limit, search_depth: 'basic' })
    })
  )
  return asArray(payload['results'])
    .map((item) =>
      resultFrom(item, {
        title: 'title',
        url: 'url',
        snippet: 'content',
        publishedAt: 'published_date'
      })
    )
    .filter((item): item is WebSearchResult => item !== null)
    .slice(0, limit)
}

async function searchExa(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<WebSearchResult[]> {
  const payload = asRecord(
    await requestJson('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': requireApiKey(config),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        numResults: limit,
        contents: { highlights: { maxCharacters: 800 } }
      })
    })
  )
  return asArray(payload['results'])
    .map((value) => {
      const item = asRecord(value)
      const highlights = asArray(item['highlights']).map(asString).filter(Boolean).join(' ')
      return resultFrom(
        { ...item, snippet: highlights || asString(item['text']) },
        {
          title: 'title',
          url: 'url',
          snippet: 'snippet',
          publishedAt: 'publishedDate'
        }
      )
    })
    .filter((item): item is WebSearchResult => item !== null)
    .slice(0, limit)
}

async function searchPerplexity(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<WebSearchResult[]> {
  const payload = asRecord(
    await requestJson('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireApiKey(config)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, max_results: limit })
    })
  )
  return asArray(payload['results'])
    .map((item) =>
      resultFrom(item, {
        title: 'title',
        url: 'url',
        snippet: 'snippet',
        publishedAt: 'date'
      })
    )
    .filter((item): item is WebSearchResult => item !== null)
    .slice(0, limit)
}

async function searchFirecrawl(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<WebSearchResult[]> {
  const payload = asRecord(
    await requestJson('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireApiKey(config)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, limit, sources: ['web'] })
    })
  )
  const data = asRecord(payload['data'])
  return asArray(data['web'])
    .map((item) =>
      resultFrom(item, {
        title: 'title',
        url: 'url',
        snippet: 'description'
      })
    )
    .filter((item): item is WebSearchResult => item !== null)
    .slice(0, limit)
}

async function searchSearxng(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<WebSearchResult[]> {
  const baseUrl = new URL(config.baseURL)
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('SEARXNG_URL 只支持 http 或 https 地址')
  }
  const url = new URL('search', baseUrl.toString().endsWith('/') ? baseUrl : `${baseUrl}/`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  const payload = asRecord(await requestJson(url.toString()))
  return asArray(payload['results'])
    .map((item) =>
      resultFrom(item, {
        title: 'title',
        url: 'url',
        snippet: 'content',
        publishedAt: 'publishedDate'
      })
    )
    .filter((item): item is WebSearchResult => item !== null)
    .slice(0, limit)
}

export async function searchWeb(
  query: string,
  limit: number,
  config: SearchProviderConfig
): Promise<SearchResponse> {
  if (!config.enabled) throw new Error(`${config.provider} 搜索未启用`)
  const provider = config.provider
  const search = {
    brave: searchBrave,
    tavily: searchTavily,
    exa: searchExa,
    perplexity: searchPerplexity,
    firecrawl: searchFirecrawl,
    searxng: searchSearxng
  } satisfies Record<SearchProviderId, typeof searchBrave>
  return { provider, query, results: await search[provider](query, limit, config) }
}
