import { ipcMain } from 'electron'
import {
  CHAT_CHANNELS,
  ChatMessage,
  CompressionStatusQuery,
  ModelConfig,
  Session
} from './constants'
import { Agent } from '@/main/lib/agent'
import { HistoryCompressor } from '@/main/lib/agent/history-compressor'
import type { AgentInputMessage } from '@/main/lib/agent/types'
import { estimateMessageTokens } from '@/shared/agent/history-compression'
import { getChatRepository } from './repository'
import { HISTORY_COMPRESSION } from '@/shared/agent/history-compression'

const backgroundCompressionBySession = new Map<string, Promise<void>>()

function isContextLengthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /context.{0,20}(length|window|token)|maximum context|too many tokens/i.test(message)
}

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
  ipcMain.handle(
    CHAT_CHANNELS.COMPRESSION_STATUS_QUERY,
    (_event, request: CompressionStatusQuery) => {
      const repository = getChatRepository()
      const modelConfig = repository.getModelConfig(request.modelConfigId)
      if (!modelConfig) throw new Error('所选模型配置不存在')
      const compressor = new HistoryCompressor(repository, modelConfig)
      return compressor.getStatus(request.sessionId, repository.queryMessages(request.sessionId))
    }
  )

  ipcMain.handle(CHAT_CHANNELS.CHAT_SEND, async (event, request: ChatMessage) => {
    try {
      const repository = getChatRepository()
      const modelConfig = repository.getModelConfig(request.modelConfigId)
      if (!modelConfig) throw new Error('所选模型配置不存在')
      await backgroundCompressionBySession.get(request.conversationId)
      repository.saveMessages(request.conversationId, request.messages)
      const agent = new Agent(modelConfig)
      const compressor = new HistoryCompressor(repository, modelConfig, agent)
      let context: AgentInputMessage[] = request.messages.map(({ role, content }) => ({
        role,
        content
      }))
      try {
        const compression = await compressor.buildContext(request.conversationId, request.messages)
        context = compression.messages
        if (compression.compressed) {
          console.info(
            `[history] compressed session=${request.conversationId} tokens=${compression.estimatedTokens}`
          )
        }
      } catch (error) {
        const status = compressor.getStatus(request.conversationId, request.messages)
        if (status.estimatedTokens >= status.emergencyThresholdTokens) {
          context = compressor.buildEmergencyContext(request.conversationId, request.messages)
          console.warn('[history] compression failed, using emergency context', error)
        } else {
          console.warn('[history] compression failed, using full history', error)
        }
      }
      let estimatedPromptTokens = estimateMessageTokens(context)
      let response
      try {
        response = await agent.chat(context)
      } catch (error) {
        if (!isContextLengthError(error)) throw error
        context = compressor.buildEmergencyContext(request.conversationId, request.messages)
        estimatedPromptTokens = estimateMessageTokens(context)
        response = await agent.chat(context)
      }
      if (response.promptTokens) {
        repository.updateModelTokenEstimateRatio(
          modelConfig.id,
          estimatedPromptTokens,
          response.promptTokens
        )
      }
      const content = response.message.content ?? ''
      const message = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content,
        createdAt: new Date().toISOString()
      }
      repository.createMessage(request.conversationId, message)
      const completedHistory = [...request.messages, message]
      const latestModelConfig = repository.getModelConfig(modelConfig.id) ?? modelConfig
      const status = new HistoryCompressor(repository, latestModelConfig, agent).getStatus(
        request.conversationId,
        completedHistory
      )
      const result = {
        message,
        compression: status
      }

      if (
        status.estimatedTokens >= status.softThresholdTokens &&
        status.uncompressedMessages > HISTORY_COMPRESSION.minimumRecentMessages
      ) {
        event.sender.send(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, {
          sessionId: request.conversationId,
          status,
          compressing: true
        })
        const backgroundCompression = (async () => {
          try {
            const compressor = new HistoryCompressor(repository, latestModelConfig, agent)
            await compressor.buildContext(request.conversationId, completedHistory, 'soft')
            const compressedStatus = compressor.getStatus(request.conversationId, completedHistory)
            if (!event.sender.isDestroyed()) {
              event.sender.send(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, {
                sessionId: request.conversationId,
                status: compressedStatus,
                compressing: false
              })
            }
          } catch (error) {
            console.warn('[history] background compression failed', error)
            if (!event.sender.isDestroyed()) {
              event.sender.send(CHAT_CHANNELS.COMPRESSION_STATUS_CHANGED, {
                sessionId: request.conversationId,
                status,
                compressing: false
              })
            }
          } finally {
            backgroundCompressionBySession.delete(request.conversationId)
          }
        })()
        backgroundCompressionBySession.set(request.conversationId, backgroundCompression)
      }

      return result
    } catch (error) {
      console.error('sendChatMessage error - ipcMain.handle', error)
      throw error
    }
  })
}
