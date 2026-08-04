import OpenAI from 'openai'
import { Message, ModelConfig, SearchProviderConfig } from '@/ipc/chat/constants'
import type { AgentInputMessage } from './types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { createFunctionToolRuntime } from './tools'

const MAX_TOOL_ROUNDS = 8

export class Agent {
  public client: OpenAI
  private readonly model: string

  private readonly toolRuntime

  constructor(config: ModelConfig, searchConfigs: SearchProviderConfig[] = []) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    })
    this.model = config.model
    this.toolRuntime = createFunctionToolRuntime(searchConfigs)
  }
  async chat(
    message: AgentInputMessage[],
    options?: {
      onToolCalls?: (toolNames: string[]) => void
      onContentUpdate?: (content: string) => void
    }
  ) {
    const messages: ChatCompletionMessageParam[] = [...message]
    let visibleContent = ''
    let initialPromptTokens: number | null = null

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: this.toolRuntime.schemas,
        tool_choice: 'auto',
        stream: true
      })
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
          promptTokens: initialPromptTokens
        }
      }

      options?.onToolCalls?.(toolCalls.map((toolCall) => toolCall.function.name))
      messages.push(responseMessage)
      const toolMessages = await Promise.all(
        toolCalls.map(async (toolCall): Promise<ChatCompletionMessageParam> => {
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: await this.toolRuntime.execute(
              toolCall.function.name,
              toolCall.function.arguments
            )
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
      .map((message) => `[${message.role === 'user' ? '用户' : '助手'}]\n${message.content}`)
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
