import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Message, ModelConfig, Session } from './constants'

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
}

type ModelConfigRow = {
  id: string
  config_name: string
  base_url: string
  model: string
  api_key: string
  is_active: number
  created_at: string
  updated_at: string
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
    createdAt: row.created_at
  }
}

function toModelConfig(row: ModelConfigRow): ModelConfig {
  return {
    id: row.id,
    name: row.config_name,
    baseURL: row.base_url,
    model: row.model,
    apiKey: row.api_key,
    isActive: row.is_active === 1,
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
        `SELECT id, role, content, created_at
         FROM messages
         WHERE session_id = ?
         ORDER BY created_at ASC, rowid ASC`
      )
      .all(sessionId) as MessageRow[]
    return rows.map(toMessage)
  }

  saveMessages(sessionId: string, messages: Message[]): void {
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at)
       VALUES (@id, @sessionId, @role, @content, @createdAt)`
    )
    const save = this.database.transaction((items: Message[]) => {
      for (const message of items) insert.run({ ...message, sessionId })
    })
    save(messages)
  }

  createMessage(sessionId: string, message: Message): void {
    this.database
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, created_at)
         VALUES (@id, @sessionId, @role, @content, @createdAt)`
      )
      .run({ ...message, sessionId })
  }

  queryModelConfigs(): ModelConfig[] {
    const rows = this.database
      .prepare(
        `SELECT id, config_name, base_url, model, api_key, is_active, created_at, updated_at
         FROM model_configs
         ORDER BY is_active DESC, updated_at DESC`
      )
      .all() as ModelConfigRow[]
    return rows.map(toModelConfig)
  }

  getModelConfig(id: string): ModelConfig | null {
    const row = this.database
      .prepare(
        `SELECT id, config_name, base_url, model, api_key, is_active, created_at, updated_at
         FROM model_configs
         WHERE id = ?`
      )
      .get(id) as ModelConfigRow | undefined
    return row ? toModelConfig(row) : null
  }

  createModelConfig(config: ModelConfig): ModelConfig {
    const create = this.database.transaction(() => {
      const count = this.database.prepare('SELECT COUNT(*) AS count FROM model_configs').get() as {
        count: number
      }
      this.database
        .prepare(
          `INSERT INTO model_configs
             (id, config_name, base_url, model, api_key, is_active, created_at, updated_at)
           VALUES (@id, @name, @baseURL, @model, @apiKey, @isActive, @createdAt, @updatedAt)`
        )
        .run({ ...config, isActive: count.count === 0 ? 1 : 0 })
    })
    create()
    return this.getModelConfig(config.id) as ModelConfig
  }

  updateModelConfig(config: ModelConfig): ModelConfig {
    const result = this.database
      .prepare(
        `UPDATE model_configs
         SET config_name = @name,
             base_url = @baseURL,
             model = @model,
             api_key = @apiKey,
             updated_at = @updatedAt
         WHERE id = @id`
      )
      .run(config)
    if (result.changes === 0) throw new Error(`Model config not found: ${config.id}`)
    return this.getModelConfig(config.id) as ModelConfig
  }

  deleteModelConfig(id: string): void {
    this.database.transaction(() => {
      const current = this.getModelConfig(id)
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

  close(): void {
    if (this.database.open) this.database.close()
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
