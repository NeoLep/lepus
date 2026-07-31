import OpenAI from 'openai'
import { Message } from '@/ipc/chat/constants'

export class Agent {
  public client: OpenAI
  constructor() {
    this.client = new OpenAI({
      apiKey: import.meta.env['VITE_DEEPSEEK_API_KEY'],
      baseURL: 'https://api.deepseek.com'
    })
  }
  async chat(message: Message[]) {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: message
    })
    return response.choices[0].message
  }
}
