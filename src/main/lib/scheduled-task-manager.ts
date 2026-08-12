import { BrowserWindow, Notification } from 'electron'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { Agent } from '@/main/lib/agent'
import { PromptBuilder } from '@/main/lib/agent/prompt-builder'
import {
  buildExplicitSkillInvocationPrompt,
  buildSkillPrompt,
  matchSkills
} from '@/main/lib/agent/skill-router'
import { synchronizeLocalFolderSkills } from '@/main/lib/agent/skill-sync'
import { getChatRepository } from '@/ipc/chat/repository'
import { SCHEDULED_TASK_CHANNELS, type ScheduledTask } from '@/ipc/scheduled/constants'
import type { Message } from '@/ipc/chat/constants'
import {
  CAPABILITY_TOOL_NAMES,
  capabilityToolNames,
  normalizeCapabilities
} from '@/shared/agent/capabilities'

const POLL_INTERVAL_MS = 30_000
function nextOccurrence(task: ScheduledTask, after = new Date()): string | null {
  if (!task.enabled) return null
  if (task.scheduleType === 'once') {
    if (!task.runAt) return null
    return Date.parse(task.runAt) > after.getTime() ? task.runAt : null
  }
  const [hour, minute] = task.timeOfDay.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(after)
    candidate.setHours(hour, minute, 0, 0)
    candidate.setDate(candidate.getDate() + offset)
    if (candidate.getTime() <= after.getTime()) continue
    if (task.scheduleType === 'daily' || task.weekdays.includes(candidate.getDay())) {
      return candidate.toISOString()
    }
  }
  return null
}

function nextOccurrenceAfterMiss(task: ScheduledTask, now = new Date()): string | null {
  if (!task.enabled) return null
  if (task.scheduleType === 'once') {
    if (!task.runAt || !task.nextRunAt) return null
    return Date.parse(task.nextRunAt) <= now.getTime() ? null : task.nextRunAt
  }
  return nextOccurrence(task, now)
}

function validateTask(task: ScheduledTask): void {
  if (!task.name.trim() || task.name.trim().length > 80)
    throw new Error('任务名称不能为空且不能超过 80 字')
  if (!task.prompt.trim() || task.prompt.trim().length > 20_000) {
    throw new Error('任务内容不能为空且不能超过 20,000 字')
  }
  if (!['once', 'daily', 'weekly'].includes(task.scheduleType)) throw new Error('计划类型无效')
  if (task.scheduleType === 'once' && (!task.runAt || !Number.isFinite(Date.parse(task.runAt)))) {
    throw new Error('请选择有效的执行时间')
  }
  if (task.scheduleType !== 'once' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.timeOfDay)) {
    throw new Error('每日执行时间无效')
  }
  if (
    task.scheduleType === 'weekly' &&
    (task.weekdays.length === 0 ||
      task.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  ) {
    throw new Error('每周任务至少选择一个有效星期')
  }
  const capabilities = normalizeCapabilities(task.capabilities)
  if (!capabilities.length) throw new Error('请至少选择一项运行权限')
  if (task.skillIds.length > 3) throw new Error('每个任务最多选择 3 个 Skill')
  if (task.skillIds.length && !capabilities.some((item) => ['skills', 'skill_scripts'].includes(item))) {
    throw new Error('使用 Skill 需要启用“使用 Skills”权限')
  }
  const needsWorkspace = capabilities.some((item) =>
    ['workspace_read', 'workspace_write', 'downloads'].includes(item)
  )
  if (needsWorkspace) {
    const workspacePath = task.workspacePath.trim()
    if (!workspacePath) throw new Error('文件相关权限需要先选择工作区')
    if (!isAbsolute(workspacePath)) throw new Error('工作区必须使用绝对路径')
    try {
      if (!statSync(workspacePath).isDirectory()) throw new Error('工作区不是文件夹')
    } catch {
      throw new Error('工作区不存在或无法访问')
    }
  }
  if (!Number.isInteger(task.maxToolRounds) || task.maxToolRounds < 1 || task.maxToolRounds > 64) {
    throw new Error('最大工具轮次必须在 1 到 64 之间')
  }
}

class ScheduledTaskManager {
  private timer: NodeJS.Timeout | null = null
  private running = new Set<string>()

  start(): void {
    if (this.timer) return
    this.recoverInterruptedRuns()
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  query(): ScheduledTask[] {
    return getChatRepository().queryScheduledTasks()
  }

  save(input: ScheduledTask): ScheduledTask {
    validateTask(input)
    const repository = getChatRepository()
    if (!repository.getModelConfigMetadata(input.modelConfigId))
      throw new Error('所选模型配置不存在')
    const enabledSkillIds = new Set(
      repository
        .querySkills()
        .filter((skill) => skill.enabled)
        .map((skill) => skill.id.toLocaleLowerCase())
    )
    const unavailableSkillIds = input.skillIds.filter(
      (id) => !enabledSkillIds.has(id.toLocaleLowerCase())
    )
    if (unavailableSkillIds.length) {
      throw new Error(`所选 Skill 已停用或不存在：${unavailableSkillIds.join('、')}`)
    }
    const existing = repository.getScheduledTask(input.id)
    const now = new Date().toISOString()
    const task: ScheduledTask = {
      ...input,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      weekdays: [...new Set(input.weekdays)].sort(),
      capabilities: normalizeCapabilities(input.capabilities),
      skillIds: [...new Set(input.skillIds.map((item) => item.trim()).filter(Boolean))],
      workspacePath: input.workspacePath.trim(),
      status: existing?.status === 'running' ? 'running' : 'idle',
      lastRunAt: existing?.lastRunAt ?? null,
      lastError: existing?.lastError ?? '',
      lastSessionId: existing?.lastSessionId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      nextRunAt: null
    }
    task.nextRunAt = nextOccurrence(task)
    if (task.enabled && !task.nextRunAt) throw new Error('执行时间必须晚于当前时间')
    const saved = repository.saveScheduledTask(task)
    this.publish(saved)
    return saved
  }

  delete(id: string): void {
    if (this.running.has(id)) throw new Error('任务正在运行，暂时无法删除')
    getChatRepository().deleteScheduledTask(id)
  }

  runNow(id: string): void {
    const task = getChatRepository().getScheduledTask(id)
    if (!task) throw new Error('定时任务不存在')
    if (this.running.has(id)) throw new Error('任务已经在运行')
    void this.execute(task, false)
  }

  private recoverInterruptedRuns(): void {
    const repository = getChatRepository()
    for (const task of repository
      .queryScheduledTasks()
      .filter((item) => item.status === 'running')) {
      repository.saveScheduledTask({
        ...task,
        status: 'failed',
        lastError: '应用在任务完成前退出',
        nextRunAt: nextOccurrenceAfterMiss(task),
        updatedAt: new Date().toISOString()
      })
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now()
    const tasks = this.query()
    const due = tasks.filter((task) => {
      if (!task.enabled || !task.nextRunAt || this.running.has(task.id)) return false
      const scheduledAt = Date.parse(task.nextRunAt)
      return scheduledAt <= now && now - scheduledAt <= POLL_INTERVAL_MS * 2
    })
    for (const task of tasks) {
      if (!task.enabled || !task.nextRunAt || this.running.has(task.id)) continue
      const scheduledAt = Date.parse(task.nextRunAt)
      if (scheduledAt > now || now - scheduledAt <= POLL_INTERVAL_MS * 2) continue
      const enabled = task.scheduleType === 'once' ? false : task.enabled
      const skipped = getChatRepository().saveScheduledTask({
        ...task,
        enabled,
        status: 'failed',
        lastError: '应用未运行，已错过本次计划时间',
        nextRunAt: nextOccurrenceAfterMiss({ ...task, enabled }, new Date(now)),
        updatedAt: new Date(now).toISOString()
      })
      this.publish(skipped)
    }
    await Promise.all(due.map((task) => this.execute(task, true)))
  }

  private async execute(task: ScheduledTask, scheduled: boolean): Promise<void> {
    this.running.add(task.id)
    const repository = getChatRepository()
    const startedAt = new Date().toISOString()
    let current = repository.saveScheduledTask({
      ...task,
      status: 'running',
      lastRunAt: startedAt,
      lastError: '',
      updatedAt: startedAt
    })
    this.publish(current)
    try {
      const modelConfig = repository.getModelConfig(task.modelConfigId)
      if (!modelConfig) throw new Error('模型配置已不存在或无法读取')
      const sessionId = `scheduled-${task.id}-${randomUUID().slice(0, 8)}`
      const session = repository.createSession({
        id: sessionId,
        title: `定时任务 · ${task.name}`,
        createdAt: startedAt,
        updatedAt: startedAt,
        isPinned: false,
        isArchived: false,
        taskMode: 'off'
      })
      const userMessage: Message = {
        id: randomUUID(),
        role: 'user',
        content: task.prompt,
        createdAt: startedAt
      }
      repository.createMessage(sessionId, userMessage)
      const enabledCapabilities = new Set(task.capabilities)
      const availableSkills = await synchronizeLocalFolderSkills(repository)
      const activeSkills =
        enabledCapabilities.has('skills') || enabledCapabilities.has('skill_scripts')
          ? matchSkills(availableSkills, task.prompt, task.skillIds)
          : []
      const missingSkillIds = task.skillIds.filter(
        (id) => !activeSkills.some((skill) => skill.id.toLocaleLowerCase() === id.toLocaleLowerCase())
      )
      if (missingSkillIds.length) {
        throw new Error(`所选 Skill 已停用或不存在：${missingSkillIds.join('、')}`)
      }
      const allowedToolNames = capabilityToolNames(task.capabilities)
      const systemPrompt = [
        new PromptBuilder().build({ settings: repository.getPromptSettings(), locale: 'zh-CN' }),
        buildSkillPrompt(activeSkills, {
          skillScriptsPreauthorized: enabledCapabilities.has('skill_scripts')
        }),
        buildExplicitSkillInvocationPrompt(activeSkills, task.skillIds, task.prompt),
        `<scheduled_task>这是用户预先创建的无人值守定时任务。完成任务并直接给出结果。仅可使用本轮提供的能力；这些能力已由用户在任务中预授权，不得请求用户输入或尝试未授权操作。所有文件操作必须限制在指定工作区内。无法完成时说明缺少的权限。</scheduled_task>`
      ].join('\n\n')
      const agent = new Agent(
        modelConfig,
        repository.getSearchProviderConfigs(),
        {
          workspacePath: task.workspacePath,
          mode: 'full_access',
          trustedBrowserOrigins: [],
          capabilities: task.capabilities
        },
        false,
        {
          readOnly: !enabledCapabilities.has('workspace_write'),
          allowBrowserTools:
            enabledCapabilities.has('browser_public') ||
            enabledCapabilities.has('browser_private'),
          allowClipboardTool: enabledCapabilities.has('clipboard'),
          allowSkillScripts: enabledCapabilities.has('skill_scripts'),
          allowedToolNames,
          approvalFreeToolNames: new Set(
            task.capabilities.flatMap((capability) => [...CAPABILITY_TOOL_NAMES[capability]])
          ),
          activeSkills,
          maxToolRounds: task.maxToolRounds
        }
      )
      const response = await agent.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.prompt }
      ])
      const finishedAt = new Date().toISOString()
      const assistantMessage: Message = {
        id: randomUUID(),
        role: 'assistant',
        content: response.message.content ?? '',
        createdAt: finishedAt,
        toolCalls: response.toolCalls,
        sources: response.sources
      }
      repository.createMessage(sessionId, assistantMessage)
      repository.updateSession({ ...session, updatedAt: finishedAt })
      const enabled = scheduled && task.scheduleType === 'once' ? false : task.enabled
      current = repository.saveScheduledTask({
        ...current,
        enabled,
        status: 'succeeded',
        lastSessionId: sessionId,
        lastError: '',
        nextRunAt: nextOccurrence({ ...current, enabled }, new Date()),
        updatedAt: finishedAt
      })
      this.notify(task.name, '任务已完成，结果已保存到新对话。')
    } catch (error) {
      const finishedAt = new Date().toISOString()
      const message = error instanceof Error ? error.message : String(error)
      const enabled = scheduled && task.scheduleType === 'once' ? false : task.enabled
      current = repository.saveScheduledTask({
        ...current,
        enabled,
        status: 'failed',
        lastError: message.slice(0, 500),
        nextRunAt: nextOccurrence({ ...current, enabled }, new Date()),
        updatedAt: finishedAt
      })
      this.notify(task.name, `任务失败：${message.slice(0, 100)}`)
    } finally {
      this.running.delete(task.id)
      this.publish(current)
    }
  }

  private publish(task: ScheduledTask): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(SCHEDULED_TASK_CHANNELS.CHANGED, task)
    }
  }

  private notify(title: string, body: string): void {
    if (Notification.isSupported()) new Notification({ title: `Lepus · ${title}`, body }).show()
  }
}

export const scheduledTaskManager = new ScheduledTaskManager()
