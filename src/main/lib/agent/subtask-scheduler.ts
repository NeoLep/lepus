import type {
  AgentRun,
  ModelConfig,
  PermissionSettings,
  SearchCitation,
  SearchProviderConfig,
  SkillDefinition,
  ToolApprovalRequest,
  ToolCallRecord
} from '@/ipc/chat/constants'
import type { ChatRepository } from '@/ipc/chat/repository'
import { Agent } from './index'
import type { DelegatedTaskInput } from './tools'

const MAX_CONCURRENT_SUBTASKS = 2
const MAX_SUBTASK_TOOL_ROUNDS = 6
const SUBTASK_TIMEOUT_MS = 120_000
const MAX_SUBTASK_RESULT_CHARACTERS = 20_000

export type SubtaskResult = {
  id: string
  runId: string
  status: 'completed' | 'failed' | 'canceled'
  result?: string
  error?: string
  sources?: SearchCitation[]
}

export type SubtaskSchedulerOptions = {
  repository: ChatRepository
  sessionId: string
  parentRunId: string
  modelConfig: ModelConfig
  searchConfigs: SearchProviderConfig[]
  permissionSettings: PermissionSettings
  systemPrompt: string
  activeSkills?: SkillDefinition[]
  onRunChanged?: (run: AgentRun) => void
  onToolApproval?: (
    request: Omit<ToolApprovalRequest, 'sessionId'>,
    signal?: AbortSignal
  ) => Promise<'allow_once' | 'allow_session' | 'reject'>
}

export class SubtaskScheduler {
  private executed = false

  constructor(private readonly options: SubtaskSchedulerOptions) {}

  async execute(
    tasks: DelegatedTaskInput[],
    signal?: AbortSignal
  ): Promise<{ tasks: SubtaskResult[] }> {
    if (this.executed) throw new Error('当前 Agent Run 已经委派过一次子任务')
    if (tasks.length < 1 || tasks.length > 4) throw new Error('每次必须委派 1 到 4 个子任务')
    this.executed = true
    const runs = tasks.map((task) => this.createQueuedRun(task))
    const results = new Array<SubtaskResult>(tasks.length)
    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < tasks.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await this.executeTask(tasks[index], runs[index], signal)
      }
    }
    const workerCount = Math.min(MAX_CONCURRENT_SUBTASKS, tasks.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    return { tasks: results }
  }

  private createQueuedRun(task: DelegatedTaskInput): AgentRun {
    return this.persist({
      id: crypto.randomUUID(),
      sessionId: this.options.sessionId,
      parentRunId: this.options.parentRunId,
      kind: 'subtask',
      goal: task.goal,
      status: 'queued',
      modelConfigId: this.options.modelConfig.id,
      taskModeActive: false,
      toolCallCount: 0,
      createdAt: new Date().toISOString()
    })
  }

  private async executeTask(
    task: DelegatedTaskInput,
    initialRun: AgentRun,
    parentSignal?: AbortSignal
  ): Promise<SubtaskResult> {
    let run = initialRun
    const observedToolCallIds = new Set<string>()
    let pendingApprovals = 0
    const timeoutSignal = AbortSignal.timeout(SUBTASK_TIMEOUT_MS)
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal
    const updateRun = (changes: Partial<AgentRun>): AgentRun => {
      run = this.persist({ ...run, ...changes })
      return run
    }

    if (parentSignal?.aborted) {
      updateRun({
        status: 'canceled',
        errorName: 'CanceledError',
        errorMessage: '父 Agent Run 已取消',
        finishedAt: new Date().toISOString()
      })
      return { id: task.id, runId: run.id, status: 'canceled', error: run.errorMessage }
    }

    updateRun({ status: 'running', startedAt: new Date().toISOString() })
    const childAgent = new Agent(
      this.options.modelConfig,
      this.options.searchConfigs,
      this.options.permissionSettings,
      false,
      {
        readOnly: true,
        maxToolRounds: MAX_SUBTASK_TOOL_ROUNDS,
        activeSkills: this.options.activeSkills
      }
    )
    const onToolActivity = (call: ToolCallRecord): void => {
      if (observedToolCallIds.has(call.id)) return
      observedToolCallIds.add(call.id)
      updateRun({ toolCallCount: observedToolCallIds.size })
    }
    const onToolApproval = async (
      request: Omit<ToolApprovalRequest, 'sessionId'>
    ): Promise<'allow_once' | 'allow_session' | 'reject'> => {
      if (!this.options.onToolApproval) return 'reject'
      pendingApprovals += 1
      updateRun({ status: 'waiting_approval' })
      try {
        return await this.options.onToolApproval(request, signal)
      } finally {
        pendingApprovals -= 1
        if (pendingApprovals === 0 && !signal.aborted) updateRun({ status: 'running' })
      }
    }

    try {
      const response = await childAgent.chat(
        [
          {
            role: 'system',
            content: `${this.options.systemPrompt}\n\n<sub_agent_mode>
You are a read-only sub-agent working for a parent agent.
- Complete only the delegated goal below.
- You may inspect and search available information, but you must not modify, create, move, download, or delete files.
- Do not ask the user questions and do not attempt to delegate more work.
- Report concrete findings and evidence. Include relevant file paths and line numbers when available.
- If the task is blocked, explain exactly what is missing.
</sub_agent_mode>`
          },
          {
            role: 'user',
            content: `<delegated_task>\n${JSON.stringify({ id: task.id, goal: task.goal, context: task.context ?? '' })}\n</delegated_task>`
          }
        ],
        {
          signal,
          onToolActivity,
          onToolApproval
        }
      )
      const rawResult = response.message.content ?? ''
      const truncated = rawResult.length > MAX_SUBTASK_RESULT_CHARACTERS
      const result = truncated
        ? `${rawResult.slice(0, MAX_SUBTASK_RESULT_CHARACTERS)}\n\n[子 Agent 输出已截断]`
        : rawResult
      updateRun({
        status: 'completed',
        result,
        ...(response.promptTokens ? { promptTokens: response.promptTokens } : {}),
        toolCallCount: response.toolCalls.length,
        finishedAt: new Date().toISOString()
      })
      return {
        id: task.id,
        runId: run.id,
        status: 'completed',
        result,
        ...(response.sources.length ? { sources: response.sources } : {})
      }
    } catch (error) {
      const canceled = parentSignal?.aborted === true
      const timedOut = !canceled && timeoutSignal.aborted
      const errorName = canceled
        ? 'CanceledError'
        : timedOut
          ? 'TimeoutError'
          : error instanceof Error
            ? error.name || 'Error'
            : 'UnknownError'
      const errorMessage = canceled
        ? '父 Agent Run 已取消'
        : timedOut
          ? `子任务执行超过 ${SUBTASK_TIMEOUT_MS / 1_000} 秒`
          : error instanceof Error
            ? error.message
            : String(error)
      updateRun({
        status: canceled ? 'canceled' : 'failed',
        errorName,
        errorMessage: errorMessage.slice(0, 2_000),
        toolCallCount: observedToolCallIds.size,
        finishedAt: new Date().toISOString()
      })
      return {
        id: task.id,
        runId: run.id,
        status: canceled ? 'canceled' : 'failed',
        error: run.errorMessage
      }
    }
  }

  private persist(run: AgentRun): AgentRun {
    const saved = this.options.repository.saveAgentRun(run)
    this.options.onRunChanged?.(saved)
    return saved
  }
}
