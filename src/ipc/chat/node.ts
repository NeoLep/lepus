import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { lstat, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  AttachmentImportRequest,
  AttachmentDiscardRequest,
  AttachmentPreviewRequest,
  CHAT_CHANNELS,
  ChatMessage,
  CompressionStatusQuery,
  MessageReviseRequest,
  MessageRegenerateRequest,
  ModelConfig,
  PromptPreviewRequest,
  PromptSettings,
  SearchProviderConfig,
  Session,
  SessionPermissionSettings,
  ToolApprovalDecision,
  ToolApprovalRequest,
  ToolCancelRequest
} from './constants'
import { Agent } from '@/main/lib/agent'
import { HistoryCompressor } from '@/main/lib/agent/history-compressor'
import type { AgentInputMessage } from '@/main/lib/agent/types'
import { estimateMessageTokens } from '@/shared/agent/history-compression'
import { getChatRepository } from './repository'
import { HISTORY_COMPRESSION } from '@/shared/agent/history-compression'
import { PromptBuilder } from '@/main/lib/agent/prompt-builder'
import {
  getAttachmentPreview,
  discardAttachment,
  importAttachments,
  prepareAgentAttachments,
  removeSessionAttachments,
  sanitizeMessageAttachments
} from '@/main/lib/attachments'

const backgroundCompressionBySession = new Map<string, Promise<void>>()
const activeChatControllers = new Map<string, AbortController>()
const activeToolCancellations = new Map<string, () => void>()
const pendingToolApprovals = new Map<
  string,
  {
    sessionId: string
    toolName: string
    risk: ToolApprovalRequest['risk']
    allowSession: boolean
    resolve: (decision: ToolApprovalDecision['decision']) => void
  }
>()
const sessionToolAllowances = new Map<string, Set<string>>()

function isContextLengthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /context.{0,20}(length|window|token)|maximum context|too many tokens/i.test(message)
}

function buildSystemPrompt(
  repository: ReturnType<typeof getChatRepository>,
  sessionId: string,
  locale: ChatMessage['locale']
): string {
  const prompt = new PromptBuilder().build({ settings: repository.getPromptSettings(), locale })
  const permissions = repository.getPermissionSettings(sessionId)
  if (!permissions.workspacePath) return prompt
  return `${prompt}\n\n文件工具上下文：\n- 当前安全工作文件夹：${permissions.workspacePath}\n- 优先使用相对于该文件夹的路径。\n- 不要尝试绕过权限审批或将外部路径伪装为工作文件夹内路径。`
}

export default () => {
  ipcMain.handle(CHAT_CHANNELS.CHAT_CANCEL, (_event, sessionId: string) => {
    activeChatControllers.get(sessionId)?.abort()
  })
  ipcMain.handle(CHAT_CHANNELS.TOOL_CANCEL, (_event, request: ToolCancelRequest) => {
    if (!request || typeof request.sessionId !== 'string' || typeof request.toolCallId !== 'string')
      return
    activeToolCancellations.get(`${request.sessionId}:${request.toolCallId}`)?.()
  })
  ipcMain.handle(CHAT_CHANNELS.TOOL_APPROVAL_RESOLVE, (_event, request: ToolApprovalDecision) => {
    if (!['allow_once', 'allow_session', 'reject'].includes(request.decision)) return
    const pending = pendingToolApprovals.get(request.approvalId)
    if (!pending || pending.sessionId !== request.sessionId) return
    const decision =
      request.decision === 'allow_session' && (pending.risk === 'high' || !pending.allowSession)
        ? 'allow_once'
        : request.decision
    if (decision === 'allow_session') {
      const allowedTools = sessionToolAllowances.get(request.sessionId) ?? new Set<string>()
      allowedTools.add(pending.toolName)
      sessionToolAllowances.set(request.sessionId, allowedTools)
    }
    pending.resolve(decision)
  })
  ipcMain.handle(CHAT_CHANNELS.SESSION_QUERY, () => getChatRepository().querySessions())
  ipcMain.handle(CHAT_CHANNELS.SESSION_CREATE, (_event, request: Session) =>
    getChatRepository().createSession(request)
  )
  ipcMain.handle(CHAT_CHANNELS.SESSION_UPDATE, (_event, request: Session) =>
    getChatRepository().updateSession(request)
  )
  ipcMain.handle(CHAT_CHANNELS.SESSION_DELETE, async (_event, id: string) => {
    sessionToolAllowances.delete(id)
    getChatRepository().deleteSession(id)
    try {
      await removeSessionAttachments(id)
    } catch (error) {
      console.warn('Failed to remove session attachments', error)
    }
  })
  ipcMain.handle(CHAT_CHANNELS.MESSAGE_QUERY, (_event, sessionId: string) =>
    getChatRepository().queryMessages(sessionId)
  )
  ipcMain.handle(CHAT_CHANNELS.ATTACHMENT_SELECT, async (event, sessionId: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '添加附件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '支持的文件',
          extensions: [
            'png',
            'jpg',
            'jpeg',
            'gif',
            'webp',
            'pdf',
            'txt',
            'md',
            'csv',
            'json',
            'yaml',
            'yml',
            'xml',
            'html',
            'css',
            'ts',
            'tsx',
            'js',
            'jsx',
            'vue',
            'py',
            'java',
            'go',
            'rs',
            'swift',
            'kt',
            'c',
            'h',
            'cpp',
            'hpp',
            'sql',
            'log'
          ]
        }
      ]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled
      ? { attachments: [], errors: [] }
      : importAttachments(sessionId, result.filePaths)
  })
  ipcMain.handle(CHAT_CHANNELS.ATTACHMENT_IMPORT, (_event, request: AttachmentImportRequest) =>
    importAttachments(request.sessionId, request.paths)
  )
  ipcMain.handle(CHAT_CHANNELS.ATTACHMENT_PREVIEW, (_event, request: AttachmentPreviewRequest) =>
    getAttachmentPreview(request.sessionId, request.attachment)
  )
  ipcMain.handle(CHAT_CHANNELS.ATTACHMENT_DISCARD, (_event, request: AttachmentDiscardRequest) =>
    discardAttachment(request.sessionId, request.attachment)
  )
  ipcMain.handle(CHAT_CHANNELS.ATTACHMENT_SESSION_DISCARD, (_event, sessionId: string) =>
    removeSessionAttachments(sessionId)
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
  ipcMain.handle(CHAT_CHANNELS.PERMISSION_SETTINGS_QUERY, (_event, sessionId: string) =>
    getChatRepository().getPermissionSettings(sessionId)
  )
  ipcMain.handle(
    CHAT_CHANNELS.PERMISSION_SETTINGS_UPDATE,
    async (_event, request: SessionPermissionSettings) => {
      const workspacePath = request.workspacePath.trim()
      if (workspacePath) {
        if (!path.isAbsolute(workspacePath)) throw new Error('工作文件夹必须是绝对路径')
        const folderInfo = await stat(workspacePath)
        if (!folderInfo.isDirectory()) throw new Error('所选工作路径不是文件夹')
      }
      sessionToolAllowances.delete(request.sessionId)
      return getChatRepository().savePermissionSettings(request.sessionId, {
        workspacePath,
        mode: request.mode
      })
    }
  )
  ipcMain.handle(CHAT_CHANNELS.WORKSPACE_FOLDER_SELECT, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '选择工作文件夹',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(CHAT_CHANNELS.GENERATED_FILE_OPEN, async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new Error('只能打开绝对文件路径')
    }
    const fileInfo = await lstat(filePath)
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
      throw new Error('目标不是可打开的普通文件')
    }
    const openError = await shell.openPath(filePath)
    if (openError) throw new Error(openError)
  })
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
        buildSystemPrompt(repository, request.sessionId, request.locale)
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
      const requestMessages = await sanitizeMessageAttachments(
        request.conversationId,
        request.messages
      )
      repository.saveMessages(request.conversationId, requestMessages)
      const agent = new Agent(
        modelConfig,
        repository.getSearchProviderConfigs(),
        repository.getPermissionSettings(request.conversationId)
      )
      const systemPrompt = buildSystemPrompt(repository, request.conversationId, request.locale)
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
        if ((!showToolCallDetails && call.name !== 'download_file') || event.sender.isDestroyed())
          return
        event.sender.send(CHAT_CHANNELS.TOOL_ACTIVITY_CHANGED, {
          sessionId: request.conversationId,
          call
        })
      }
      const onToolApproval = (
        approvalRequest: Omit<ToolApprovalRequest, 'sessionId'>
      ): Promise<ToolApprovalDecision['decision']> => {
        if (
          approvalRequest.allowSession &&
          sessionToolAllowances.get(request.conversationId)?.has(approvalRequest.name)
        ) {
          return Promise.resolve('allow_session')
        }
        return new Promise((resolve) => {
          const approvalId = crypto.randomUUID()
          const payload: ToolApprovalRequest = {
            ...approvalRequest,
            id: approvalId,
            sessionId: request.conversationId
          }
          const finish = (decision: ToolApprovalDecision['decision']): void => {
            pendingToolApprovals.delete(approvalId)
            controller.signal.removeEventListener('abort', rejectOnAbort)
            event.sender.removeListener('destroyed', rejectOnDestroyed)
            resolve(decision)
          }
          const rejectOnAbort = (): void => finish('reject')
          const rejectOnDestroyed = (): void => finish('reject')
          pendingToolApprovals.set(approvalId, {
            sessionId: request.conversationId,
            toolName: approvalRequest.name,
            risk: approvalRequest.risk,
            allowSession: approvalRequest.allowSession,
            resolve: finish
          })
          controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
          event.sender.once('destroyed', rejectOnDestroyed)
          if (controller.signal.aborted || event.sender.isDestroyed()) finish('reject')
          else event.sender.send(CHAT_CHANNELS.TOOL_APPROVAL_REQUESTED, payload)
        })
      }
      const onToolCancellable = (toolCallId: string, cancel: (() => void) | null): void => {
        const key = `${request.conversationId}:${toolCallId}`
        if (cancel) activeToolCancellations.set(key, cancel)
        else activeToolCancellations.delete(key)
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
          ? [...requestMessages, partialMessage]
          : requestMessages
        return {
          message: partialMessage,
          compression: compressor.getStatus(request.conversationId, partialHistory),
          stopped: true
        }
      }
      let context: AgentInputMessage[] = compressor.buildUncompressedContext(
        request.conversationId,
        requestMessages
      )
      try {
        const compression = await compressor.buildContext(request.conversationId, requestMessages)
        context = compression.messages
        if (compression.compressed) {
          console.info(
            `[history] compressed session=${request.conversationId} tokens=${compression.estimatedTokens}`
          )
        }
      } catch (error) {
        const status = compressor.getStatus(request.conversationId, requestMessages)
        if (status.estimatedTokens >= status.emergencyThresholdTokens) {
          context = compressor.buildEmergencyContext(request.conversationId, requestMessages)
          console.warn('[history] compression failed, using emergency context', error)
        } else {
          context = compressor.buildUncompressedContext(request.conversationId, requestMessages)
          console.warn('[history] compression failed, using full history', error)
        }
      }
      context = await prepareAgentAttachments(request.conversationId, context)
      let estimatedPromptTokens = estimateMessageTokens(context)
      let response
      try {
        response = await agent.chat(context, {
          onContentUpdate,
          onToolActivity,
          onToolCancellable,
          onToolApproval,
          signal: controller.signal
        })
      } catch (error) {
        if (controller.signal.aborted) return buildStoppedResponse()
        if (!isContextLengthError(error)) throw error
        context = await prepareAgentAttachments(
          request.conversationId,
          compressor.buildEmergencyContext(request.conversationId, requestMessages)
        )
        estimatedPromptTokens = estimateMessageTokens(context)
        try {
          response = await agent.chat(context, {
            onContentUpdate,
            onToolActivity,
            onToolCancellable,
            onToolApproval,
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
      const completedHistory = [...requestMessages, message]
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
