import OpenAI from 'openai'
import { Message, ModelConfig } from '@/ipc/chat/constants'
import type { AgentInputMessage } from './types'

export class Agent {
  public client: OpenAI
  private readonly model: string

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    })
    this.model = config.model
  }
  async chat(message: AgentInputMessage[]) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: message
    })
    return {
      message: response.choices[0].message,
      promptTokens: response.usage?.prompt_tokens ?? null
    }
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
