export const CHAT_CHANNELS = {
  SESSION_QUERY: 'session:query',
  SESSION_CREATE: 'session:create',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  SESSION_SEARCH: 'session:search',
  SESSION_EXPORT: 'session:export',
  TASK_PLAN_QUERY: 'task-plan:query',
  TASK_PLAN_CHANGED: 'task-plan:changed',
  MESSAGE_QUERY: 'message:query',
  MESSAGE_REVISE: 'message:revise',
  MESSAGE_REGENERATE: 'message:regenerate',
  ATTACHMENT_SELECT: 'attachment:select',
  ATTACHMENT_IMPORT: 'attachment:import',
  ATTACHMENT_PREVIEW: 'attachment:preview',
  ATTACHMENT_DISCARD: 'attachment:discard',
  ATTACHMENT_SESSION_DISCARD: 'attachment:session-discard',

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
  PERMISSION_SETTINGS_QUERY: 'permission-settings:query',
  PERMISSION_SETTINGS_UPDATE: 'permission-settings:update',
  WORKSPACE_FOLDER_SELECT: 'workspace-folder:select',
  GENERATED_FILE_OPEN: 'generated-file:open',
  COMPRESSION_STATUS_QUERY: 'compression-status:query',
  COMPRESSION_STATUS_CHANGED: 'compression-status:changed',
  CHAT_STREAM_DELTA: 'chat:stream-delta',
  CHAT_CANCEL: 'chat:cancel',
  TOOL_ACTIVITY_CHANGED: 'tool-activity:changed',
  TOOL_CANCEL: 'tool:cancel',
  TOOL_APPROVAL_REQUESTED: 'tool-approval:requested',
  TOOL_APPROVAL_RESOLVE: 'tool-approval:resolve',

  CHAT_SEND: 'chat:send-message'
}

export type Session = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  isPinned: boolean
  isArchived: boolean
  taskMode: boolean
}

export type TaskPlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type TaskPlanItem = {
  id: string
  title: string
  status: TaskPlanItemStatus
}

export type TaskPlanUpdate = {
  explanation: string
  items: TaskPlanItem[]
}

export type TaskPlan = TaskPlanUpdate & {
  sessionId: string
  updatedAt: string
}

export type TaskPlanChangedEvent = {
  sessionId: string
  plan: TaskPlan
}

export type SessionSearchResult = {
  session: Session
  snippet: string
  matchedIn: 'title' | 'message' | 'attachment' | 'source' | 'tool'
}

export type SessionExportRequest = {
  sessionId: string
  format: 'markdown' | 'json'
}

export type SessionExportResult = {
  canceled: boolean
  filePath?: string
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  toolCalls?: ToolCallRecord[]
  sources?: SearchCitation[]
  attachments?: MessageAttachment[]
}

export type MessageAttachmentKind = 'image' | 'pdf' | 'text'

export type MessageAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: MessageAttachmentKind
  storageName: string
  extractedCharacters?: number
  pageCount?: number
  truncated?: boolean
  image?: { width: number; height: number }
}

export type AttachmentImportRequest = {
  sessionId: string
  paths: string[]
}

export type AttachmentImportResult = {
  attachments: MessageAttachment[]
  errors: Array<{ path: string; message: string }>
}

export type AttachmentPreviewRequest = {
  sessionId: string
  attachment: MessageAttachment
}

export type AttachmentDiscardRequest = {
  sessionId: string
  attachment: MessageAttachment
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
  status: 'awaiting_approval' | 'running' | 'completed' | 'error' | 'rejected'
  result?: string
  progress?: {
    bytesReceived: number
    totalBytes?: number
    percent?: number
  }
}

export type ToolActivityEvent = {
  sessionId: string
  call: ToolCallRecord
}

export type ToolCancelRequest = {
  sessionId: string
  toolCallId: string
}

export type ToolApprovalRisk = 'medium' | 'high'

export type ToolApprovalRequest = {
  id: string
  sessionId: string
  toolCallId: string
  name: string
  arguments: string
  risk: ToolApprovalRisk
  reason: string
  allowSession: boolean
}

export type ToolApprovalDecision = {
  approvalId: string
  sessionId: string
  decision: 'allow_once' | 'allow_session' | 'reject'
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

export type PermissionMode = 'request_approval' | 'auto_approve' | 'full_access'

export type PermissionSettings = {
  workspacePath: string
  mode: PermissionMode
}

export type SessionPermissionSettings = PermissionSettings & {
  sessionId: string
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
