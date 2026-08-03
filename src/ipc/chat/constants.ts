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
  COMPRESSION_STATUS_QUERY: 'compression-status:query',
  COMPRESSION_STATUS_CHANGED: 'compression-status:changed',

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

export type CompressionStatusQuery = {
  sessionId: string
  modelConfigId: string
}

export type CompressionStatusEvent = {
  sessionId: string
  status: CompressionStatus
  compressing: boolean
}

export type CompressionStatus = {
  estimatedTokens: number
  triggerTokens: number
  softThresholdTokens: number
  emergencyThresholdTokens: number
  contextWindow: number
  contextWindowSource: 'manual' | 'detected' | 'fallback'
  tokenEstimateRatio: number
  usageRatio: number
  willCompress: boolean
  uncompressedMessages: number
}

export type ChatResponse = {
  message: Message
  compression: CompressionStatus
}

export type ModelConfig = {
  id: string
  name: string
  baseURL: string
  model: string
  apiKey: string
  contextWindowOverride: number | null
  detectedContextWindow: number | null
  maxOutputTokensOverride: number | null
  tokenEstimateRatio: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}
