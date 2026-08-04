export const CHAT_CHANNELS = {
  SESSION_QUERY: 'session:query',
  SESSION_CREATE: 'session:create',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  MESSAGE_QUERY: 'message:query',
  MESSAGE_REVISE: 'message:revise',
  MESSAGE_REGENERATE: 'message:regenerate',

  MODEL_CONFIG_QUERY: 'model-config:query',
  MODEL_CONFIG_CREATE: 'model-config:create',
  MODEL_CONFIG_UPDATE: 'model-config:update',
  MODEL_CONFIG_DELETE: 'model-config:delete',
  MODEL_CONFIG_SELECT: 'model-config:select',
  PROMPT_SETTINGS_QUERY: 'prompt-settings:query',
  PROMPT_SETTINGS_UPDATE: 'prompt-settings:update',
  PROMPT_PREVIEW: 'prompt:preview',
  SEARCH_CONFIG_QUERY: 'search-config:query',
  SEARCH_CONFIG_UPDATE: 'search-config:update',
  COMPRESSION_STATUS_QUERY: 'compression-status:query',
  COMPRESSION_STATUS_CHANGED: 'compression-status:changed',
  CHAT_STREAM_DELTA: 'chat:stream-delta',
  CHAT_CANCEL: 'chat:cancel',
  TOOL_ACTIVITY_CHANGED: 'tool-activity:changed',

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
  toolCalls?: ToolCallRecord[]
  sources?: SearchCitation[]
}

export type SearchCitation = {
  index: number
  provider: SearchProviderId
  query: string
  title: string
  url: string
  snippet: string
  publishedAt?: string
}

export type ToolCallRecord = {
  id: string
  name: string
  arguments: string
  status: 'running' | 'completed' | 'error'
  result?: string
}

export type ToolActivityEvent = {
  sessionId: string
  call: ToolCallRecord
}

export type ChatMessage = {
  conversationId: string
  modelConfigId: string
  locale: ChatLocale
  messages: Message[]
}

export type MessageReviseRequest = {
  sessionId: string
  messageId: string
  content: string
}

export type MessageRegenerateRequest = {
  sessionId: string
  messageId: string
}

export type ChatLocale = 'zh-CN' | 'en'

export type PromptSettings = {
  customInstructions: string
  includeCurrentTime: boolean
  includeTimezone: boolean
  includeLocale: boolean
  includePlatform: boolean
  showToolCallDetails: boolean
}

export type ChatStreamDeltaEvent = {
  sessionId: string
  content: string
}

export type SearchProviderId = 'brave' | 'tavily' | 'exa' | 'perplexity' | 'firecrawl' | 'searxng'

export type SearchProviderConfig = {
  provider: SearchProviderId
  enabled: boolean
  apiKey: string
  hasApiKey: boolean
  baseURL: string
  updatedAt: string
}

export type PromptPreviewRequest = {
  settings: PromptSettings
  locale: ChatLocale
}

export type CompressionStatusQuery = {
  sessionId: string
  modelConfigId: string
  locale: ChatLocale
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
  message: Message | null
  compression: CompressionStatus
  stopped: boolean
}

export type ModelConfig = {
  id: string
  name: string
  baseURL: string
  model: string
  apiKey: string
  hasApiKey: boolean
  contextWindowOverride: number | null
  detectedContextWindow: number | null
  maxOutputTokensOverride: number | null
  tokenEstimateRatio: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}
