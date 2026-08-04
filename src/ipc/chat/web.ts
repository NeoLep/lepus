import { ipcRenderer, webUtils } from 'electron'
import {
  AttachmentImportRequest,
  AttachmentImportResult,
  AttachmentDiscardRequest,
  AttachmentPreviewRequest,
  CHAT_CHANNELS,
  ChatMessage,
  ChatResponse,
  ChatStreamDeltaEvent,
  CompressionStatus,
  CompressionStatusEvent,
  CompressionStatusQuery,
  MessageReviseRequest,
  MessageRegenerateRequest,
  ModelConfig,
  PermissionSettings,
  SessionPermissionSettings,
  PromptPreviewRequest,
  PromptSettings,
  SearchProviderConfig,
  Session,
  SessionExportRequest,
  SessionExportResult,
  SessionSearchResult,
  TaskPlan,
  TaskPlanChangedEvent,
  ToolActivityEvent,
  ToolCancelRequest,
  ToolApprovalDecision,
  ToolApprovalRequest
} from './constants'

export default {
  querySession: (): Promise<Session[]> => ipcRenderer.invoke(CHAT_CHANNELS.SESSION_QUERY),
  createSession: (request: Session): Promise<Session> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_CREATE, request),
  updateSession: (request: Session): Promise<Session> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_UPDATE, request),
  deleteSession: (id: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_DELETE, id),
  searchSessions: (query: string): Promise<SessionSearchResult[]> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_SEARCH, query),
  exportSession: (request: SessionExportRequest): Promise<SessionExportResult> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_EXPORT, request),
  queryTaskPlan: (sessionId: string): Promise<TaskPlan | null> =>
    ipcRenderer.invoke(CHAT_CHANNELS.TASK_PLAN_QUERY, sessionId),
  onTaskPlanChanged: (listener: (event: TaskPlanChangedEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TaskPlanChangedEvent): void =>
      listener(payload)
    ipcRenderer.on(CHAT_CHANNELS.TASK_PLAN_CHANGED, handler)
    return () => ipcRenderer.removeListener(CHAT_CHANNELS.TASK_PLAN_CHANGED, handler)
  },
  queryMessages: (sessionId: string): Promise<ChatMessage['messages']> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MESSAGE_QUERY, sessionId),
  reviseMessage: (request: MessageReviseRequest): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MESSAGE_REVISE, request),
  regenerateMessage: (request: MessageRegenerateRequest): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MESSAGE_REGENERATE, request),
  selectAttachments: (sessionId: string): Promise<AttachmentImportResult> =>
    ipcRenderer.invoke(CHAT_CHANNELS.ATTACHMENT_SELECT, sessionId),
  importAttachments: (request: AttachmentImportRequest): Promise<AttachmentImportResult> =>
    ipcRenderer.invoke(CHAT_CHANNELS.ATTACHMENT_IMPORT, request),
  getAttachmentPreview: (request: AttachmentPreviewRequest): Promise<string> =>
    ipcRenderer.invoke(CHAT_CHANNELS.ATTACHMENT_PREVIEW, request),
  discardAttachment: (request: AttachmentDiscardRequest): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.ATTACHMENT_DISCARD, request),
  discardAttachmentSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.ATTACHMENT_SESSION_DISCARD, sessionId),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  queryModelConfigs: (): Promise<ModelConfig[]> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MODEL_CONFIG_QUERY),
  createModelConfig: (request: ModelConfig): Promise<ModelConfig> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MODEL_CONFIG_CREATE, request),
  updateModelConfig: (request: ModelConfig): Promise<ModelConfig> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MODEL_CONFIG_UPDATE, request),
  deleteModelConfig: (id: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MODEL_CONFIG_DELETE, id),
  selectModelConfig: (id: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MODEL_CONFIG_SELECT, id),
  queryPromptSettings: (): Promise<PromptSettings> =>
    ipcRenderer.invoke(CHAT_CHANNELS.PROMPT_SETTINGS_QUERY),
  updatePromptSettings: (request: PromptSettings): Promise<PromptSettings> =>
    ipcRenderer.invoke(CHAT_CHANNELS.PROMPT_SETTINGS_UPDATE, request),
  previewPrompt: (request: PromptPreviewRequest): Promise<string> =>
    ipcRenderer.invoke(CHAT_CHANNELS.PROMPT_PREVIEW, request),
  querySearchProviderConfigs: (): Promise<SearchProviderConfig[]> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SEARCH_CONFIG_QUERY),
  updateSearchProviderConfigs: (request: SearchProviderConfig[]): Promise<SearchProviderConfig[]> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SEARCH_CONFIG_UPDATE, request),
  queryPermissionSettings: (sessionId: string): Promise<PermissionSettings> =>
    ipcRenderer.invoke(CHAT_CHANNELS.PERMISSION_SETTINGS_QUERY, sessionId),
  updatePermissionSettings: (request: SessionPermissionSettings): Promise<PermissionSettings> =>
    ipcRenderer.invoke(CHAT_CHANNELS.PERMISSION_SETTINGS_UPDATE, request),
  selectWorkspaceFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(CHAT_CHANNELS.WORKSPACE_FOLDER_SELECT),
  openGeneratedFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.GENERATED_FILE_OPEN, filePath),
  queryCompressionStatus: (request: CompressionStatusQuery): Promise<CompressionStatus> =>
    ipcRenderer.invoke(CHAT_CHANNELS.COMPRESSION_STATUS_QUERY, request),
  onCompressionStatusChanged: (listener: (event: CompressionStatusEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CompressionStatusEvent): void =>
      listener(payload)
    ipcRenderer.on(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, handler)
    return () => ipcRenderer.removeListener(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, handler)
  },
  onToolActivityChanged: (listener: (event: ToolActivityEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ToolActivityEvent): void =>
      listener(payload)
    ipcRenderer.on(CHAT_CHANNELS.TOOL_ACTIVITY_CHANGED, handler)
    return () => ipcRenderer.removeListener(CHAT_CHANNELS.TOOL_ACTIVITY_CHANGED, handler)
  },
  onToolApprovalRequested: (listener: (event: ToolApprovalRequest) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ToolApprovalRequest): void =>
      listener(payload)
    ipcRenderer.on(CHAT_CHANNELS.TOOL_APPROVAL_REQUESTED, handler)
    return () => ipcRenderer.removeListener(CHAT_CHANNELS.TOOL_APPROVAL_REQUESTED, handler)
  },
  resolveToolApproval: (request: ToolApprovalDecision): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.TOOL_APPROVAL_RESOLVE, request),
  onChatStreamDelta: (listener: (event: ChatStreamDeltaEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatStreamDeltaEvent): void =>
      listener(payload)
    ipcRenderer.on(CHAT_CHANNELS.CHAT_STREAM_DELTA, handler)
    return () => ipcRenderer.removeListener(CHAT_CHANNELS.CHAT_STREAM_DELTA, handler)
  },
  cancelChat: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.CHAT_CANCEL, sessionId),
  cancelTool: (request: ToolCancelRequest): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.TOOL_CANCEL, request),

  sendChatMessage: (request: ChatMessage): Promise<ChatResponse> =>
    ipcRenderer.invoke(CHAT_CHANNELS.CHAT_SEND, request)
}
