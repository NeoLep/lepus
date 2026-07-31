export const CHAT_CHANNELS = {
  SESSION_QUERY: 'session:query',
  SESSION_CREATE: 'session:create',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',

  CHAT_SEND: 'chat:send-message'
}

export type Session = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type ChatMessage = {
  conversationId: string
  messages: Message[]
}
