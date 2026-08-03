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
  async chat(message: AgentInputMessage[]) {
    const messages: ChatCompletionMessageParam[] = [...message]
    let initialPromptTokens: number | null = null

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: this.toolRuntime.schemas,
        tool_choice: 'auto'
      })
      initialPromptTokens ??= response.usage?.prompt_tokens ?? null
      const responseMessage = response.choices[0]?.message
      if (!responseMessage) throw new Error('模型没有返回消息')

      if (!responseMessage.tool_calls?.length) {
        return { message: responseMessage, promptTokens: initialPromptTokens }
      }

      messages.push(responseMessage)
      const toolMessages = await Promise.all(
        responseMessage.tool_calls.map(async (toolCall): Promise<ChatCompletionMessageParam> => {
          if (toolCall.type !== 'function') {
            return {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ ok: false, error: '不支持的工具调用类型' })
            }
          }
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
