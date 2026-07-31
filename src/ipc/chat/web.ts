import { ipcRenderer } from 'electron'
import { CHAT_CHANNELS, ChatMessage, Session } from './constants'

export default {
  querySession: (): Promise<Session[]> => ipcRenderer.invoke(CHAT_CHANNELS.SESSION_QUERY),
  createSession: (request: Session): Promise<Session> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_CREATE, request),
  updateSession: (request: Session): Promise<Session> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_UPDATE, request),
  deleteSession: (id: string): Promise<void> =>
    ipcRenderer.invoke(CHAT_CHANNELS.SESSION_DELETE, id),

  sendChatMessage: (request: ChatMessage): Promise<string> =>
    ipcRenderer.invoke(CHAT_CHANNELS.CHAT_SEND, request)
}
