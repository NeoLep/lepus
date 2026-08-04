import OpenAI from 'openai'
import {
  Message,
  ModelConfig,
  PermissionSettings,
  SearchCitation,
  SearchProviderConfig,
  SearchProviderId,
  ToolApprovalRequest,
  ToolCallRecord
} from '@/ipc/chat/constants'
import type { AgentInputMessage } from './types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { createFunctionToolRuntime } from './tools'

const MAX_TOOL_ROUNDS = 12

export class Agent {
  public client: OpenAI
  private readonly model: string

  private readonly toolRuntime

  constructor(
    config: ModelConfig,
    searchConfigs: SearchProviderConfig[] = [],
    permissionSettings?: PermissionSettings
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    })
    this.model = config.model
    this.toolRuntime = createFunctionToolRuntime(searchConfigs, permissionSettings)
  }
  async chat(
    message: AgentInputMessage[],
    options?: {
      onContentUpdate?: (content: string) => void
      signal?: AbortSignal
      onToolActivity?: (call: ToolCallRecord) => void
      onToolCancellable?: (toolCallId: string, cancel: (() => void) | null) => void
      onToolApproval?: (
        request: Omit<ToolApprovalRequest, 'sessionId'>
      ) => Promise<'allow_once' | 'allow_session' | 'reject'>
    }
  ) {
    const messages: ChatCompletionMessageParam[] = message.map(
      (item) => ({ role: item.role, content: item.content }) as ChatCompletionMessageParam
    )
    let visibleContent = ''
    let initialPromptTokens: number | null = null
    const toolExecutions: ToolCallRecord[] = []
    const sources: SearchCitation[] = []

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          tools: this.toolRuntime.schemas,
          tool_choice: 'auto',
          stream: true
        },
        { signal: options?.signal }
      )
      let content = ''
      const toolCallParts: Array<{
        id: string
        name: string
        arguments: string
      }> = []

      for await (const chunk of stream) {
        initialPromptTokens ??= chunk.usage?.prompt_tokens ?? null
        const delta = chunk.choices[0]?.delta
        if (!delta) continue
        if (delta.content) {
          content += delta.content
          visibleContent += delta.content
          options?.onContentUpdate?.(visibleContent)
        }
        for (const toolCallDelta of delta.tool_calls ?? []) {
          const part = (toolCallParts[toolCallDelta.index] ??= {
            id: '',
            name: '',
            arguments: ''
          })
          if (toolCallDelta.id) part.id = toolCallDelta.id
          if (toolCallDelta.function?.name) part.name += toolCallDelta.function.name
          if (toolCallDelta.function?.arguments) {
            part.arguments += toolCallDelta.function.arguments
          }
        }
      }

      const toolCalls = toolCallParts
        .filter((part) => Boolean(part))
        .map((part, index) => ({
          id: part.id || `tool-call-${round}-${index}`,
          type: 'function' as const,
          function: { name: part.name, arguments: part.arguments }
        }))
      const responseMessage: ChatCompletionMessageParam = {
        role: 'assistant',
        content: content || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
      }

      if (!toolCalls.length) {
        return {
          message: { role: 'assistant' as const, content: visibleContent },
          promptTokens: initialPromptTokens,
          toolCalls: toolExecutions,
          sources
        }
      }

      messages.push(responseMessage)
      const toolMessages = await Promise.all(
        toolCalls.map(async (toolCall): Promise<ChatCompletionMessageParam> => {
          const baseCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          }
          const approval = this.toolRuntime.getApproval(
            toolCall.function.name,
            toolCall.function.arguments
          )
          if (approval) {
            options?.onToolActivity?.({ ...baseCall, status: 'awaiting_approval' })
            const decision = options?.onToolApproval
              ? await options.onToolApproval({
                  id: `approval-${toolCall.id}`,
                  toolCallId: toolCall.id,
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                  risk: approval.risk,
                  reason: approval.reason,
                  allowSession: approval.allowSession ?? approval.risk !== 'high'
                })
              : 'reject'
            if (decision === 'reject') {
              const result = JSON.stringify({ ok: false, error: '用户拒绝了工具调用' })
              const rejectedCall: ToolCallRecord = {
                ...baseCall,
                status: 'rejected',
                result
              }
              toolExecutions.push(rejectedCall)
              options?.onToolActivity?.(rejectedCall)
              return { role: 'tool', tool_call_id: toolCall.id, content: result }
            }
          }
          const runningCall: ToolCallRecord = { ...baseCall, status: 'running' }
          options?.onToolActivity?.(runningCall)
          const toolController = new AbortController()
          const toolSignal = options?.signal
            ? AbortSignal.any([options.signal, toolController.signal])
            : toolController.signal
          if (toolCall.function.name === 'download_file') {
            options?.onToolCancellable?.(toolCall.id, () => toolController.abort())
          }
          let result: string
          try {
            result = await this.toolRuntime.execute(
              toolCall.function.name,
              toolCall.function.arguments,
              toolSignal,
              (progress) => options?.onToolActivity?.({ ...runningCall, progress })
            )
          } finally {
            options?.onToolCancellable?.(toolCall.id, null)
          }
          if (toolCall.function.name === 'search_web') {
            try {
              const payload = JSON.parse(result) as {
                ok?: boolean
                data?: {
                  provider?: SearchProviderId
                  query?: string
                  results?: Array<{
                    title?: string
                    url?: string
                    snippet?: string
                    publishedAt?: string
                  }>
                }
              }
              if (payload.ok && payload.data?.provider && payload.data.results) {
                payload.data.results = payload.data.results.map((item) => {
                  const index = sources.length + 1
                  sources.push({
                    index,
                    provider: payload.data!.provider!,
                    query: payload.data!.query ?? '',
                    title: item.title ?? item.url ?? `Source ${index}`,
                    url: item.url ?? '',
                    snippet: item.snippet ?? '',
                    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {})
                  })
                  return { ...item, citationIndex: index }
                })
                ;(payload.data as Record<string, unknown>)['citationInstruction'] =
                  'Cite factual claims using the matching [citationIndex], for example [1].'
                result = JSON.stringify(payload)
              }
            } catch {
              // Keep the original tool result if a provider returns an unexpected shape.
            }
          }
          let succeeded = false
          try {
            succeeded = JSON.parse(result)?.ok === true
          } catch {
            succeeded = false
          }
          const completedCall: ToolCallRecord = {
            ...runningCall,
            status: succeeded ? 'completed' : 'error',
            result
          }
          toolExecutions.push(completedCall)
          options?.onToolActivity?.(completedCall)
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          }
        })
      )
      messages.push(...toolMessages)
    }

    throw new Error(`工具调用超过最大轮数（${MAX_TOOL_ROUNDS}）`)
  }

  async summarizeConversation(
    previousSummary: string,
    messages: Message[],
    targetTokens: number
  ): Promise<string> {
    const transcript = messages
      .map((message) => {
        const attachmentNames = message.attachments?.map((item) => item.name).join('、')
        return `[${message.role === 'user' ? '用户' : '助手'}]\n${message.content}${attachmentNames ? `\n[附件：${attachmentNames}]` : ''}`
      })
      .join('\n\n')
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `你是对话压缩器。请将对话更新为一份不超过 ${targetTokens} 个 Token 的精炼摘要。
必须保留：用户目标、明确决策、偏好和约束、已完成与未完成工作、重要数据、文件名、代码标识符及错误信息。
不要加入对话中没有的信息，不要回答用户问题，只输出摘要正文。`
        },
        {
          role: 'user',
          content: `之前的摘要：\n${previousSummary || '暂无'}\n\n需要合并的新对话：\n${transcript}`
        }
      ]
    })
    return response.choices[0].message.content ?? ''
  }
}
