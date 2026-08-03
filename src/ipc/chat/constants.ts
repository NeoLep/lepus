export const CHAT_CHANNELS = {
  SESSION_QUERY: 'session:query',
  SESSION_CREATE: 'session:create',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  MESSAGE_QUERY: 'message:query',

  MODEL_CONFIG_QUERY: 'model-config:query',
  MODEL_CONFIG_CREATE: 'model-config:create',
  MODEL_CONFIG_UPDATE: 'model-config:update',
  MODEL_CONFIG_DELETE: 'model-config:delete',
  MODEL_CONFIG_SELECT: 'model-config:select',

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
  modelConfigId: string
  messages: Message[]
}

export type ModelConfig = {
  id: string
  name: string
  baseURL: string
  model: string
  apiKey: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}
