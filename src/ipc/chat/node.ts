import { ipcMain } from 'electron'
import {
  CHAT_CHANNELS,
  ChatMessage,
  CompressionStatusQuery,
  MessageReviseRequest,
  MessageRegenerateRequest,
  ModelConfig,
  PromptPreviewRequest,
  PromptSettings,
  SearchProviderConfig,
  Session
} from './constants'
import { Agent } from '@/main/lib/agent'
import { HistoryCompressor } from '@/main/lib/agent/history-compressor'
import type { AgentInputMessage } from '@/main/lib/agent/types'
import { estimateMessageTokens } from '@/shared/agent/history-compression'
import { getChatRepository } from './repository'
import { HISTORY_COMPRESSION } from '@/shared/agent/history-compression'
import { PromptBuilder } from '@/main/lib/agent/prompt-builder'

const backgroundCompressionBySession = new Map<string, Promise<void>>()
const activeChatControllers = new Map<string, AbortController>()

function isContextLengthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /context.{0,20}(length|window|token)|maximum context|too many tokens/i.test(message)
}

function buildSystemPrompt(
  repository: ReturnType<typeof getChatRepository>,
  locale: ChatMessage['locale']
): string {
  return new PromptBuilder().build({ settings: repository.getPromptSettings(), locale })
}

export default () => {
  ipcMain.handle(CHAT_CHANNELS.CHAT_CANCEL, (_event, sessionId: string) => {
    activeChatControllers.get(sessionId)?.abort()
  })
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
  ipcMain.handle(CHAT_CHANNELS.MESSAGE_REVISE, async (_event, request: MessageReviseRequest) => {
    await backgroundCompressionBySession.get(request.sessionId)
    getChatRepository().reviseUserMessage(request.sessionId, request.messageId, request.content)
  })
  ipcMain.handle(
    CHAT_CHANNELS.MESSAGE_REGENERATE,
    async (_event, request: MessageRegenerateRequest) => {
      await backgroundCompressionBySession.get(request.sessionId)
      getChatRepository().deleteAssistantMessage(request.sessionId, request.messageId)
    }
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
  ipcMain.handle(CHAT_CHANNELS.PROMPT_SETTINGS_QUERY, () => getChatRepository().getPromptSettings())
  ipcMain.handle(CHAT_CHANNELS.PROMPT_SETTINGS_UPDATE, (_event, request: PromptSettings) =>
    getChatRepository().savePromptSettings(request)
  )
  ipcMain.handle(CHAT_CHANNELS.PROMPT_PREVIEW, (_event, request: PromptPreviewRequest) =>
    new PromptBuilder().build(request)
  )
  ipcMain.handle(CHAT_CHANNELS.SEARCH_CONFIG_QUERY, () =>
    getChatRepository().querySearchProviderConfigs()
  )
  ipcMain.handle(CHAT_CHANNELS.SEARCH_CONFIG_UPDATE, (_event, request: SearchProviderConfig[]) =>
    getChatRepository().saveSearchProviderConfigs(request)
  )
  ipcMain.handle(
    CHAT_CHANNELS.COMPRESSION_STATUS_QUERY,
    (_event, request: CompressionStatusQuery) => {
      const repository = getChatRepository()
      const modelConfig = repository.getModelConfig(request.modelConfigId)
      if (!modelConfig) throw new Error('所选模型配置不存在')
      const compressor = new HistoryCompressor(
        repository,
        modelConfig,
        undefined,
        buildSystemPrompt(repository, request.locale)
      )
      return compressor.getStatus(request.sessionId, repository.queryMessages(request.sessionId))
    }
  )

  ipcMain.handle(CHAT_CHANNELS.CHAT_SEND, async (event, request: ChatMessage) => {
    activeChatControllers.get(request.conversationId)?.abort()
    const controller = new AbortController()
    activeChatControllers.set(request.conversationId, controller)
    let streamedContent = ''
    try {
      const repository = getChatRepository()
      const modelConfig = repository.getModelConfig(request.modelConfigId)
      if (!modelConfig) throw new Error('所选模型配置不存在')
      await backgroundCompressionBySession.get(request.conversationId)
      repository.saveMessages(request.conversationId, request.messages)
      const agent = new Agent(modelConfig, repository.getSearchProviderConfigs())
      const systemPrompt = buildSystemPrompt(repository, request.locale)
      const showToolCallDetails = repository.getPromptSettings().showToolCallDetails
      const onContentUpdate = (content: string): void => {
        if (!content || event.sender.isDestroyed()) return
        streamedContent = content
        event.sender.send(CHAT_CHANNELS.CHAT_STREAM_DELTA, {
          sessionId: request.conversationId,
          content
        })
      }
      const onToolActivity = (call: import('./constants').ToolCallRecord): void => {
        if (!showToolCallDetails || event.sender.isDestroyed()) return
        event.sender.send(CHAT_CHANNELS.TOOL_ACTIVITY_CHANGED, {
          sessionId: request.conversationId,
          call
        })
      }
      const compressor = new HistoryCompressor(repository, modelConfig, agent, systemPrompt)
      const buildStoppedResponse = () => {
        const partialContent = streamedContent.trim()
        const partialMessage = partialContent
          ? {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: partialContent,
              createdAt: new Date().toISOString()
            }
          : null
        if (partialMessage) repository.createMessage(request.conversationId, partialMessage)
        const partialHistory = partialMessage
          ? [...request.messages, partialMessage]
          : request.messages
        return {
          message: partialMessage,
          compression: compressor.getStatus(request.conversationId, partialHistory),
          stopped: true
        }
      }
      let context: AgentInputMessage[] = compressor.buildUncompressedContext(
        request.conversationId,
        request.messages
      )
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
          context = compressor.buildUncompressedContext(request.conversationId, request.messages)
          console.warn('[history] compression failed, using full history', error)
        }
      }
      let estimatedPromptTokens = estimateMessageTokens(context)
      let response
      try {
        response = await agent.chat(context, {
          onContentUpdate,
          onToolActivity,
          signal: controller.signal
        })
      } catch (error) {
        if (controller.signal.aborted) return buildStoppedResponse()
        if (!isContextLengthError(error)) throw error
        context = compressor.buildEmergencyContext(request.conversationId, request.messages)
        estimatedPromptTokens = estimateMessageTokens(context)
        try {
          response = await agent.chat(context, {
            onContentUpdate,
            onToolActivity,
            signal: controller.signal
          })
        } catch (retryError) {
          if (controller.signal.aborted) return buildStoppedResponse()
          throw retryError
        }
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
        createdAt: new Date().toISOString(),
        toolCalls: response.toolCalls,
        sources: response.sources
      }
      repository.createMessage(request.conversationId, message)
      const completedHistory = [...request.messages, message]
      const latestModelConfig = repository.getModelConfig(modelConfig.id) ?? modelConfig
      const status = new HistoryCompressor(
        repository,
        latestModelConfig,
        agent,
        systemPrompt
      ).getStatus(request.conversationId, completedHistory)
      const result = {
        message,
        compression: status,
        stopped: false
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
            const compressor = new HistoryCompressor(
              repository,
              latestModelConfig,
              agent,
              systemPrompt
            )
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
    } finally {
      if (activeChatControllers.get(request.conversationId) === controller) {
        activeChatControllers.delete(request.conversationId)
      }
    }
  })
}
