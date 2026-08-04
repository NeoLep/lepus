import Database from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  Message,
  ModelConfig,
  PromptSettings,
  PermissionSettings,
  SearchProviderConfig,
  SearchProviderId,
  Session
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
  return safeStorage.decryptString(encrypted)
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
        `SELECT id, title, created_at, updated_at
         FROM sessions
         ORDER BY updated_at DESC`
      )
      .all() as SessionRow[]
    return rows.map(toSession)
  }

  createSession(session: Session): Session {
    this.database
      .prepare(
        `INSERT INTO sessions (id, title, created_at, updated_at)
         VALUES (@id, @title, @createdAt, @updatedAt)`
      )
      .run(session)
    return { ...session }
  }

  updateSession(session: Session): Session {
    const result = this.database
      .prepare(
        `UPDATE sessions
         SET title = @title, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run(session)
    if (result.changes === 0) throw new Error(`Session not found: ${session.id}`)

    const updated = this.database
      .prepare(
        `SELECT id, title, created_at, updated_at
         FROM sessions
         WHERE id = ?`
      )
      .get(session.id) as SessionRow
    return toSession(updated)
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
        `SELECT workspace_path, mode
         FROM session_permission_settings
         WHERE session_id = ?`
      )
      .get(sessionId) as { workspace_path: string; mode: string } | undefined
    if (!row) return { ...DEFAULT_PERMISSION_SETTINGS }
    return {
      workspacePath: row.workspace_path,
      mode: isPermissionMode(row.mode) ? row.mode : DEFAULT_PERMISSION_SETTINGS.mode
    }
  }

  savePermissionSettings(sessionId: string, settings: PermissionSettings): PermissionSettings {
    if (!isPermissionMode(settings.mode)) throw new Error('无效的权限模式')
    const now = new Date().toISOString()
    this.database
      .prepare(
        `INSERT INTO session_permission_settings
         (session_id, workspace_path, mode, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           workspace_path = excluded.workspace_path,
           mode = excluded.mode,
           updated_at = excluded.updated_at`
      )
      .run(sessionId, settings.workspacePath.trim(), settings.mode, now)
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
      `INSERT OR IGNORE INTO sessions (id, title, created_at, updated_at)
       VALUES (@id, @title, @createdAt, @updatedAt)`
    )
    this.database.transaction((items: Session[]) => {
      for (const session of items) insert.run(session)
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
