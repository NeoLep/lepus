import { ipcMain } from 'electron'
import { CHAT_CHANNELS, ChatMessage, Session } from './constants'
import { Agent } from '@/main/lib/agent'

export default () => {
  ipcMain.handle(CHAT_CHANNELS.SESSION_QUERY, async (_event) => {
    console.log('session query')
    return [] as Session[]
  })
  ipcMain.handle(CHAT_CHANNELS.SESSION_CREATE, async (_event, request: Session) => {
    return request
  })
  ipcMain.handle(CHAT_CHANNELS.SESSION_UPDATE, async (_event, request: Session) => {
    return request
  })
  ipcMain.handle(CHAT_CHANNELS.SESSION_DELETE, async (_event, id: string) => {
    return id
  })

  ipcMain.handle(CHAT_CHANNELS.CHAT_SEND, async (_event, request: ChatMessage) => {
    try {
      const agent = new Agent()
      const response = await agent.chat(request.messages)
      return response.content
    } catch (error) {
      console.error('sendChatMessage error - ipcMain.handle', error)
      return 'Error'
    }
  })
}
