import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import {
  CHAT_SEND_CHANNEL,
  type SendChatRequest,
  type SendChatResponse
} from '../shared/agent/index'
import OpenAI from 'openai'

export type ChatBackend = {
  sendMessage: (request: SendChatRequest) => Promise<SendChatResponse>
}

export function registerChatHandlers(backend: ChatBackend): void {
  ipcMain.handle(CHAT_SEND_CHANNEL, (_event, request: SendChatRequest) => {
    return backend.sendMessage(request)
  })
}

export function createDemoChatBackend(): ChatBackend {
  return {
    async sendMessage(request) {
      const latestMessage = request.messages.at(-1)

      if (!latestMessage || latestMessage.role !== 'user') {
        throw new Error('缺少用户消息')
      }

      const llm = new OpenAI({
        apiKey: import.meta.env['VITE_DEEPSEEK_API_KEY'],
        baseURL: 'https://api.deepseek.com'
      })
      const res = await llm.chat.completions.create({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'assistant', content: 'you are a helpful assistant' },
          ...request.messages
        ]
      })

      return {
        conversationId: request.conversationId ?? randomUUID(),
        message: {
          id: randomUUID(),
          role: 'assistant',
          content: res.choices[0].message.content || 'error',
          createdAt: new Date().toISOString()
        }
      }
    }
  }
}
