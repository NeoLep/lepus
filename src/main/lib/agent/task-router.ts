import type { Message, TaskModePreference, TaskPlan } from '@/ipc/chat/constants'

export type TaskRoute = {
  preference: TaskModePreference
  active: boolean
  score: number
  reasons: string[]
}

const COMPLEX_ACTION =
  /(?:实现|开发|构建|重构|迁移|排查|修复|审计|规划|设计|部署|集成|补齐|增加.{0,8}功能|改造|优化|调研|对比.{0,12}(?:方案|产品)|implement|build|develop|refactor|migrat|debug|fix|audit|plan|design|deploy|integrat|investigat)/i
const TASK_WORKFLOW =
  /(?:任务模式|计划模式|执行计划|工作流|多步骤|路由功能|多智能体|多\s*agent|子\s*agent|子智能体|并行委派|委派.{0,8}任务|task mode|workflow|multi[\s-]*agent|sub[\s-]*agent|delegate)/i
const MULTI_AGENT_REQUEST =
  /(?:多智能体|多个?子智能体|多个?\s*子?\s*agent|使用.{0,12}(?:子\s*agent|子智能体)|并行委派|multi[\s-]*agent|multiple\s+(?:sub[\s-]*)?agents?|delegate.{0,20}(?:parallel|tasks?))/i
const CHANGE_REQUEST = /(?:增加|添加|支持|完善|修改|调整|新增|改一下|add|change|update|support)/i
const MULTI_STEP =
  /(?:然后|接着|同时|并且|以及|最后|先.{0,30}再|and then|after that|as well as|first.{0,40}then)/gi
const CODE_OR_FILE =
  /(?:[/\\][\w.-]+|`[^`]+`|\.(?:ts|tsx|js|jsx|vue|py|go|rs|java|md|json|ya?ml)\b|API\b|数据库|代码|组件|接口)/i
const ENUMERATED = /(?:^|\n)\s*(?:[-*]|\d+[.)、])\s+\S/g

export function routeTaskMode(
  preference: TaskModePreference,
  messages: Message[],
  currentPlan: TaskPlan | null = null
): TaskRoute {
  if (preference === 'on') {
    return { preference, active: true, score: 100, reasons: ['forced_on'] }
  }
  if (preference === 'off') {
    return { preference, active: false, score: 0, reasons: ['forced_off'] }
  }

  const latestUser = [...messages].reverse().find((message) => message.role === 'user')
  const content = latestUser?.content.trim() ?? ''
  let score = 0
  const reasons: string[] = []
  const add = (points: number, reason: string): void => {
    score += points
    reasons.push(reason)
  }

  if (
    currentPlan?.items.some((item) => item.status === 'pending' || item.status === 'in_progress')
  ) {
    add(3, 'unfinished_plan')
  }
  if (COMPLEX_ACTION.test(content)) add(2, 'complex_action')
  if (MULTI_AGENT_REQUEST.test(content)) add(4, 'multi_agent_request')
  if (TASK_WORKFLOW.test(content)) add(2, 'task_workflow')
  if (CHANGE_REQUEST.test(content)) add(1, 'change_request')
  if ((content.match(MULTI_STEP) ?? []).length >= 1) add(1, 'multi_step_language')
  if ((content.match(ENUMERATED) ?? []).length >= 2) add(2, 'multiple_requirements')
  if (content.length >= 240) add(2, 'long_request')
  else if (content.length >= 120) add(1, 'detailed_request')
  if (CODE_OR_FILE.test(content)) add(1, 'technical_context')
  if (latestUser?.attachments?.length) add(1, 'attachments')

  return { preference, active: score >= 2, score, reasons }
}
