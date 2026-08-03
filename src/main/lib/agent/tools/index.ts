import { randomUUID } from 'node:crypto'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { SearchProviderConfig, SearchProviderId } from '@/ipc/chat/constants'
import { calculateExpression } from './calculator'
import { searchWeb } from './web-search'

type JsonObject = Record<string, unknown>

export type FunctionTool = {
  schema: ChatCompletionTool
  execute: (argumentsValue: JsonObject) => unknown | Promise<unknown>
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} 必须是非空字符串`)
  return value.trim()
}

function optionalInteger(value: unknown, name: string, defaultValue: number): number {
  if (value === undefined) return defaultValue
  if (!Number.isInteger(value)) throw new Error(`${name} 必须是整数`)
  return value as number
}

function createTool(
  name: string,
  description: string,
  parameters: JsonObject,
  execute: FunctionTool['execute']
): FunctionTool {
  return {
    schema: { type: 'function', function: { name, description, parameters } },
    execute
  }
}

const baseTools = [
  createTool(
    'get_current_time',
    '获取当前日期和时间。用户询问当前时间、日期或某个时区的时间时使用。',
    {
      type: 'object',
      properties: {
        time_zone: {
          type: 'string',
          description: '可选的 IANA 时区名称，例如 Asia/Shanghai、Europe/London'
        }
      },
      additionalProperties: false
    },
    ({ time_zone: timeZone }) => {
      if (timeZone !== undefined && typeof timeZone !== 'string') {
        throw new Error('time_zone 必须是字符串')
      }
      const resolvedTimeZone = timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date()
      let localTime: string
      try {
        localTime = new Intl.DateTimeFormat('zh-CN', {
          timeZone: resolvedTimeZone,
          dateStyle: 'full',
          timeStyle: 'long'
        }).format(now)
      } catch {
        throw new Error(`无效的时区：${resolvedTimeZone}`)
      }
      return { iso: now.toISOString(), timeZone: resolvedTimeZone, localTime }
    }
  ),
  createTool(
    'calculate',
    '安全地计算算术表达式。支持括号、+、-、*、/、%、^ 和科学计数法。',
    {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '要计算的算术表达式，例如 (12.5 + 7.5) * 3' }
      },
      required: ['expression'],
      additionalProperties: false
    },
    ({ expression }) => ({
      expression,
      result: calculateExpression(requireString(expression, 'expression'))
    })
  ),
  createTool(
    'generate_uuid',
    '生成一个随机 UUID v4。用户需要唯一标识符、请求 ID 或示例 UUID 时使用。',
    { type: 'object', properties: {}, additionalProperties: false },
    () => ({ uuid: randomUUID() })
  )
] satisfies FunctionTool[]

function createSearchTool(configs: SearchProviderConfig[]): FunctionTool | null {
  const enabledConfigs = configs.filter((config) => config.enabled)
  if (!enabledConfigs.length) return null
  const configByProvider = new Map(enabledConfigs.map((config) => [config.provider, config]))
  const providers = enabledConfigs.map((config) => config.provider)
  return createTool(
    'search_web',
    `搜索公开互联网，返回网页标题、链接和摘要。当前可用服务：${providers.join(', ')}。涉及新闻、时效性信息或需要来源时使用。`,
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: '简洁、具体的搜索关键词，不要包含敏感信息' },
        provider: {
          type: 'string',
          enum: providers,
          description: '使用的搜索服务；省略时使用第一个已启用服务'
        },
        max_results: {
          type: 'integer',
          description: '返回结果数量，默认为 5',
          minimum: 1,
          maximum: 10
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    async ({ query, provider, max_results: maxResults }) => {
      const normalizedQuery = requireString(query, 'query')
      if (normalizedQuery.length > 500) throw new Error('query 不能超过 500 个字符')
      const selectedProvider =
        provider === undefined ? providers[0] : requireString(provider, 'provider')
      const config = configByProvider.get(selectedProvider as SearchProviderId)
      if (!config) throw new Error(`搜索服务未启用：${selectedProvider}`)
      const limit = optionalInteger(maxResults, 'max_results', 5)
      if (limit < 1 || limit > 10) throw new Error('max_results 必须在 1 到 10 之间')
      return searchWeb(normalizedQuery, limit, config)
    }
  )
}

export function createFunctionToolRuntime(searchConfigs: SearchProviderConfig[]) {
  const searchTool = createSearchTool(searchConfigs)
  const tools = searchTool ? [...baseTools, searchTool] : baseTools
  const toolMap = new Map(
    tools.map((tool) => {
      if (tool.schema.type !== 'function') throw new Error('仅支持 function 类型工具')
      return [tool.schema.function.name, tool] as const
    })
  )
  return {
    schemas: tools.map((tool) => tool.schema),
    async execute(name: string, rawArguments: string): Promise<string> {
      const tool = toolMap.get(name)
      if (!tool) return JSON.stringify({ ok: false, error: `未知工具：${name}` })

      try {
        const parsed: unknown = JSON.parse(rawArguments || '{}')
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('工具参数必须是 JSON 对象')
        }
        const data = await tool.execute(parsed as JsonObject)
        return JSON.stringify({ ok: true, data })
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
}
