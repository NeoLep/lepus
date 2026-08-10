import Database from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AgentRun,
  Message,
  ModelConfig,
  CompressionRecord,
  PromptSettings,
  PermissionSettings,
  RemoteBotSettings,
  RemoteBotToolGroup,
  SearchProviderConfig,
  SearchProviderId,
  Session,
  SessionSearchResult,
  SkillDefinition,
  TaskPlan,
  TaskPlanItem
} from './constants'
import { detectModelContextWindow } from '@/shared/agent/history-compression'
import {
  DEFAULT_PROMPT_SETTINGS,
  PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH
} from '@/shared/agent/prompt-settings'
import { DEFAULT_PERMISSION_SETTINGS, isPermissionMode } from '@/shared/agent/permissions'

type SessionRow = {
  id: string
  title: string
  created_at: string
  updated_at: string
  is_pinned: number
  is_archived: number
  task_mode: number
  task_mode_preference: Session['taskMode']
}

type TaskPlanRow = {
  session_id: string
  explanation: string
  items_json: string
  updated_at: string
}

type MessageRow = {
  id: string
  role: Message['role']
  content: string
  created_at: string
  tool_calls_json: string
  sources_json: string
  attachments_json: string
}

type ModelConfigRow = {
  id: string
  config_name: string
  base_url: string
  model: string
  api_key: string
  context_window_override: number | null
  detected_context_window: number | null
  max_output_tokens_override: number | null
  token_estimate_ratio: number
  is_active: number
  created_at: string
  updated_at: string
}

type ConversationSummaryRow = {
  session_id: string
  summary: string
  compressed_through_message_id: string
  source_message_count: number
  estimated_tokens: number
  updated_at: string
}

type CompressionRecordRow = {
  id: string
  session_id: string
  phase: CompressionRecord['phase']
  status: CompressionRecord['status']
  method: CompressionRecord['method']
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  input_tokens: number
  source_messages: number
  error_name: string
  error_message: string
}

type AgentRunRow = {
  id: string
  session_id: string
  parent_run_id: string | null
  kind: AgentRun['kind']
  goal: string
  status: AgentRun['status']
  model_config_id: string | null
  task_mode_active: number
  request_message_id: string | null
  response_message_id: string | null
  result: string
  error_name: string
  error_message: string
  prompt_tokens: number | null
  tool_call_count: number
  created_at: string
  started_at: string | null
  finished_at: string | null
}

type SkillRow = {
  id: string
  name: string
  description: string
  instructions: string
  triggers_json: string
  enabled: number
  source_type: SkillDefinition['sourceType']
  source_url: string
  content_hash: string
  root_path: string
  license: string
  compatibility: string
  allowed_tools_json: string
  files_json: string
  created_at: string
  updated_at: string
}

const ENCRYPTED_API_KEY_PREFIX = 'safe-storage:v1:'

function secureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform !== 'linux') return true
  return safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

function encryptApiKey(apiKey: string): string {
  if (!secureStorageAvailable()) {
    throw new Error('系统安全存储不可用，无法保存 API Key')
  }
  const encrypted = safeStorage.encryptString(apiKey)
  return `${ENCRYPTED_API_KEY_PREFIX}${encrypted.toString('base64')}`
}

function decryptApiKey(storedValue: string): string {
  if (!storedValue.startsWith(ENCRYPTED_API_KEY_PREFIX)) {
    throw new Error('检测到未加密的 API Key，请重新保存模型配置')
  }
  if (!secureStorageAvailable()) {
    throw new Error('系统安全存储不可用，无法读取 API Key')
  }
  const encrypted = Buffer.from(storedValue.slice(ENCRYPTED_API_KEY_PREFIX.length), 'base64')
  try {
    return safeStorage.decryptString(encrypted)
  } catch {
    throw new Error(
      '无法解密已保存的 API Key。应用身份或系统钥匙串可能已变化，请在模型或搜索设置中重新输入 API Key。'
    )
  }
}

type SearchProviderRow = {
  provider: SearchProviderId
  enabled: number
  api_key: string
  base_url: string
  updated_at: string
}

const SEARCH_PROVIDERS: SearchProviderId[] = [
  'brave',
  'tavily',
  'exa',
  'perplexity',
  'firecrawl',
  'searxng'
]

export type ConversationSummary = {
  sessionId: string
  summary: string
  compressedThroughMessageId: string
  sourceMessageCount: number
  estimatedTokens: number
  updatedAt: string
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPinned: row.is_pinned === 1,
    isArchived: row.is_archived === 1,
    taskMode: row.task_mode_preference ?? (row.task_mode === 1 ? 'on' : 'auto')
  }
}

function toTaskPlan(row: TaskPlanRow): TaskPlan {
  return {
    sessionId: row.session_id,
    explanation: row.explanation,
    items: JSON.parse(row.items_json || '[]') as TaskPlanItem[],
    updatedAt: row.updated_at
  }
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    toolCalls: JSON.parse(row.tool_calls_json || '[]') as Message['toolCalls'],
    sources: JSON.parse(row.sources_json || '[]') as Message['sources'],
    attachments: JSON.parse(row.attachments_json || '[]') as Message['attachments']
  }
}

function toModelConfig(row: ModelConfigRow, apiKey = ''): ModelConfig {
  return {
    id: row.id,
    name: row.config_name,
    baseURL: row.base_url,
    model: row.model,
    apiKey,
    hasApiKey: row.api_key.length > 0,
    contextWindowOverride: row.context_window_override,
    detectedContextWindow: row.detected_context_window,
    maxOutputTokensOverride: row.max_output_tokens_override,
    tokenEstimateRatio: row.token_estimate_ratio,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toConversationSummary(row: ConversationSummaryRow): ConversationSummary {
  return {
    sessionId: row.session_id,
    summary: row.summary,
    compressedThroughMessageId: row.compressed_through_message_id,
    sourceMessageCount: row.source_message_count,
    estimatedTokens: row.estimated_tokens,
    updatedAt: row.updated_at
  }
}

function toCompressionRecord(row: CompressionRecordRow): CompressionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    phase: row.phase,
    status: row.status,
    method: row.method,
    startedAt: row.started_at,
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.duration_ms !== null ? { durationMs: row.duration_ms } : {}),
    inputTokens: row.input_tokens,
    sourceMessages: row.source_messages,
    ...(row.error_name ? { errorName: row.error_name } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {})
  }
}

function toAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    ...(row.parent_run_id ? { parentRunId: row.parent_run_id } : {}),
    kind: row.kind,
    goal: row.goal,
    status: row.status,
    ...(row.model_config_id ? { modelConfigId: row.model_config_id } : {}),
    taskModeActive: row.task_mode_active === 1,
    ...(row.request_message_id ? { requestMessageId: row.request_message_id } : {}),
    ...(row.response_message_id ? { responseMessageId: row.response_message_id } : {}),
    ...(row.result ? { result: row.result } : {}),
    ...(row.error_name ? { errorName: row.error_name } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    ...(row.prompt_tokens !== null ? { promptTokens: row.prompt_tokens } : {}),
    toolCallCount: row.tool_call_count,
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {})
  }
}

function toSkill(row: SkillRow): SkillDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    triggers: JSON.parse(row.triggers_json || '[]') as string[],
    enabled: row.enabled === 1,
    sourceType: row.source_type ?? 'manual',
    sourceUrl: row.source_url ?? '',
    contentHash: row.content_hash ?? '',
    rootPath: row.root_path ?? '',
    license: row.license ?? '',
    compatibility: row.compatibility ?? '',
    allowedTools: JSON.parse(row.allowed_tools_json || '[]') as string[],
    files: JSON.parse(row.files_json || '[]') as SkillDefinition['files'],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const session = value as Record<string, unknown>
  return (
    typeof session.id === 'string' &&
    typeof session.title === 'string' &&
    typeof session.createdAt === 'string' &&
    typeof session.updatedAt === 'string'
  )
}

function summarizeSearchJson(value: string, keys: string[]): string {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return value
    return parsed
      .flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const record = item as Record<string, unknown>
        return keys
          .map((key) => record[key])
          .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      })
      .join(' · ')
  } catch {
    return value
  }
}

export class ChatRepository {
  private readonly database: Database.Database

  constructor(databasePath = join(app.getPath('userData'), 'lepus.db')) {
    this.database = new Database(databasePath)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('foreign_keys = ON')
    this.migrateSchema()
    this.importLegacySessions(join(dirname(databasePath), 'sessions.json'))
  }

  querySessions(): Session[] {
    const rows = this.database
      .prepare(
        `SELECT id, title, created_at, updated_at, is_pinned, is_archived, task_mode, task_mode_preference
         FROM sessions
         ORDER BY is_archived ASC, is_pinned DESC, updated_at DESC`
      )
      .all() as SessionRow[]
    return rows.map(toSession)
  }

  createSession(session: Session): Session {
    this.database
      .prepare(
        `INSERT INTO sessions
           (id, title, created_at, updated_at, is_pinned, is_archived, task_mode, task_mode_preference)
         VALUES
           (@id, @title, @createdAt, @updatedAt, @isPinned, @isArchived, @taskModeLegacy, @taskMode)`
      )
      .run({
        ...session,
        isPinned: session.isPinned ? 1 : 0,
        isArchived: session.isArchived ? 1 : 0,
        taskModeLegacy: session.taskMode === 'on' ? 1 : 0
      })
    return { ...session }
  }

  updateSession(session: Session): Session {
    const result = this.database
      .prepare(
        `UPDATE sessions
         SET title = @title,
             updated_at = @updatedAt,
             is_pinned = @isPinned,
             is_archived = @isArchived,
             task_mode = @taskModeLegacy,
             task_mode_preference = @taskMode
         WHERE id = @id`
      )
      .run({
        ...session,
        isPinned: session.isPinned ? 1 : 0,
        isArchived: session.isArchived ? 1 : 0,
        taskModeLegacy: session.taskMode === 'on' ? 1 : 0
      })
    if (result.changes === 0) throw new Error(`Session not found: ${session.id}`)

    const updated = this.database
      .prepare(
        `SELECT id, title, created_at, updated_at, is_pinned, is_archived, task_mode, task_mode_preference
         FROM sessions
         WHERE id = ?`
      )
      .get(session.id) as SessionRow
    return toSession(updated)
  }

  getSession(id: string): Session | null {
    const row = this.database
      .prepare(
        `SELECT id, title, created_at, updated_at, is_pinned, is_archived, task_mode, task_mode_preference
         FROM sessions
         WHERE id = ?`
      )
      .get(id) as SessionRow | undefined
    return row ? toSession(row) : null
  }

  querySkills(): SkillDefinition[] {
    return (
      this.database
        .prepare(
          `SELECT id, name, description, instructions, triggers_json, enabled,
                  source_type, source_url, content_hash, root_path, license, compatibility,
                  allowed_tools_json, files_json, created_at, updated_at
           FROM skills
           ORDER BY enabled DESC, name COLLATE NOCASE ASC, created_at ASC`
        )
        .all() as SkillRow[]
    ).map(toSkill)
  }

  createSkill(skill: SkillDefinition): SkillDefinition {
    this.database
      .prepare(
        `INSERT INTO skills
           (id, name, description, instructions, triggers_json, enabled,
            source_type, source_url, content_hash, root_path, license, compatibility,
            allowed_tools_json, files_json, created_at, updated_at)
         VALUES
           (@id, @name, @description, @instructions, @triggersJson, @enabled,
            @sourceType, @sourceUrl, @contentHash, @rootPath, @license, @compatibility,
            @allowedToolsJson, @filesJson, @createdAt, @updatedAt)`
      )
      .run({
        ...skill,
        triggersJson: JSON.stringify(skill.triggers),
        allowedToolsJson: JSON.stringify(skill.allowedTools),
        filesJson: JSON.stringify(skill.files),
        enabled: skill.enabled ? 1 : 0
      })
    return this.getSkill(skill.id)!
  }

  updateSkill(skill: SkillDefinition): SkillDefinition {
    const result = this.database
      .prepare(
        `UPDATE skills
         SET name = @name, description = @description, instructions = @instructions,
             triggers_json = @triggersJson, enabled = @enabled,
             source_type = @sourceType, source_url = @sourceUrl,
             content_hash = @contentHash, root_path = @rootPath, license = @license,
             compatibility = @compatibility, allowed_tools_json = @allowedToolsJson,
             files_json = @filesJson, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        ...skill,
        triggersJson: JSON.stringify(skill.triggers),
        allowedToolsJson: JSON.stringify(skill.allowedTools),
        filesJson: JSON.stringify(skill.files),
        enabled: skill.enabled ? 1 : 0
      })
    if (result.changes === 0) throw new Error(`Skill not found: ${skill.id}`)
    return this.getSkill(skill.id)!
  }

  deleteSkill(id: string): void {
    this.database.prepare('DELETE FROM skills WHERE id = ?').run(id)
  }

  getSkill(id: string): SkillDefinition | null {
    const row = this.database
      .prepare(
        `SELECT id, name, description, instructions, triggers_json, enabled,
                source_type, source_url, content_hash, root_path, license, compatibility,
                allowed_tools_json, files_json, created_at, updated_at
         FROM skills WHERE id = ?`
      )
      .get(id) as SkillRow | undefined
    return row ? toSkill(row) : null
  }

  getTaskPlan(sessionId: string): TaskPlan | null {
    const row = this.database
      .prepare(
        `SELECT session_id, explanation, items_json, updated_at
         FROM task_plans
         WHERE session_id = ?`
      )
      .get(sessionId) as TaskPlanRow | undefined
    return row ? toTaskPlan(row) : null
  }

  saveTaskPlan(sessionId: string, update: Pick<TaskPlan, 'explanation' | 'items'>): TaskPlan {
    const updatedAt = new Date().toISOString()
    this.database
      .prepare(
        `INSERT INTO task_plans (session_id, explanation, items_json, updated_at)
         VALUES (@sessionId, @explanation, @itemsJson, @updatedAt)
         ON CONFLICT(session_id) DO UPDATE SET
           explanation = excluded.explanation,
           items_json = excluded.items_json,
           updated_at = excluded.updated_at`
      )
      .run({
        sessionId,
        explanation: update.explanation.trim(),
        itemsJson: JSON.stringify(update.items),
        updatedAt
      })
    return this.getTaskPlan(sessionId)!
  }

  finalizeTaskPlan(sessionId: string): TaskPlan | null {
    const plan = this.getTaskPlan(sessionId)
    if (!plan || plan.items.every((item) => ['completed', 'skipped'].includes(item.status))) {
      return plan
    }
    return this.saveTaskPlan(sessionId, {
      explanation: plan.explanation,
      items: plan.items.map((item) => ({
        ...item,
        status:
          item.status === 'in_progress'
            ? ('completed' as const)
            : item.status === 'pending'
              ? ('skipped' as const)
              : item.status
      }))
    })
  }

  getAgentRun(id: string): AgentRun | null {
    const row = this.database
      .prepare(
        `SELECT id, session_id, parent_run_id, kind, goal, status, model_config_id,
                task_mode_active, request_message_id, response_message_id, result,
                error_name, error_message, prompt_tokens, tool_call_count,
                created_at, started_at, finished_at
         FROM agent_runs
         WHERE id = ?`
      )
      .get(id) as AgentRunRow | undefined
    return row ? toAgentRun(row) : null
  }

  queryAgentRuns(sessionId: string): AgentRun[] {
    const rows = this.database
      .prepare(
        `SELECT id, session_id, parent_run_id, kind, goal, status, model_config_id,
                task_mode_active, request_message_id, response_message_id, result,
                error_name, error_message, prompt_tokens, tool_call_count,
                created_at, started_at, finished_at
         FROM agent_runs
         WHERE session_id = ?
         ORDER BY created_at DESC, rowid DESC`
      )
      .all(sessionId) as AgentRunRow[]
    return rows.map(toAgentRun)
  }

  saveAgentRun(run: AgentRun): AgentRun {
    this.database
      .prepare(
        `INSERT INTO agent_runs
           (id, session_id, parent_run_id, kind, goal, status, model_config_id,
            task_mode_active, request_message_id, response_message_id, result,
            error_name, error_message, prompt_tokens, tool_call_count,
            created_at, started_at, finished_at)
         VALUES
           (@id, @sessionId, @parentRunId, @kind, @goal, @status, @modelConfigId,
            @taskModeActive, @requestMessageId, @responseMessageId, @result,
            @errorName, @errorMessage, @promptTokens, @toolCallCount,
            @createdAt, @startedAt, @finishedAt)
         ON CONFLICT(id) DO UPDATE SET
           parent_run_id = excluded.parent_run_id,
           goal = excluded.goal,
           status = excluded.status,
           model_config_id = excluded.model_config_id,
           task_mode_active = excluded.task_mode_active,
           request_message_id = excluded.request_message_id,
           response_message_id = excluded.response_message_id,
           result = excluded.result,
           error_name = excluded.error_name,
           error_message = excluded.error_message,
           prompt_tokens = excluded.prompt_tokens,
           tool_call_count = excluded.tool_call_count,
           started_at = excluded.started_at,
           finished_at = excluded.finished_at`
      )
      .run({
        ...run,
        parentRunId: run.parentRunId ?? null,
        modelConfigId: run.modelConfigId ?? null,
        taskModeActive: run.taskModeActive ? 1 : 0,
        requestMessageId: run.requestMessageId ?? null,
        responseMessageId: run.responseMessageId ?? null,
        result: run.result ?? '',
        errorName: run.errorName ?? '',
        errorMessage: run.errorMessage ?? '',
        promptTokens: run.promptTokens ?? null,
        startedAt: run.startedAt ?? null,
        finishedAt: run.finishedAt ?? null
      })
    return this.getAgentRun(run.id)!
  }

  searchSessions(query: string): SessionSearchResult[] {
    const normalizedQuery = query.trim().slice(0, 200)
    if (!normalizedQuery) return []
    const rows = this.database
      .prepare(
        `SELECT DISTINCT s.id, s.title, s.created_at, s.updated_at,
                         s.is_pinned, s.is_archived, s.task_mode, s.task_mode_preference
         FROM sessions s
         WHERE instr(lower(s.title), lower(?)) > 0
            OR EXISTS (
              SELECT 1 FROM messages m
              WHERE m.session_id = s.id
                AND (
                  instr(lower(m.content), lower(?)) > 0
                  OR instr(lower(m.attachments_json), lower(?)) > 0
                  OR instr(lower(m.sources_json), lower(?)) > 0
                  OR instr(lower(m.tool_calls_json), lower(?)) > 0
                )
            )
         ORDER BY s.is_pinned DESC, s.updated_at DESC
         LIMIT 50`
      )
      .all(
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery
      ) as SessionRow[]

    const findMessage = this.database.prepare(
      `SELECT content, attachments_json, sources_json, tool_calls_json
       FROM messages
       WHERE session_id = ?
         AND (
           instr(lower(content), lower(?)) > 0
           OR instr(lower(attachments_json), lower(?)) > 0
           OR instr(lower(sources_json), lower(?)) > 0
           OR instr(lower(tool_calls_json), lower(?)) > 0
         )
       ORDER BY created_at ASC, rowid ASC
       LIMIT 1`
    )
    const lowerQuery = normalizedQuery.toLocaleLowerCase()
    return rows.map((row) => {
      const session = toSession(row)
      if (session.title.toLocaleLowerCase().includes(lowerQuery)) {
        return { session, snippet: session.title, matchedIn: 'title' as const }
      }
      const message = findMessage.get(
        row.id,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery
      ) as
        | {
            content: string
            attachments_json: string
            sources_json: string
            tool_calls_json: string
          }
        | undefined
      if (!message) return { session, snippet: '', matchedIn: 'message' as const }
      const candidates = [
        ['message', message.content],
        ['attachment', message.attachments_json],
        ['source', message.sources_json],
        ['tool', message.tool_calls_json]
      ] as const
      const match = candidates.find(([, value]) => value.toLocaleLowerCase().includes(lowerQuery))
      const rawValue = match?.[1] ?? message.content
      const value =
        match?.[0] === 'attachment'
          ? summarizeSearchJson(rawValue, ['name', 'mimeType'])
          : match?.[0] === 'source'
            ? summarizeSearchJson(rawValue, ['title', 'url', 'snippet'])
            : match?.[0] === 'tool'
              ? summarizeSearchJson(rawValue, ['name', 'arguments', 'result'])
              : rawValue
      const index = value.toLocaleLowerCase().indexOf(lowerQuery)
      const start = Math.max(0, index - 45)
      const snippet = value
        .slice(start, start + 120)
        .replace(/\s+/g, ' ')
        .trim()
      return {
        session,
        snippet: `${start > 0 ? '…' : ''}${snippet}${start + 120 < value.length ? '…' : ''}`,
        matchedIn: match?.[0] ?? ('message' as const)
      }
    })
  }

  deleteSession(id: string): void {
    this.database.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  queryMessages(sessionId: string): Message[] {
    const rows = this.database
      .prepare(
        `SELECT id, role, content, created_at, tool_calls_json, sources_json, attachments_json
         FROM messages
         WHERE session_id = ?
         ORDER BY created_at ASC, rowid ASC`
      )
      .all(sessionId) as MessageRow[]
    return rows.map(toMessage)
  }

  saveMessages(sessionId: string, messages: Message[]): void {
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO messages
         (id, session_id, role, content, created_at, tool_calls_json, sources_json, attachments_json)
       VALUES
         (@id, @sessionId, @role, @content, @createdAt, @toolCallsJson, @sourcesJson, @attachmentsJson)`
    )
    const save = this.database.transaction((items: Message[]) => {
      for (const message of items) {
        insert.run({
          ...message,
          sessionId,
          toolCallsJson: JSON.stringify(message.toolCalls ?? []),
          sourcesJson: JSON.stringify(message.sources ?? []),
          attachmentsJson: JSON.stringify(message.attachments ?? [])
        })
      }
    })
    save(messages)
  }

  createMessage(sessionId: string, message: Message): void {
    this.database
      .prepare(
        `INSERT INTO messages
           (id, session_id, role, content, created_at, tool_calls_json, sources_json, attachments_json)
         VALUES
           (@id, @sessionId, @role, @content, @createdAt, @toolCallsJson, @sourcesJson, @attachmentsJson)`
      )
      .run({
        ...message,
        sessionId,
        toolCallsJson: JSON.stringify(message.toolCalls ?? []),
        sourcesJson: JSON.stringify(message.sources ?? []),
        attachmentsJson: JSON.stringify(message.attachments ?? [])
      })
  }

  reviseUserMessage(sessionId: string, messageId: string, content: string): void {
    const revisedContent = content.trim()
    if (!revisedContent) throw new Error('Message content cannot be empty')
    this.database.transaction(() => {
      const target = this.database
        .prepare(
          `SELECT rowid, role
           FROM messages
           WHERE session_id = ? AND id = ?`
        )
        .get(sessionId, messageId) as { rowid: number; role: Message['role'] } | undefined
      if (!target || target.role !== 'user') throw new Error('User message not found')

      this.database
        .prepare('UPDATE messages SET content = ? WHERE session_id = ? AND id = ?')
        .run(revisedContent, sessionId, messageId)
      this.database
        .prepare('DELETE FROM messages WHERE session_id = ? AND rowid > ?')
        .run(sessionId, target.rowid)
      this.database
        .prepare('DELETE FROM conversation_summaries WHERE session_id = ?')
        .run(sessionId)
      this.database.prepare('DELETE FROM task_plans WHERE session_id = ?').run(sessionId)
    })()
  }

  deleteAssistantMessage(sessionId: string, messageId: string): void {
    this.database.transaction(() => {
      const target = this.database
        .prepare(
          `SELECT rowid, role
           FROM messages
           WHERE session_id = ? AND id = ?`
        )
        .get(sessionId, messageId) as { rowid: number; role: Message['role'] } | undefined
      if (!target || target.role !== 'assistant') throw new Error('Assistant message not found')

      const laterMessage = this.database
        .prepare('SELECT 1 FROM messages WHERE session_id = ? AND rowid > ? LIMIT 1')
        .get(sessionId, target.rowid)
      if (laterMessage) throw new Error('Only the latest assistant message can be regenerated')

      this.database
        .prepare('DELETE FROM messages WHERE session_id = ? AND id = ?')
        .run(sessionId, messageId)
      this.database
        .prepare('DELETE FROM conversation_summaries WHERE session_id = ?')
        .run(sessionId)
      this.database.prepare('DELETE FROM task_plans WHERE session_id = ?').run(sessionId)
    })()
  }

  getConversationSummary(sessionId: string): ConversationSummary | null {
    const row = this.database
      .prepare(
        `SELECT session_id, summary, compressed_through_message_id,
                source_message_count, estimated_tokens, updated_at
         FROM conversation_summaries
         WHERE session_id = ?`
      )
      .get(sessionId) as ConversationSummaryRow | undefined
    return row ? toConversationSummary(row) : null
  }

  saveConversationSummary(summary: ConversationSummary): void {
    this.database
      .prepare(
        `INSERT INTO conversation_summaries
           (session_id, summary, compressed_through_message_id,
            source_message_count, estimated_tokens, updated_at)
         VALUES
           (@sessionId, @summary, @compressedThroughMessageId,
            @sourceMessageCount, @estimatedTokens, @updatedAt)
         ON CONFLICT(session_id) DO UPDATE SET
           summary = excluded.summary,
           compressed_through_message_id = excluded.compressed_through_message_id,
           source_message_count = excluded.source_message_count,
           estimated_tokens = excluded.estimated_tokens,
           updated_at = excluded.updated_at`
      )
      .run(summary)
  }

  queryCompressionRecords(sessionId: string): CompressionRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, session_id, phase, status, method, started_at, finished_at,
                duration_ms, input_tokens, source_messages, error_name, error_message
         FROM (
           SELECT * FROM compression_records
           WHERE session_id = ?
           ORDER BY started_at DESC
           LIMIT 50
         )
         ORDER BY started_at ASC`
      )
      .all(sessionId) as CompressionRecordRow[]
    return rows.map(toCompressionRecord)
  }

  saveCompressionRecord(record: CompressionRecord): CompressionRecord {
    this.database
      .prepare(
        `INSERT INTO compression_records
           (id, session_id, phase, status, method, started_at, finished_at,
            duration_ms, input_tokens, source_messages, error_name, error_message)
         VALUES
           (@id, @sessionId, @phase, @status, @method, @startedAt, @finishedAt,
            @durationMs, @inputTokens, @sourceMessages, @errorName, @errorMessage)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           method = excluded.method,
           finished_at = excluded.finished_at,
           duration_ms = excluded.duration_ms,
           error_name = excluded.error_name,
           error_message = excluded.error_message`
      )
      .run({
        ...record,
        finishedAt: record.finishedAt ?? null,
        durationMs: record.durationMs ?? null,
        errorName: record.errorName ?? '',
        errorMessage: record.errorMessage ?? ''
      })
    return record
  }

  queryModelConfigs(): ModelConfig[] {
    const rows = this.database
      .prepare(
        `SELECT id, config_name, base_url, model, api_key,
                context_window_override, detected_context_window,
                max_output_tokens_override, token_estimate_ratio,
                is_active, created_at, updated_at
         FROM model_configs
         ORDER BY is_active DESC, updated_at DESC`
      )
      .all() as ModelConfigRow[]
    return rows.map((row) => toModelConfig(row))
  }

  getModelConfig(id: string): ModelConfig | null {
    const row = this.getModelConfigRow(id)
    return row ? toModelConfig(row, decryptApiKey(row.api_key)) : null
  }

  getModelConfigMetadata(id: string): ModelConfig | null {
    return this.getPublicModelConfig(id)
  }

  createModelConfig(config: ModelConfig): ModelConfig {
    const apiKey = config.apiKey.trim()
    if (!apiKey) throw new Error('API Key 不能为空')
    const create = this.database.transaction(() => {
      const count = this.database.prepare('SELECT COUNT(*) AS count FROM model_configs').get() as {
        count: number
      }
      this.database
        .prepare(
          `INSERT INTO model_configs
             (id, config_name, base_url, model, api_key,
              context_window_override, detected_context_window,
              max_output_tokens_override, token_estimate_ratio,
              is_active, created_at, updated_at)
           VALUES (@id, @name, @baseURL, @model, @apiKey,
                   @contextWindowOverride, @detectedContextWindow,
                   @maxOutputTokensOverride, @tokenEstimateRatio,
                   @isActive, @createdAt, @updatedAt)`
        )
        .run({
          ...config,
          apiKey: encryptApiKey(apiKey),
          detectedContextWindow: detectModelContextWindow(config.model),
          tokenEstimateRatio: 1,
          isActive: count.count === 0 ? 1 : 0
        })
    })
    create()
    return this.getPublicModelConfig(config.id) as ModelConfig
  }

  updateModelConfig(config: ModelConfig): ModelConfig {
    const current = this.getPublicModelConfig(config.id)
    const modelChanged = current?.model !== config.model
    const currentRow = this.getModelConfigRow(config.id)
    if (!currentRow) throw new Error(`Model config not found: ${config.id}`)
    const storedApiKey = config.apiKey.trim()
      ? encryptApiKey(config.apiKey.trim())
      : currentRow.api_key
    const result = this.database
      .prepare(
        `UPDATE model_configs
         SET config_name = @name,
             base_url = @baseURL,
             model = @model,
             api_key = @storedApiKey,
             context_window_override = @contextWindowOverride,
             detected_context_window = @detectedContextWindow,
             max_output_tokens_override = @maxOutputTokensOverride,
             token_estimate_ratio = @tokenEstimateRatio,
             updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        ...config,
        storedApiKey,
        detectedContextWindow: detectModelContextWindow(config.model),
        tokenEstimateRatio: modelChanged ? 1 : config.tokenEstimateRatio
      })
    if (result.changes === 0) throw new Error(`Model config not found: ${config.id}`)
    return this.getPublicModelConfig(config.id) as ModelConfig
  }

  deleteModelConfig(id: string): void {
    this.database.transaction(() => {
      const current = this.getPublicModelConfig(id)
      this.database.prepare('DELETE FROM model_configs WHERE id = ?').run(id)
      if (current?.isActive) {
        const next = this.database
          .prepare('SELECT id FROM model_configs ORDER BY updated_at DESC LIMIT 1')
          .get() as { id: string } | undefined
        if (next)
          this.database.prepare('UPDATE model_configs SET is_active = 1 WHERE id = ?').run(next.id)
      }
    })()
  }

  selectModelConfig(id: string): void {
    this.database.transaction(() => {
      const exists = this.database.prepare('SELECT 1 FROM model_configs WHERE id = ?').get(id)
      if (!exists) throw new Error(`Model config not found: ${id}`)
      this.database.prepare('UPDATE model_configs SET is_active = 0').run()
      this.database.prepare('UPDATE model_configs SET is_active = 1 WHERE id = ?').run(id)
    })()
  }

  getPromptSettings(): PromptSettings {
    const rows = this.database
      .prepare(
        `SELECT key, value
         FROM app_settings
         WHERE key LIKE 'prompt.%'`
      )
      .all() as Array<{ key: string; value: string }>
    const values = new Map(rows.map((row) => [row.key, row.value]))
    const readBoolean = (key: string, fallback: boolean): boolean => {
      const value = values.get(key)
      return value === undefined ? fallback : value === '1'
    }
    return {
      customInstructions:
        values.get('prompt.customInstructions') ?? DEFAULT_PROMPT_SETTINGS.customInstructions,
      includeCurrentTime: readBoolean(
        'prompt.includeCurrentTime',
        DEFAULT_PROMPT_SETTINGS.includeCurrentTime
      ),
      includeTimezone: readBoolean(
        'prompt.includeTimezone',
        DEFAULT_PROMPT_SETTINGS.includeTimezone
      ),
      includeLocale: readBoolean('prompt.includeLocale', DEFAULT_PROMPT_SETTINGS.includeLocale),
      includePlatform: readBoolean(
        'prompt.includePlatform',
        DEFAULT_PROMPT_SETTINGS.includePlatform
      ),
      showToolCallDetails: readBoolean(
        'prompt.showToolCallDetails',
        readBoolean('prompt.showToolCallNames', DEFAULT_PROMPT_SETTINGS.showToolCallDetails)
      )
    }
  }

  getRemoteBotSettings(includeSecret = false): RemoteBotSettings {
    const rows = this.database
      .prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'remoteBot.%'`)
      .all() as Array<{ key: string; value: string }>
    const values = new Map(rows.map((row) => [row.key, row.value]))
    const storedSecret = values.get('remoteBot.feishu.appSecret') ?? ''
    let allowedOpenIds: string[] = []
    try {
      const parsed = JSON.parse(values.get('remoteBot.feishu.allowedOpenIds') ?? '[]')
      if (Array.isArray(parsed)) {
        allowedOpenIds = [
          ...new Set(
            parsed
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean)
          )
        ]
      }
    } catch {
      allowedOpenIds = []
    }
    const validToolGroups = new Set<RemoteBotToolGroup>([
      'utilities',
      'web_search',
      'workspace_read',
      'skills',
      'browser',
      'browser_private',
      'clipboard'
    ])
    const defaultToolGroups: RemoteBotToolGroup[] = [
      'utilities',
      'web_search',
      'workspace_read',
      'skills'
    ]
    let allowedToolGroups: RemoteBotToolGroup[] = [...defaultToolGroups]
    try {
      const parsed = JSON.parse(values.get('remoteBot.feishu.allowedToolGroups') ?? 'null')
      if (Array.isArray(parsed)) {
        allowedToolGroups = [
          ...new Set(
            parsed.filter(
              (item): item is RemoteBotToolGroup =>
                typeof item === 'string' && validToolGroups.has(item as RemoteBotToolGroup)
            )
          )
        ]
      }
    } catch {
      allowedToolGroups = [...defaultToolGroups]
    }
    const parsedMaxToolRounds = Number(values.get('remoteBot.feishu.maxToolRounds') ?? '12')
    return {
      enabled: values.get('remoteBot.enabled') === '1',
      platform: 'feishu',
      appId: values.get('remoteBot.feishu.appId') ?? '',
      appSecret: includeSecret && storedSecret ? decryptApiKey(storedSecret) : '',
      hasAppSecret: Boolean(storedSecret),
      allowedOpenIds,
      allowedToolGroups,
      workspacePath: values.get('remoteBot.feishu.workspacePath') ?? '',
      maxToolRounds:
        Number.isInteger(parsedMaxToolRounds) &&
        parsedMaxToolRounds >= 2 &&
        parsedMaxToolRounds <= 20
          ? parsedMaxToolRounds
          : 12
    }
  }

  saveRemoteBotSettings(settings: RemoteBotSettings): RemoteBotSettings {
    const appId = settings.appId.trim()
    const appSecret = settings.appSecret.trim()
    const current = this.getRemoteBotSettings(false)
    if (settings.enabled && !appId) throw new Error('启用远程机器人前请填写飞书 App ID')
    if (settings.enabled && !appSecret && !current.hasAppSecret) {
      throw new Error('启用远程机器人前请填写飞书 App Secret')
    }
    const allowedOpenIds = [
      ...new Set(settings.allowedOpenIds.map((id) => id.trim()).filter(Boolean))
    ]
    const validToolGroups = new Set<RemoteBotToolGroup>([
      'utilities',
      'web_search',
      'workspace_read',
      'skills',
      'browser',
      'browser_private',
      'clipboard'
    ])
    const allowedToolGroups = [
      ...new Set(settings.allowedToolGroups.filter((group) => validToolGroups.has(group)))
    ]
    const workspacePath = settings.workspacePath.trim()
    const maxToolRounds = Math.min(20, Math.max(2, Math.trunc(settings.maxToolRounds || 12)))
    const now = new Date().toISOString()
    const save = this.database.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    this.database.transaction(() => {
      save.run('remoteBot.enabled', settings.enabled ? '1' : '0', now)
      save.run('remoteBot.feishu.appId', appId, now)
      save.run('remoteBot.feishu.allowedOpenIds', JSON.stringify(allowedOpenIds), now)
      save.run('remoteBot.feishu.allowedToolGroups', JSON.stringify(allowedToolGroups), now)
      save.run('remoteBot.feishu.workspacePath', workspacePath, now)
      save.run('remoteBot.feishu.maxToolRounds', String(maxToolRounds), now)
      if (appSecret) save.run('remoteBot.feishu.appSecret', encryptApiKey(appSecret), now)
    })()
    return this.getRemoteBotSettings(false)
  }

  savePromptSettings(settings: PromptSettings): PromptSettings {
    const customInstructions = settings.customInstructions.trim()
    if (customInstructions.length > PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH) {
      throw new Error(
        `Custom instructions cannot exceed ${PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH} characters`
      )
    }
    const save = this.database.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    const now = new Date().toISOString()
    this.database.transaction(() => {
      save.run('prompt.customInstructions', customInstructions, now)
      save.run('prompt.includeCurrentTime', settings.includeCurrentTime ? '1' : '0', now)
      save.run('prompt.includeTimezone', settings.includeTimezone ? '1' : '0', now)
      save.run('prompt.includeLocale', settings.includeLocale ? '1' : '0', now)
      save.run('prompt.includePlatform', settings.includePlatform ? '1' : '0', now)
      save.run('prompt.showToolCallDetails', settings.showToolCallDetails ? '1' : '0', now)
    })()
    return this.getPromptSettings()
  }

  getPermissionSettings(sessionId: string): PermissionSettings {
    const row = this.database
      .prepare(
        `SELECT workspace_path, mode, trusted_browser_origins_json
         FROM session_permission_settings
         WHERE session_id = ?`
      )
      .get(sessionId) as
      { workspace_path: string; mode: string; trusted_browser_origins_json: string } | undefined
    if (!row) return { ...DEFAULT_PERMISSION_SETTINGS, trustedBrowserOrigins: [] }
    let trustedBrowserOrigins: string[] = []
    try {
      const parsed = JSON.parse(row.trusted_browser_origins_json) as unknown
      if (Array.isArray(parsed)) {
        trustedBrowserOrigins = parsed.filter((value): value is string => typeof value === 'string')
      }
    } catch {
      trustedBrowserOrigins = []
    }
    return {
      workspacePath: row.workspace_path,
      mode: isPermissionMode(row.mode) ? row.mode : DEFAULT_PERMISSION_SETTINGS.mode,
      trustedBrowserOrigins
    }
  }

  savePermissionSettings(sessionId: string, settings: PermissionSettings): PermissionSettings {
    if (!isPermissionMode(settings.mode)) throw new Error('无效的权限模式')
    const now = new Date().toISOString()
    this.database
      .prepare(
        `INSERT INTO session_permission_settings
         (session_id, workspace_path, mode, trusted_browser_origins_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           workspace_path = excluded.workspace_path,
           mode = excluded.mode,
           trusted_browser_origins_json = excluded.trusted_browser_origins_json,
           updated_at = excluded.updated_at`
      )
      .run(
        sessionId,
        settings.workspacePath.trim(),
        settings.mode,
        JSON.stringify(settings.trustedBrowserOrigins),
        now
      )
    return this.getPermissionSettings(sessionId)
  }

  querySearchProviderConfigs(): SearchProviderConfig[] {
    const rows = this.database
      .prepare(
        `SELECT provider, enabled, api_key, base_url, updated_at
         FROM search_provider_configs`
      )
      .all() as SearchProviderRow[]
    const byProvider = new Map(rows.map((row) => [row.provider, row]))
    return SEARCH_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider)
      return {
        provider,
        enabled: row?.enabled === 1,
        apiKey: '',
        hasApiKey: Boolean(row?.api_key),
        baseURL: row?.base_url ?? '',
        updatedAt: row?.updated_at ?? ''
      }
    })
  }

  getSearchProviderConfigs(): SearchProviderConfig[] {
    const rows = this.database
      .prepare(
        `SELECT provider, enabled, api_key, base_url, updated_at
         FROM search_provider_configs`
      )
      .all() as SearchProviderRow[]
    const byProvider = new Map(rows.map((row) => [row.provider, row]))
    return SEARCH_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider)
      return {
        provider,
        enabled: row?.enabled === 1,
        apiKey: row?.api_key ? decryptApiKey(row.api_key) : '',
        hasApiKey: Boolean(row?.api_key),
        baseURL: row?.base_url ?? '',
        updatedAt: row?.updated_at ?? ''
      }
    })
  }

  saveSearchProviderConfigs(configs: SearchProviderConfig[]): SearchProviderConfig[] {
    const byProvider = new Map(configs.map((config) => [config.provider, config]))
    if (byProvider.size !== SEARCH_PROVIDERS.length) {
      throw new Error('Search provider configuration is incomplete')
    }
    const save = this.database.prepare(
      `INSERT INTO search_provider_configs (provider, enabled, api_key, base_url, updated_at)
       VALUES (@provider, @enabled, @apiKey, @baseURL, @updatedAt)
       ON CONFLICT(provider) DO UPDATE SET
         enabled = excluded.enabled,
         api_key = excluded.api_key,
         base_url = excluded.base_url,
         updated_at = excluded.updated_at`
    )
    const existingRows = this.database
      .prepare('SELECT provider, api_key FROM search_provider_configs')
      .all() as Array<{ provider: SearchProviderId; api_key: string }>
    const existingKeys = new Map(existingRows.map((row) => [row.provider, row.api_key]))
    const now = new Date().toISOString()
    this.database.transaction(() => {
      for (const provider of SEARCH_PROVIDERS) {
        const config = byProvider.get(provider)
        if (!config) throw new Error(`Missing search provider: ${provider}`)
        const apiKeyInput = config.apiKey.trim()
        const storedApiKey = apiKeyInput
          ? encryptApiKey(apiKeyInput)
          : (existingKeys.get(provider) ?? '')
        const baseURL = config.baseURL.trim().replace(/\/+$/, '')
        if (config.enabled && provider !== 'searxng' && !storedApiKey) {
          throw new Error(`${provider} API Key is required when enabled`)
        }
        if (config.enabled && provider === 'searxng') {
          try {
            const url = new URL(baseURL)
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
          } catch {
            throw new Error('SearXNG URL must be a valid HTTP(S) URL')
          }
        }
        save.run({
          provider,
          enabled: config.enabled ? 1 : 0,
          apiKey: storedApiKey,
          baseURL,
          updatedAt: now
        })
      }
    })()
    return this.querySearchProviderConfigs()
  }

  updateModelTokenEstimateRatio(id: string, estimatedTokens: number, actualTokens: number): void {
    if (estimatedTokens <= 0 || actualTokens <= 0) return
    const config = this.getPublicModelConfig(id)
    if (!config) return
    const observedRatio = Math.min(2, Math.max(0.5, actualTokens / estimatedTokens))
    const nextRatio = config.tokenEstimateRatio * 0.8 + observedRatio * 0.2
    this.database
      .prepare(
        `UPDATE model_configs
         SET token_estimate_ratio = ?, updated_at = updated_at
         WHERE id = ?`
      )
      .run(nextRatio, id)
  }

  close(): void {
    if (this.database.open) this.database.close()
  }

  private getModelConfigRow(id: string): ModelConfigRow | null {
    const row = this.database
      .prepare(
        `SELECT id, config_name, base_url, model, api_key,
                context_window_override, detected_context_window,
                max_output_tokens_override, token_estimate_ratio,
                is_active, created_at, updated_at
         FROM model_configs
         WHERE id = ?`
      )
      .get(id) as ModelConfigRow | undefined
    return row ?? null
  }

  private getPublicModelConfig(id: string): ModelConfig | null {
    const row = this.getModelConfigRow(id)
    return row ? toModelConfig(row) : null
  }

  private migrateSchema(): void {
    const version = this.database.pragma('user_version', { simple: true }) as number
    if (version < 1) {
      this.database.transaction(() => {
        this.database.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_sessions_updated_at ON sessions(updated_at DESC);
        CREATE INDEX idx_messages_session_created ON messages(session_id, created_at);
        PRAGMA user_version = 1;
        `)
      })()
    }

    if (version < 2) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE model_configs (
            id TEXT PRIMARY KEY,
            config_name TEXT NOT NULL UNIQUE,
            base_url TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE INDEX idx_model_configs_active ON model_configs(is_active DESC, updated_at DESC);
          CREATE UNIQUE INDEX idx_model_configs_single_active
            ON model_configs(is_active) WHERE is_active = 1;
          PRAGMA user_version = 2;
        `)
      })()
    }

    if (version < 3) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE conversation_summaries (
            session_id TEXT PRIMARY KEY,
            summary TEXT NOT NULL,
            compressed_through_message_id TEXT NOT NULL,
            source_message_count INTEGER NOT NULL,
            estimated_tokens INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );

          PRAGMA user_version = 3;
        `)
      })()
    }

    if (version < 4) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE model_configs ADD COLUMN context_window_override INTEGER;
          ALTER TABLE model_configs ADD COLUMN detected_context_window INTEGER;
          ALTER TABLE model_configs ADD COLUMN max_output_tokens_override INTEGER;
          ALTER TABLE model_configs ADD COLUMN token_estimate_ratio REAL NOT NULL DEFAULT 1;

          PRAGMA user_version = 4;
        `)
        const configs = this.database
          .prepare('SELECT id, model FROM model_configs')
          .all() as Array<{ id: string; model: string }>
        const update = this.database.prepare(
          'UPDATE model_configs SET detected_context_window = ? WHERE id = ?'
        )
        for (const config of configs) {
          update.run(detectModelContextWindow(config.model), config.id)
        }
      })()
    }

    if (version < 5) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          PRAGMA user_version = 5;
        `)
      })()
    }

    if (version < 6) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE search_provider_configs (
            provider TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
            api_key TEXT NOT NULL DEFAULT '',
            base_url TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
          );

          PRAGMA user_version = 6;
        `)
      })()
    }

    if (version < 7) {
      this.database.pragma('secure_delete = ON')
      const modelRows = this.database
        .prepare('SELECT id, api_key FROM model_configs')
        .all() as Array<{ id: string; api_key: string }>
      const searchRows = this.database
        .prepare('SELECT provider, api_key FROM search_provider_configs')
        .all() as Array<{ provider: string; api_key: string }>
      const modelMigrations = modelRows
        .filter((row) => row.api_key && !row.api_key.startsWith(ENCRYPTED_API_KEY_PREFIX))
        .map((row) => ({ id: row.id, apiKey: encryptApiKey(row.api_key) }))
      const searchMigrations = searchRows
        .filter((row) => row.api_key && !row.api_key.startsWith(ENCRYPTED_API_KEY_PREFIX))
        .map((row) => ({ provider: row.provider, apiKey: encryptApiKey(row.api_key) }))

      this.database.transaction(() => {
        const updateModel = this.database.prepare(
          'UPDATE model_configs SET api_key = ? WHERE id = ?'
        )
        const updateSearch = this.database.prepare(
          'UPDATE search_provider_configs SET api_key = ? WHERE provider = ?'
        )
        for (const migration of modelMigrations) updateModel.run(migration.apiKey, migration.id)
        for (const migration of searchMigrations) {
          updateSearch.run(migration.apiKey, migration.provider)
        }
        this.database.pragma('user_version = 7')
      })()
      if (modelMigrations.length > 0 || searchMigrations.length > 0) {
        this.database.pragma('wal_checkpoint(TRUNCATE)')
        this.database.exec('VACUUM')
        this.database.pragma('wal_checkpoint(TRUNCATE)')
      }
    }

    if (version < 8) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE messages ADD COLUMN tool_calls_json TEXT NOT NULL DEFAULT '[]';
          PRAGMA user_version = 8;
        `)
      })()
    }

    if (version < 9) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE messages ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
          PRAGMA user_version = 9;
        `)
      })()
    }

    if (version < 10) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE session_permission_settings (
            session_id TEXT PRIMARY KEY,
            workspace_path TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'request_approval'
              CHECK (mode IN ('request_approval', 'auto_approve', 'full_access')),
            updated_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );
          PRAGMA user_version = 10;
        `)
      })()
    }

    if (version < 11) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';
          PRAGMA user_version = 11;
        `)
      })()
    }

    if (version < 12) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0
            CHECK (is_pinned IN (0, 1));
          ALTER TABLE sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0
            CHECK (is_archived IN (0, 1));
          CREATE INDEX idx_sessions_management
            ON sessions(is_archived ASC, is_pinned DESC, updated_at DESC);
          PRAGMA user_version = 12;
        `)
      })()
    }

    if (version < 13) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE sessions ADD COLUMN task_mode INTEGER NOT NULL DEFAULT 0
            CHECK (task_mode IN (0, 1));
          CREATE TABLE task_plans (
            session_id TEXT PRIMARY KEY,
            explanation TEXT NOT NULL DEFAULT '',
            items_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );
          PRAGMA user_version = 13;
        `)
      })()
    }

    if (version < 14) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE sessions ADD COLUMN task_mode_preference TEXT NOT NULL DEFAULT 'auto'
            CHECK (task_mode_preference IN ('auto', 'on', 'off'));
          UPDATE sessions SET task_mode_preference = 'on' WHERE task_mode = 1;
          PRAGMA user_version = 14;
        `)
      })()
    }

    if (version < 15) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE compression_records (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            phase TEXT NOT NULL CHECK (phase IN ('foreground', 'background')),
            status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'fallback')),
            method TEXT NOT NULL CHECK (method IN ('remote', 'local')),
            started_at TEXT NOT NULL,
            finished_at TEXT,
            duration_ms INTEGER,
            input_tokens INTEGER NOT NULL,
            source_messages INTEGER NOT NULL,
            error_name TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );
          CREATE INDEX idx_compression_records_session_started
            ON compression_records(session_id, started_at DESC);
          PRAGMA user_version = 15;
        `)
      })()
    }

    if (version < 16) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE agent_runs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            parent_run_id TEXT,
            kind TEXT NOT NULL CHECK (kind IN ('primary', 'subtask')),
            goal TEXT NOT NULL,
            status TEXT NOT NULL CHECK (
              status IN (
                'queued', 'running', 'waiting_approval', 'waiting_input',
                'completed', 'failed', 'canceled'
              )
            ),
            model_config_id TEXT,
            task_mode_active INTEGER NOT NULL DEFAULT 0 CHECK (task_mode_active IN (0, 1)),
            request_message_id TEXT,
            response_message_id TEXT,
            result TEXT NOT NULL DEFAULT '',
            error_name TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            prompt_tokens INTEGER,
            tool_call_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
          );
          CREATE INDEX idx_agent_runs_session_created
            ON agent_runs(session_id, created_at DESC);
          CREATE INDEX idx_agent_runs_parent_created
            ON agent_runs(parent_run_id, created_at ASC);
          PRAGMA user_version = 16;
        `)
      })()
    }

    if (version < 17) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            instructions TEXT NOT NULL,
            triggers_json TEXT NOT NULL DEFAULT '[]',
            enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX idx_skills_enabled_name ON skills(enabled DESC, name ASC);
          PRAGMA user_version = 17;
        `)
      })()
    }

    if (version < 18) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE skills ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';
          ALTER TABLE skills ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
          ALTER TABLE skills ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
          ALTER TABLE skills ADD COLUMN root_path TEXT NOT NULL DEFAULT '';
          ALTER TABLE skills ADD COLUMN license TEXT NOT NULL DEFAULT '';
          ALTER TABLE skills ADD COLUMN compatibility TEXT NOT NULL DEFAULT '';
          ALTER TABLE skills ADD COLUMN allowed_tools_json TEXT NOT NULL DEFAULT '[]';
          ALTER TABLE skills ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]';
          PRAGMA user_version = 18;
        `)
      })()
    }

    if (version < 19) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE session_permission_settings
            ADD COLUMN trusted_browser_origins_json TEXT NOT NULL DEFAULT '[]';
          PRAGMA user_version = 19;
        `)
      })()
    }

    const interruptedAt = new Date().toISOString()
    this.database
      .prepare(
        `UPDATE compression_records
         SET status = 'failed', finished_at = ?,
             duration_ms = MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)),
             error_name = 'Interrupted', error_message = '应用在压缩完成前退出'
         WHERE status = 'running'`
      )
      .run(interruptedAt, interruptedAt)
    this.database
      .prepare(
        `UPDATE agent_runs
         SET status = 'failed', finished_at = ?,
             error_name = 'Interrupted', error_message = '应用在 Agent Run 完成前退出'
         WHERE status IN ('queued', 'running', 'waiting_approval', 'waiting_input')`
      )
      .run(interruptedAt)
  }

  private importLegacySessions(jsonPath: string): void {
    if (!existsSync(jsonPath)) return

    const count = this.database.prepare('SELECT COUNT(*) AS count FROM sessions').get() as {
      count: number
    }
    if (count.count > 0) return

    const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'))
    if (!Array.isArray(parsed)) return
    const sessions = parsed.filter(isSession)
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO sessions
         (id, title, created_at, updated_at, is_pinned, is_archived, task_mode, task_mode_preference)
       VALUES
         (@id, @title, @createdAt, @updatedAt, @isPinned, @isArchived, @taskModeLegacy, @taskMode)`
    )
    this.database.transaction((items: Session[]) => {
      for (const session of items) {
        const rawTaskMode = (session as unknown as { taskMode?: unknown }).taskMode
        const taskMode = rawTaskMode === true || rawTaskMode === 'on' ? 'on' : 'auto'
        insert.run({
          ...session,
          isPinned: session.isPinned ? 1 : 0,
          isArchived: session.isArchived ? 1 : 0,
          taskMode,
          taskModeLegacy: taskMode === 'on' ? 1 : 0
        })
      }
    })(sessions)

    renameSync(jsonPath, `${jsonPath}.migrated-${Date.now()}.bak`)
  }
}

let repository: ChatRepository | null = null

export function getChatRepository(): ChatRepository {
  return (repository ??= new ChatRepository())
}

export function closeChatRepository(): void {
  repository?.close()
  repository = null
}
