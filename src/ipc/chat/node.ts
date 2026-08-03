import { ipcMain } from 'electron'
import { CHAT_CHANNELS, ChatMessage, ModelConfig, Session } from './constants'
import { Agent } from '@/main/lib/agent'
import { getChatRepository } from './repository'

export default () => {
  ipcMain.handle(CHAT_CHANNELS.SESSION_QUERY, () => getChatRepository().querySessions())
  ipcMain.handle(CHAT_CHANNELS.SESSION_CREATE, (_event, request: Session) =>
    getChatRepository().createSession(request)
  )
  ipcMain.handle(CHAT_CHANNELS.SESSION_UPDATE, (_event, request: Session) =>
    getChatRepository().updateSession(request)
  )
  ipcMain.handle(CHAT_CHANNELS.SESSION_DELETE, (_event, id: string) =>
    getChatRepository().deleteSession(id)
  )
  ipcMain.handle(CHAT_CHANNELS.MESSAGE_QUERY, (_event, sessionId: string) =>
    getChatRepository().queryMessages(sessionId)
  )
  ipcMain.handle(CHAT_CHANNELS.MODEL_CONFIG_QUERY, () => getChatRepository().queryModelConfigs())
  ipcMain.handle(CHAT_CHANNELS.MODEL_CONFIG_CREATE, (_event, request: ModelConfig) =>
    getChatRepository().createModelConfig(request)
  )
  ipcMain.handle(CHAT_CHANNELS.MODEL_CONFIG_UPDATE, (_event, request: ModelConfig) =>
    getChatRepository().updateModelConfig(request)
  )
  ipcMain.handle(CHAT_CHANNELS.MODEL_CONFIG_DELETE, (_event, id: string) =>
    getChatRepository().deleteModelConfig(id)
  )
  ipcMain.handle(CHAT_CHANNELS.MODEL_CONFIG_SELECT, (_event, id: string) =>
    getChatRepository().selectModelConfig(id)
  )

  ipcMain.handle(CHAT_CHANNELS.CHAT_SEND, async (_event, request: ChatMessage) => {
    try {
      const repository = getChatRepository()
      const modelConfig = repository.getModelConfig(request.modelConfigId)
      if (!modelConfig) throw new Error('所选模型配置不存在')
      repository.saveMessages(request.conversationId, request.messages)
      const agent = new Agent(modelConfig)
      const response = await agent.chat(request.messages)
      const content = response.content ?? ''
      const message = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content,
        createdAt: new Date().toISOString()
      }
      repository.createMessage(request.conversationId, message)
      return message
    } catch (error) {
      console.error('sendChatMessage error - ipcMain.handle', error)
      throw error
    }
  })
}
