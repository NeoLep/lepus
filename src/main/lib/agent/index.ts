import OpenAI from 'openai'
import { Message, ModelConfig } from '@/ipc/chat/constants'

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
  async chat(message: Message[]) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: message
    })
    return response.choices[0].message
  }
}
