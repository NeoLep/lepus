import { ipcRenderer } from 'electron'
import { CHAT_CHANNELS, ChatMessage, Message, ModelConfig, Session } from './constants'

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

  sendChatMessage: (request: ChatMessage): Promise<Message> =>
    ipcRenderer.invoke(CHAT_CHANNELS.CHAT_SEND, request)
}
