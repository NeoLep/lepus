import { BrowserWindow } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import * as lark from '@larksuiteoapi/node-sdk'
import { Agent } from '@/main/lib/agent'
import { HistoryCompressor } from '@/main/lib/agent/history-compressor'
import { PromptBuilder } from '@/main/lib/agent/prompt-builder'
import { buildSkillPrompt, matchSkills } from '@/main/lib/agent/skill-router'
import { synchronizeLocalFolderSkills } from '@/main/lib/agent/skill-sync'
import {
  isFeishuFormatError,
  markdownToFeishuPost,
  splitFeishuMarkdown
} from '@/main/lib/remote-bot/feishu-markdown'
import {
  CHAT_CHANNELS,
  type Message,
  type RemoteBotSettings,
  type RemoteBotStatus
} from '@/ipc/chat/constants'
import { getChatRepository } from '@/ipc/chat/repository'
import { CAPABILITY_TOOL_NAMES, capabilityToolNames } from '@/shared/agent/capabilities'

type FeishuMessageEvent = Parameters<NonNullable<lark.EventHandles['im.message.receive_v1']>>[0]

const MAX_SEEN_EVENTS = 1_000

function formatRemoteConversationError(error: unknown): string {
  const details =
    error && typeof error === 'object'
      ? (error as {
          status?: unknown
          message?: unknown
          error?: { message?: unknown; code?: unknown }
        })
      : null
  const status = typeof details?.status === 'number' ? details.status : null
  const providerMessage =
    typeof details?.error?.message === 'string'
      ? details.error.message
      : typeof details?.message === 'string'
        ? details.message
        : error instanceof Error
          ? error.message
          : String(error)

  if (status === 402 || /insufficient balance/i.test(providerMessage)) {
    return '当前模型服务账户余额不足。请在模型供应商后台充值，或回到 Lepus 桌面端切换到其他可用模型后重试。'
  }
  if (status === 401) {
    return '当前模型服务鉴权失败。请回到 Lepus 桌面端检查模型 API Key。'
  }
  if (status === 403) {
    return '当前模型服务拒绝了请求。请检查账户权限、模型访问权限或供应商地区限制。'
  }
  if (status === 429) {
    return '当前模型服务请求过于频繁或额度已用尽，请稍后重试或切换模型。'
  }
  if (status !== null && status >= 500) {
    return '当前模型服务暂时不可用，请稍后重试。'
  }
  return providerMessage.slice(0, 500)
}

function parseNewConversationCommand(text: string): { matched: boolean; content: string } {
  const match = text.match(/^(?:\/(?:new|reset)|新会话)(?:\s+([\s\S]*))?$/i)
  return match
    ? { matched: true, content: match[1]?.trim() ?? '' }
    : { matched: false, content: text }
}

function initialStatus(): RemoteBotStatus {
  return {
    state: 'stopped',
    message: '远程机器人未启用',
    updatedAt: new Date().toISOString()
  }
}

class RemoteBotManager {
  private wsClient: lark.WSClient | null = null
  private apiClient: lark.Client | null = null
  private status: RemoteBotStatus = initialStatus()
  private generation = 0
  private seenEvents = new Set<string>()
  private sessionQueues = new Map<string, Promise<void>>()
  private userNames = new Map<string, string>()

  getStatus(): RemoteBotStatus {
    return { ...this.status }
  }

  private publishStatus(changes: Partial<RemoteBotStatus>): void {
    this.status = { ...this.status, ...changes, updatedAt: new Date().toISOString() }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(CHAT_CHANNELS.REMOTE_BOT_STATUS_CHANGED, this.getStatus())
      }
    }
  }

  async reload(): Promise<void> {
    this.stop()
    const settings = getChatRepository().getRemoteBotSettings(true)
    if (!settings.enabled) return
    await this.start(settings)
  }

  stop(): void {
    this.generation += 1
    this.wsClient?.close({ force: true })
    this.wsClient = null
    this.apiClient = null
    this.seenEvents.clear()
    this.userNames.clear()
    this.publishStatus({ state: 'stopped', message: '远程机器人未启用' })
  }

  private async start(settings: RemoteBotSettings): Promise<void> {
    if (!settings.appId || !settings.appSecret) {
      this.publishStatus({ state: 'error', message: '飞书 App ID 或 App Secret 缺失' })
      return
    }
    const generation = ++this.generation
    this.publishStatus({ state: 'connecting', message: '正在连接飞书…' })
    this.apiClient = new lark.Client({
      appId: settings.appId,
      appSecret: settings.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.warn
    })
    const dispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': (event) => {
        if (generation !== this.generation) return
        void this.enqueueMessage(event, settings).catch((error) => {
          console.error('[remote-bot] failed to handle Feishu message', error)
        })
      }
    })
    this.wsClient = new lark.WSClient({
      appId: settings.appId,
      appSecret: settings.appSecret,
      domain: lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.warn,
      autoReconnect: true,
      handshakeTimeoutMs: 15_000,
      onReady: () => {
        if (generation === this.generation) {
          this.publishStatus({ state: 'connected', message: '已连接飞书，机器人可以接收消息' })
        }
      },
      onReconnecting: () => {
        if (generation === this.generation) {
          this.publishStatus({ state: 'connecting', message: '飞书连接中断，正在重连…' })
        }
      },
      onReconnected: () => {
        if (generation === this.generation) {
          this.publishStatus({ state: 'connected', message: '已重新连接飞书' })
        }
      },
      onError: (error) => {
        if (generation === this.generation) {
          this.publishStatus({ state: 'error', message: `飞书连接失败：${error.message}` })
        }
      }
    })
    try {
      await this.wsClient.start({ eventDispatcher: dispatcher })
    } catch (error) {
      if (generation === this.generation) {
        this.publishStatus({
          state: 'error',
          message: `飞书连接失败：${error instanceof Error ? error.message : String(error)}`
        })
      }
    }
  }

  private enqueueMessage(event: FeishuMessageEvent, settings: RemoteBotSettings): Promise<void> {
    const eventId = event.event_id || event.message.message_id
    if (this.seenEvents.has(eventId)) return Promise.resolve()
    this.seenEvents.add(eventId)
    if (this.seenEvents.size > MAX_SEEN_EVENTS) {
      this.seenEvents.delete(this.seenEvents.values().next().value as string)
    }
    const senderOpenId = event.sender.sender_id?.open_id ?? ''
    if (
      event.sender.sender_type !== 'user' ||
      (settings.allowedOpenIds.length > 0 && !settings.allowedOpenIds.includes(senderOpenId))
    ) {
      return Promise.resolve()
    }
    if (event.message.message_type !== 'text') {
      return this.sendMarkdown(event.message.chat_id, '目前只支持文本消息。')
    }
    let text = ''
    try {
      const content = JSON.parse(event.message.content) as { text?: unknown }
      text = typeof content.text === 'string' ? content.text.trim() : ''
    } catch {
      return this.sendMarkdown(event.message.chat_id, '消息格式无法解析。')
    }
    for (const mention of event.message.mentions ?? []) {
      text = text.replaceAll(mention.key, '').trim()
    }
    if (!text) return Promise.resolve()

    const channelKey = this.sessionId(settings.appId, event.message.chat_id)
    const repository = getChatRepository()
    const currentSessionId = repository.getRemoteChatSessionId(channelKey) ?? channelKey
    this.publishStatus({
      lastEventAt: new Date().toISOString(),
      lastSenderOpenId: senderOpenId,
      lastSessionId: currentSessionId,
      message: '已收到飞书消息，Lepus 正在处理'
    })
    const previous = this.sessionQueues.get(channelKey) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          const newConversation = parseNewConversationCommand(text)
          const sessionId = newConversation.matched
            ? await this.createRemoteSession(channelKey, event.message.chat_type, senderOpenId)
            : (repository.getRemoteChatSessionId(channelKey) ?? channelKey)
          this.publishStatus({ lastSessionId: sessionId })
          if (newConversation.matched && !newConversation.content) {
            await this.sendMarkdown(
              event.message.chat_id,
              '已开启新的 Lepus 会话。下一条消息将从空白上下文开始。'
            )
            this.publishStatus({ state: 'connected', message: '已开启新的飞书会话' })
            return
          }
          const reply = await this.runConversation(
            sessionId,
            newConversation.content,
            event.message.chat_type,
            senderOpenId,
            settings
          )
          await this.sendMarkdown(event.message.chat_id, reply || 'Lepus 没有生成可发送的回复。')
          this.publishStatus({ state: 'connected', message: '上一条飞书消息已处理完成' })
        } catch (error) {
          const message = formatRemoteConversationError(error)
          console.error('[remote-bot] conversation failed', error)
          await this.sendMarkdown(event.message.chat_id, `Lepus 处理失败：${message}`)
          this.publishStatus({ state: 'connected', message: `上一条消息处理失败：${message}` })
        }
      })
      .finally(() => {
        if (this.sessionQueues.get(channelKey) === next) this.sessionQueues.delete(channelKey)
      })
    this.sessionQueues.set(channelKey, next)
    return Promise.resolve()
  }

  private sessionId(appId: string, chatId: string): string {
    const digest = createHash('sha256').update(`${appId}:${chatId}`).digest('hex').slice(0, 32)
    return `remote-feishu-${digest}`
  }

  private async createRemoteSession(
    channelKey: string,
    chatType: string,
    senderOpenId: string
  ): Promise<string> {
    const repository = getChatRepository()
    const now = new Date().toISOString()
    const senderName = chatType === 'p2p' ? await this.resolveUserName(senderOpenId) : ''
    const sessionId = `${channelKey}-${randomUUID().slice(0, 8)}`
    repository.createSession({
      id: sessionId,
      title: chatType === 'p2p' ? `来自 ${senderName}` : '飞书群聊',
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      isArchived: false,
      taskMode: 'off'
    })
    repository.saveRemoteChatSessionId(channelKey, sessionId)
    return sessionId
  }

  private async runConversation(
    sessionId: string,
    content: string,
    chatType: string,
    senderOpenId: string,
    settings: RemoteBotSettings
  ): Promise<string> {
    const repository = getChatRepository()
    const modelMetadata = repository.queryModelConfigs().find((config) => config.isActive)
    if (!modelMetadata) throw new Error('请先在 Lepus 中配置并选择一个模型')
    const modelConfig = repository.getModelConfig(modelMetadata.id)
    if (!modelConfig) throw new Error('当前模型配置无法读取')
    const now = new Date().toISOString()
    let session = repository.getSession(sessionId)
    const senderName = chatType === 'p2p' ? await this.resolveUserName(senderOpenId) : ''
    const desiredTitle = chatType === 'p2p' ? `来自 ${senderName}` : '飞书群聊'
    if (!session) {
      session = repository.createSession({
        id: sessionId,
        title: desiredTitle,
        createdAt: now,
        updatedAt: now,
        isPinned: false,
        isArchived: false,
        taskMode: 'off'
      })
    } else if (
      session.title === '飞书 · 私聊' ||
      session.title === '飞书 · 群聊' ||
      session.title.startsWith('来自 ou_')
    ) {
      session = repository.updateSession({ ...session, title: desiredTitle, updatedAt: now })
    }
    const userMessage: Message = {
      id: randomUUID(),
      role: 'user',
      content,
      createdAt: now
    }
    repository.createMessage(sessionId, userMessage)
    const history = repository.queryMessages(sessionId)
    const enabledGroups = new Set(settings.allowedToolGroups)
    const availableSkills = await synchronizeLocalFolderSkills(repository)
    const activeSkills =
      enabledGroups.has('skills') || enabledGroups.has('skill_scripts')
        ? matchSkills(availableSkills, content)
        : []
    const explicitSkillId = content
      .match(/(?:^|\s)\/([a-z0-9][a-z0-9-]{0,63})(?=\s|$)/i)?.[1]
      ?.toLocaleLowerCase()
    const explicitScriptSkill = activeSkills.find(
      (skill) =>
        skill.id.toLocaleLowerCase() === explicitSkillId &&
        skill.files.some((file) => file.kind === 'script')
    )
    const allowedToolNames = capabilityToolNames(settings.allowedToolGroups)
    const systemPrompt = [
      new PromptBuilder().build({ settings: repository.getPromptSettings(), locale: 'zh-CN' }),
      buildSkillPrompt(activeSkills, {
        skillScriptsPreauthorized: enabledGroups.has('skill_scripts')
      }),
      explicitScriptSkill && enabledGroups.has('skill_scripts')
        ? `<explicit_skill_script>用户显式调用了 ${explicitScriptSkill.id}。必须优先按照该 Skill 的指令使用 run_skill_script 运行已登记脚本；不要先读取脚本源码，也不要用浏览器替代。只有脚本实际执行失败时才可以说明错误并选择其他已授权工具。</explicit_skill_script>`
        : '',
      `<remote_channel>当前消息来自用户配置的飞书远程机器人。仅执行本轮提供且由用户启用的工具；勾选的能力已由用户预授权。文件操作必须限制在指定工作区内。需要敏感输入或未授权能力时，清楚说明限制并让用户回到 Lepus 桌面端完成。</remote_channel>`
    ]
      .filter(Boolean)
      .join('\n\n')
    const agent = new Agent(
      modelConfig,
      repository.getSearchProviderConfigs(),
      {
        workspacePath:
          enabledGroups.has('workspace_read') ||
          enabledGroups.has('workspace_write') ||
          enabledGroups.has('downloads')
            ? settings.workspacePath
            : '',
        mode: 'request_approval',
        trustedBrowserOrigins: [],
        capabilities: settings.allowedToolGroups
      },
      false,
      {
        readOnly: !enabledGroups.has('workspace_write'),
        allowBrowserTools:
          enabledGroups.has('browser_public') || enabledGroups.has('browser_private'),
        allowClipboardTool: enabledGroups.has('clipboard'),
        allowSkillScripts: enabledGroups.has('skill_scripts'),
        allowedToolNames,
        approvalFreeToolNames: new Set([
          ...settings.allowedToolGroups.flatMap((group) => [...CAPABILITY_TOOL_NAMES[group]])
        ] as string[]),
        activeSkills,
        maxToolRounds: settings.maxToolRounds
      }
    )
    const context = new HistoryCompressor(
      repository,
      modelConfig,
      agent,
      systemPrompt
    ).buildUncompressedContext(sessionId, history)
    const response = await agent.chat(context, {
      onToolApproval: async () => 'reject'
    })
    const assistantMessage: Message = {
      id: randomUUID(),
      role: 'assistant',
      content: response.message.content ?? '',
      createdAt: new Date().toISOString(),
      toolCalls: response.toolCalls,
      sources: response.sources
    }
    repository.createMessage(sessionId, assistantMessage)
    repository.updateSession({ ...session, updatedAt: assistantMessage.createdAt })
    return assistantMessage.content
  }

  private async resolveUserName(openId: string): Promise<string> {
    if (!openId) return '未知用户'
    const cached = this.userNames.get(openId)
    if (cached) return cached
    try {
      const response = await this.apiClient?.contact.v3.user.get({
        params: { user_id_type: 'open_id' },
        path: { user_id: openId }
      })
      const name = response?.data?.user?.name?.trim() || response?.data?.user?.nickname?.trim()
      if (name) {
        this.userNames.set(openId, name)
        return name
      }
      if (response?.code) {
        console.warn(
          `[remote-bot] unable to resolve Feishu user name: ${response.msg ?? response.code}`
        )
      }
    } catch (error) {
      console.warn('[remote-bot] unable to resolve Feishu user name', error)
    }
    return openId
  }

  private async sendMarkdown(chatId: string, text: string): Promise<void> {
    if (!this.apiClient) throw new Error('飞书客户端尚未连接')
    for (const chunk of splitFeishuMarkdown(text)) {
      try {
        await this.apiClient.im.v1.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'post',
            content: JSON.stringify(markdownToFeishuPost(chunk))
          }
        })
      } catch (error) {
        if (!isFeishuFormatError(error)) throw error
        console.warn('[remote-bot] Feishu rejected Markdown post; falling back to text', error)
        await this.apiClient.im.v1.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text: chunk })
          }
        })
      }
    }
  }
}

export const remoteBotManager = new RemoteBotManager()
