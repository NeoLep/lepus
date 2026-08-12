export type ScheduleType = 'once' | 'daily' | 'weekly'
export type ScheduledTaskStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export type ScheduledTask = {
  id: string
  name: string
  prompt: string
  scheduleType: ScheduleType
  runAt: string | null
  timeOfDay: string
  weekdays: number[]
  modelConfigId: string
  skillIds: string[]
  capabilities: import('@/shared/agent/capabilities').AgentCapability[]
  workspacePath: string
  maxToolRounds: number
  enabled: boolean
  status: ScheduledTaskStatus
  lastRunAt: string | null
  nextRunAt: string | null
  lastError: string
  lastSessionId: string | null
  createdAt: string
  updatedAt: string
}

export const SCHEDULED_TASK_CHANNELS = {
  QUERY: 'scheduled-task:query',
  SAVE: 'scheduled-task:save',
  DELETE: 'scheduled-task:delete',
  RUN_NOW: 'scheduled-task:run-now',
  CHANGED: 'scheduled-task:changed'
} as const
