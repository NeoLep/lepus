import { ipcRenderer } from 'electron'
import {
  CHAT_CHANNELS,
  ChatMessage,
  ChatResponse,
  CompressionStatus,
  CompressionStatusEvent,
  CompressionStatusQuery,
  MessageReviseRequest,
  ModelConfig,
  PromptPreviewRequest,
  PromptSettings,
  SearchProviderConfig,
  Session
} from './constants'

export default {
  querySession: (): Promise<Session[]> => ipcRenderer.invoke(CHAT_CHANNELS.SESSION_QUERY),
  createSession: (request: Session): Promise<Session> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_CREATE, request),
  updateSession: (request: Session): Promise<Session> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_UPDATE, request),
  deleteSession: (id: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_DELETE, id),
  queryMessages: (sessionId: string): Promise<ChatMessage['messages']> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MESSAGE_QUERY, sessionId),
  reviseMessage: (request: MessageReviseRequest): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.MESSAGE_REVISE, request),
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
  queryCompressionStatus: (request: CompressionStatusQuery): Promise<CompressionStatus> =>
    ipcRenderer.invoke(CHAT_CHANNELS.COMPRESSION_STATUS_QUERY, request),
  onCompressionStatusChanged: (listener: (event: CompressionStatusEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CompressionStatusEvent): void =>
      listener(payload)
    ipcRenderer.on(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, handler)
    return () => ipcRenderer.removeListener(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, handler)
  },

  sendChatMessage: (request: ChatMessage): Promise<ChatResponse> =>
    ipcRenderer.invoke(CHAT_CHANNELS.CHAT_SEND, request)
}
