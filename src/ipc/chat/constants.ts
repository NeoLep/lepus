export const CHAT_CHANNELS = {
  SESSION_QUERY: 'session:query',
  SESSION_CREATE: 'session:create',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  SESSION_SEARCH: 'session:search',
  SESSION_EXPORT: 'session:export',
  TASK_PLAN_QUERY: 'task-plan:query',
  TASK_PLAN_CHANGED: 'task-plan:changed',
  TASK_MODE_ROUTED: 'task-mode:routed',
  AGENT_RUN_QUERY: 'agent-run:query',
  AGENT_RUN_CHANGED: 'agent-run:changed',
  USER_INPUT_REQUESTED: 'user-input:requested',
  USER_INPUT_RESOLVE: 'user-input:resolve',
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
  SKILL_QUERY: 'skill:query',
  SKILL_CREATE: 'skill:create',
  SKILL_UPDATE: 'skill:update',
  SKILL_DELETE: 'skill:delete',
  SKILL_IMPORT_FOLDER: 'skill:import-folder',
  SKILL_IMPORT_ZIP: 'skill:import-zip',
  SKILL_IMPORT_GITHUB: 'skill:import-github',
  SKILL_CATALOG_QUERY: 'skill:catalog-query',
  SKILL_ROUTED: 'skill:routed',
  SEARCH_CONFIG_QUERY: 'search-config:query',
  SEARCH_CONFIG_UPDATE: 'search-config:update',
  PERMISSION_SETTINGS_QUERY: 'permission-settings:query',
  PERMISSION_SETTINGS_UPDATE: 'permission-settings:update',
  WORKSPACE_FOLDER_SELECT: 'workspace-folder:select',
  GENERATED_FILE_OPEN: 'generated-file:open',
  COMPRESSION_STATUS_QUERY: 'compression-status:query',
  COMPRESSION_STATUS_CHANGED: 'compression-status:changed',
  COMPRESSION_RECORD_QUERY: 'compression-record:query',
  COMPRESSION_RECORD_CHANGED: 'compression-record:changed',
  CHAT_STREAM_DELTA: 'chat:stream-delta',
  CHAT_CANCEL: 'chat:cancel',
  TOOL_ACTIVITY_CHANGED: 'tool-activity:changed',
  TOOL_CANCEL: 'tool:cancel',
  TOOL_APPROVAL_REQUESTED: 'tool-approval:requested',
  TOOL_APPROVAL_RESOLVE: 'tool-approval:resolve',

  CHAT_SEND: 'chat:send-message'
}

export type TaskModePreference = 'auto' | 'on' | 'off'

export type SkillSourceType =
  | 'manual'
  | 'folder'
  | 'zip'
  | 'github'
  | 'official-openai'
  | 'official-anthropic'
  | 'official-minimax'
  | 'official-modelscope'

export type OfficialSkillSourceType = Extract<
  SkillSourceType,
  'official-openai' | 'official-anthropic' | 'official-minimax' | 'official-modelscope'
>

export type SkillFileKind = 'instruction' | 'script' | 'reference' | 'asset' | 'other'

export type SkillFile = {
  path: string
  size: number
  kind: SkillFileKind
}

export type SkillDefinition = {
  id: string
  name: string
  description: string
  instructions: string
  triggers: string[]
  enabled: boolean
  sourceType: SkillSourceType
  sourceUrl: string
  contentHash: string
  rootPath: string
  license: string
  compatibility: string
  allowedTools: string[]
  files: SkillFile[]
  createdAt: string
  updatedAt: string
}

export type SkillSummary = Pick<SkillDefinition, 'id' | 'name' | 'description'>

export type SkillRoutedEvent = {
  sessionId: string
  skills: SkillSummary[]
}

export type SkillImportResult = {
  skills: SkillDefinition[]
  errors: string[]
}

export type SkillGithubImportRequest = {
  url: string
  sourceType?: 'github' | OfficialSkillSourceType
}

export type SkillCatalogId = 'openai' | 'anthropic' | 'minimax' | 'modelscope'

export type SkillCatalogEntry = {
  id: string
  skillId: string
  name: string
  description: string
  path: string
  sourceUrl: string
  sourceType: OfficialSkillSourceType
}

export type Session = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  isPinned: boolean
  isArchived: boolean
  taskMode: TaskModePreference
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

export type TaskModeRoutedEvent = {
  sessionId: string
  preference: TaskModePreference
  active: boolean
  score: number
  reasons: string[]
}

export type AgentRunKind = 'primary' | 'subtask'

export type AgentRunStatus =
  'queued' | 'running' | 'waiting_approval' | 'waiting_input' | 'completed' | 'failed' | 'canceled'

export type AgentRun = {
  id: string
  sessionId: string
  parentRunId?: string
  kind: AgentRunKind
  goal: string
  status: AgentRunStatus
  modelConfigId?: string
  taskModeActive: boolean
  requestMessageId?: string
  responseMessageId?: string
  result?: string
  errorName?: string
  errorMessage?: string
  promptTokens?: number
  toolCallCount: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export type AgentRunChangedEvent = {
  sessionId: string
  run: AgentRun
}

export type UserInputOption = {
  id: string
  label: string
  description?: string
}

export type UserInputPrompt = {
  question: string
  options: UserInputOption[]
  allowFreeform: boolean
  sensitive: boolean
  placeholder?: string
}

export type UserInputRequest = UserInputPrompt & {
  id: string
  sessionId: string
  toolCallId: string
}

export type UserInputAnswer = {
  requestId: string
  sessionId: string
  answer: string
  selectedOptionId?: string
  canceled?: boolean
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
  skillIds?: string[]
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
  trustedBrowserOrigins: string[]
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

export type CompressionRecordStatus = 'running' | 'completed' | 'failed' | 'fallback'

export type CompressionRecord = {
  id: string
  sessionId: string
  phase: 'foreground' | 'background'
  status: CompressionRecordStatus
  method: 'remote' | 'local'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  inputTokens: number
  sourceMessages: number
  errorName?: string
  errorMessage?: string
}

export type CompressionRecordChangedEvent = {
  sessionId: string
  record: CompressionRecord
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
  runId: string
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
