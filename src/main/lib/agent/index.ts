import OpenAI from 'openai'
import { randomUUID } from 'node:crypto'
import {
  Message,
  ModelConfig,
  PermissionSettings,
  SearchCitation,
  SearchProviderConfig,
  SearchProviderId,
  ToolApprovalRequest,
  ToolCallRecord,
  UserInputAnswer,
  UserInputPrompt
} from '@/ipc/chat/constants'
import type { TaskPlanUpdate } from '@/ipc/chat/constants'
import type { AgentInputMessage } from './types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { createFunctionToolRuntime, type FunctionToolRuntimeOptions } from './tools'
import { interactiveDecisionContext } from './history-compressor'

const MAX_TOOL_ROUNDS = 20

function recordedToolArguments(name: string, rawArguments: string): string {
  if (name !== 'browser_type') return rawArguments
  try {
    const parsed = JSON.parse(rawArguments) as Record<string, unknown>
    if (parsed['sensitive'] !== true) return rawArguments
    return JSON.stringify({ ...parsed, text: '[敏感内容已隐藏]' })
  } catch {
    return JSON.stringify({ redacted: true, error: '工具参数无法解析' })
  }
}

function resolveSensitiveToolArguments(
  name: string,
  rawArguments: string,
  sensitiveInputs: Map<string, string>
): string {
  if (name !== 'browser_type') return rawArguments
  try {
    const parsed = JSON.parse(rawArguments) as Record<string, unknown>
    const secretId = parsed['secret_id']
    if (typeof secretId !== 'string') return rawArguments
    const secret = sensitiveInputs.get(secretId)
    if (secret === undefined) return rawArguments
    sensitiveInputs.delete(secretId)
    return JSON.stringify({ ...parsed, text: secret, sensitive: true })
  } catch {
    return rawArguments
  }
}

export class Agent {
  public client: OpenAI
  private readonly model: string

  private readonly toolRuntime
  private readonly maxToolRounds: number

  constructor(
    config: ModelConfig,
    searchConfigs: SearchProviderConfig[] = [],
    permissionSettings?: PermissionSettings,
    taskMode = false,
    options: FunctionToolRuntimeOptions & {
      maxToolRounds?: number
    } = {}
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    })
    this.model = config.model
    this.maxToolRounds = options.maxToolRounds ?? MAX_TOOL_ROUNDS
    this.toolRuntime = createFunctionToolRuntime(
      searchConfigs,
      permissionSettings,
      taskMode,
      options
    )
  }
  async chat(
    message: AgentInputMessage[],
    options?: {
      onContentUpdate?: (content: string) => void
      signal?: AbortSignal
      onToolActivity?: (call: ToolCallRecord) => void
      onToolCancellable?: (toolCallId: string, cancel: (() => void) | null) => void
      onPlanUpdate?: (plan: TaskPlanUpdate) => void
      onUserInput?: (
        prompt: UserInputPrompt,
        toolCallId: string
      ) => Promise<Pick<UserInputAnswer, 'answer' | 'selectedOptionId' | 'canceled'>>
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
    const sensitiveInputs = new Map<string, string>()

    for (let round = 0; round < this.maxToolRounds; round += 1) {
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
          const recordedArguments = recordedToolArguments(
            toolCall.function.name,
            toolCall.function.arguments
          )
          const baseCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: recordedArguments
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
                  arguments: recordedArguments,
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
          if (
            ['download_file', 'run_skill_script'].includes(toolCall.function.name) ||
            toolCall.function.name.startsWith('browser_')
          ) {
            options?.onToolCancellable?.(toolCall.id, () => toolController.abort())
          }
          let result: string
          try {
            result = await this.toolRuntime.execute(
              toolCall.function.name,
              resolveSensitiveToolArguments(
                toolCall.function.name,
                toolCall.function.arguments,
                sensitiveInputs
              ),
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
          if (toolCall.function.name === 'delegate_tasks') {
            try {
              const payload = JSON.parse(result) as {
                ok?: boolean
                data?: {
                  tasks?: Array<{ sources?: SearchCitation[] }>
                  citationInstruction?: string
                }
              }
              if (payload.ok && payload.data?.tasks) {
                for (const task of payload.data.tasks) {
                  task.sources = task.sources?.map((source) => {
                    const citation = { ...source, index: sources.length + 1 }
                    sources.push(citation)
                    return citation
                  })
                }
                payload.data.citationInstruction =
                  'Cite claims from sub-agent sources using their matching [index].'
                result = JSON.stringify(payload)
              }
            } catch {
              // Keep the original sub-agent result if it has an unexpected shape.
            }
          }
          if (toolCall.function.name === 'request_user_input') {
            try {
              const payload = JSON.parse(result) as { ok?: boolean; data?: UserInputPrompt }
              if (payload.ok && payload.data) {
                if (!options?.onUserInput) throw new Error('当前界面无法接收用户回答')
                const answer = await options.onUserInput(payload.data, toolCall.id)
                if (answer.canceled) {
                  result = JSON.stringify({ ok: false, error: '用户输入已取消' })
                } else if (payload.data.sensitive) {
                  const secretId = `secret-${randomUUID()}`
                  sensitiveInputs.set(secretId, answer.answer)
                  result = JSON.stringify({
                    ok: true,
                    data: {
                      question: payload.data.question,
                      sensitive: true,
                      secretId,
                      answer: '[敏感内容已在本机安全接收，请通过 secret_id 引用]'
                    }
                  })
                } else {
                  result = JSON.stringify({
                    ok: true,
                    data: {
                      question: payload.data.question,
                      answer: answer.answer,
                      ...(answer.selectedOptionId
                        ? { selectedOptionId: answer.selectedOptionId }
                        : {})
                    }
                  })
                }
              }
            } catch (error) {
              result = JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : '无法获取用户回答'
              })
            }
          }
          if (toolCall.function.name === 'run_skill_script') {
            try {
              const payload = JSON.parse(result) as {
                ok?: boolean
                data?: {
                  exitCode?: number | null
                  timedOut?: boolean
                  outputLimitExceeded?: boolean
                }
                error?: string
              }
              if (
                payload.ok &&
                payload.data &&
                (payload.data.exitCode !== 0 ||
                  payload.data.timedOut ||
                  payload.data.outputLimitExceeded)
              ) {
                payload.ok = false
                payload.error = payload.data.timedOut
                  ? 'Skill 脚本执行超时'
                  : payload.data.outputLimitExceeded
                    ? 'Skill 脚本输出超过限制，进程已终止'
                    : `Skill 脚本退出码为 ${payload.data.exitCode}`
                result = JSON.stringify(payload)
              }
            } catch {
              // Keep the original result when script output metadata is unavailable.
            }
          }
          let succeeded = false
          try {
            succeeded = JSON.parse(result)?.ok === true
          } catch {
            succeeded = false
          }
          if (succeeded && toolCall.function.name === 'update_plan') {
            try {
              const payload = JSON.parse(result) as { data?: TaskPlanUpdate }
              if (payload.data) options?.onPlanUpdate?.(payload.data)
            } catch {
              // The tool result is still reported normally if plan rendering fails.
            }
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

    throw new Error(`工具调用超过最大轮数（${this.maxToolRounds}）`)
  }

  async summarizeConversation(
    previousSummary: string,
    messages: Message[],
    targetTokens: number,
    signal?: AbortSignal
  ): Promise<string> {
    const transcript = messages
      .map((message) => {
        const attachmentNames = message.attachments?.map((item) => item.name).join('、')
        return `[${message.role === 'user' ? '用户' : '助手'}]\n${message.content}${attachmentNames ? `\n[附件：${attachmentNames}]` : ''}${interactiveDecisionContext(message)}`
      })
      .join('\n\n')
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: Math.max(512, targetTokens),
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
      },
      { signal }
    )
    return response.choices[0].message.content ?? ''
  }
}
