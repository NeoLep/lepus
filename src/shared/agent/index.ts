export const CHAT_SEND_CHANNEL = 'chat:send-message'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  createdAt: string
}

export type ChatInputMessage = Pick<ChatMessage, 'role' | 'content'>

export type SendChatRequest = {
  conversationId?: string
  messages: ChatInputMessage[]
}

export type SendChatResponse = {
  conversationId: string
  message: ChatMessage
}

export type ChatApi = {
  sendMessage: (request: SendChatRequest) => Promise<SendChatResponse>
}

export type AppApi = {
  chat: ChatApi
}
