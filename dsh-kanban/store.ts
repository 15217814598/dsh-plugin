/**
 * Task storage backed by SQLite (node:sqlite DatabaseSync).
 * - Data lives in $DSH_HOME (default ~/.dsh) as dsh-kanban.db.
 * - WAL journal + STRICT tables, mirroring @deepseek-ai/dsh-session-query-sqlite.
 * - First run migrates the legacy JSON file (dsh-kanban.json → dsh-kanban.json.bak).
 * - A key/value `settings` table backs plugin config (auto-task, feishu).
 * Synchronous API preserved so routes and the scheduler keep their call shape.
 */

import { existsSync, mkdirSync, renameSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import type { Task, TaskStatus, TaskPriority, CreateTaskInput, UpdateTaskInput, ExecutionEvent } from './types.js'

/** Valid task statuses */
const VALID_STATUSES: ReadonlySet<string> = new Set<TaskStatus>(['planned', 'todo', 'in-progress', 'review', 'done'])

/** Valid priority levels */
const VALID_PRIORITIES: ReadonlySet<string> = new Set<TaskPriority>(['urgent', 'high', 'medium', 'low'])

/** Application id for dsh-kanban databases: 'DKBN' */
const KANBAN_APPLICATION_ID = 0x444b424e

/** Current schema version */
const SCHEMA_VERSION = 3

/**
 * Resolve the DSH data directory: $DSH_HOME wins, else ~/.dsh.
 * Mirrors @deepseek-ai/dsh-home-paths resolveDshHome().
 */
export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** Minimal surface of node:sqlite's DatabaseSync used by this store. */
interface SqliteStatement {
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
}

interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

interface SqliteModule {
  DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqliteDatabase
}

/** Load node:sqlite synchronously (Node >= 22.5, enabled by default from 22.13/23.4). */
function loadSqlite(): SqliteModule {
  const viaGetBuiltin = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule
  if (typeof viaGetBuiltin === 'function') {
    const mod = viaGetBuiltin.call(process, 'node:sqlite')
    if (mod) return mod as SqliteModule
  }
  // Fallback for hosts without process.getBuiltinModule
  const require_ = createRequire(import.meta.url)
  return require_('node:sqlite') as SqliteModule
}

/** Backward-compatible priority mapping (P0-P3 → urgent/high/medium/low) */
const PRIORITY_MAPPING: Record<string, TaskPriority> = {
  'P0': 'urgent', 'P1': 'high', 'P2': 'medium', 'P3': 'low',
  'low': 'low', 'medium': 'medium', 'high': 'high', 'urgent': 'urgent',
}

/** Normalize and validate task data for backward compatibility */
function normalizeTask(task: Record<string, any>): Task | null {
  // Validate required fields
  if (!task.id || typeof task.id !== 'string') return null
  if (!task.title || typeof task.title !== 'string') return null

  // Normalize status
  if (task.status === 'failed') task.status = 'done'
  if (!VALID_STATUSES.has(task.status)) task.status = 'todo'

  // Normalize priority
  if (PRIORITY_MAPPING[task.priority]) {
    task.priority = PRIORITY_MAPPING[task.priority]
  }
  if (!VALID_PRIORITIES.has(task.priority)) task.priority = 'medium'

  // Ensure tags is an array
  if (!Array.isArray(task.tags)) task.tags = []

  // Ensure order is a number
  if (typeof task.order !== 'number') task.order = 0

  // Ensure timestamps exist
  if (!task.createdAt) task.createdAt = new Date().toISOString()
  if (!task.updatedAt) task.updatedAt = task.createdAt

  return task as Task
}

/** Parse one DB row into a Task object */
function rowToTask(row: Record<string, unknown>): Task {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(String(row.tags ?? '[]'))
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
  } catch { /* keep [] */ }

  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? undefined : String(row.description),
    status: String(row.status) as TaskStatus,
    priority: String(row.priority) as TaskPriority,
    tags,
    assignee: row.assignee == null ? undefined : String(row.assignee),
    project: row.project == null ? undefined : String(row.project),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    dueDate: row.due_date == null ? undefined : String(row.due_date),
    order: Number(row.task_order ?? 0),
    sessionId: row.session_id == null ? undefined : String(row.session_id),
    feishuRecordId: row.feishu_record_id == null ? undefined : String(row.feishu_record_id),
  }
}

/** Simple in-memory event emitter for task execution events */
export class TaskEventEmitter {
  private listeners: Set<(event: ExecutionEvent) => void> = new Set()
  private history: ExecutionEvent[] = []
  private maxHistory = 200

  /** Subscribe to execution events */
  subscribe(listener: (event: ExecutionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Emit an execution event */
  emit(event: ExecutionEvent): void {
    this.history.push(event)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* ignore listener errors */ }
    }
  }

  /** Get recent execution event history */
  getHistory(limit = 50): ExecutionEvent[] {
    return this.history.slice(-limit)
  }
}

/**
 * Task store backed by SQLite.
 */
export class TaskStore {
  private db: SqliteDatabase
  private dbPath: string
  private maxTasks: number
  readonly events: TaskEventEmitter

  private static readonly SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL CHECK (status IN ('planned','todo','in-progress','review','done')),
      priority    TEXT NOT NULL CHECK (priority IN ('urgent','high','medium','low')),
      tags        TEXT NOT NULL DEFAULT '[]',
      assignee    TEXT,
      project     TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      due_date    TEXT,
      task_order  INTEGER NOT NULL DEFAULT 0,
      session_id  TEXT,
      feishu_record_id TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_tasks_status_order ON tasks (status, task_order);
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
  `

  constructor(maxTasks: number = 1000, dbPath?: string) {
    this.maxTasks = maxTasks
    this.events = new TaskEventEmitter()
    this.dbPath = dbPath ?? join(resolveDshHome(), 'dsh-kanban.db')

    const dir = join(this.dbPath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const { DatabaseSync } = loadSqlite()
    this.db = new DatabaseSync(this.dbPath)

    // Identity + durability pragmas (mirrors dsh-session-query-sqlite)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec(`PRAGMA application_id = ${KANBAN_APPLICATION_ID}`)

    this.ensureSchema()
    this.migrateFromLegacyJson()
    this.migrateLegacyAutoTaskConfig()
    this.migrateLegacyFeishuConfig()

    console.log(`[dsh-kanban] SQLite store ready at ${this.dbPath} (${this.count} tasks)`)
  }

  /** Create schema and stamp user_version */
  private ensureSchema(): void {
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    if (version === SCHEMA_VERSION) {
      // Tables may still be missing on a fresh DB stamped by a crash; IF NOT EXISTS is harmless.
      this.db.exec(TaskStore.SCHEMA_SQL)
      return
    }
    this.db.exec('BEGIN')
    try {
      // Presence-based incremental column additions (works from any version);
      // fresh DBs (no tables yet) fall through to SCHEMA_SQL with every column.
      const columns = (this.db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map(c => c.name)
      if (columns.length > 0) {
        if (!columns.includes('session_id')) {
          this.db.exec('ALTER TABLE tasks ADD COLUMN session_id TEXT')
        }
        if (!columns.includes('feishu_record_id')) {
          this.db.exec('ALTER TABLE tasks ADD COLUMN feishu_record_id TEXT')
        }
      }
      this.db.exec(TaskStore.SCHEMA_SQL)
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  /**
   * One-time import of the legacy JSON file.
   * The source is renamed to `<file>.bak` after a successful import.
   */
  private migrateFromLegacyJson(): void {
    const jsonPath = join(resolveDshHome(), 'dsh-kanban.json')
    if (!existsSync(jsonPath)) return

    try {
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      if (!Array.isArray(parsed)) return

      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO tasks
           (id, title, description, status, priority, tags, assignee, project, created_at, updated_at, due_date, task_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )

      let imported = 0
      this.db.exec('BEGIN')
      try {
        for (const entry of parsed) {
          const task = normalizeTask(entry)
          if (!task) continue
          insert.run(
            task.id, task.title, task.description ?? null, task.status, task.priority,
            JSON.stringify(task.tags ?? []), task.assignee ?? null, task.project ?? null,
            task.createdAt, task.updatedAt, task.dueDate ?? null, Math.trunc(task.order ?? 0),
          )
          imported++
        }
        this.db.exec('COMMIT')
      } catch (e) {
        this.db.exec('ROLLBACK')
        throw e
      }

      renameSync(jsonPath, `${jsonPath}.bak`)
      console.log(`[dsh-kanban] Migrated ${imported} tasks from legacy JSON (backup: ${jsonPath}.bak)`)
    } catch (error) {
      console.error('[dsh-kanban] Legacy JSON migration failed (original file kept):', error)
    }
  }

  /** Migrate legacy ~/.dsh/dsh-kanban-auto-task.json into settings */
  private migrateLegacyAutoTaskConfig(): void {
    const legacyPath = join(resolveDshHome(), 'dsh-kanban-auto-task.json')
    if (!existsSync(legacyPath)) return
    try {
      const saved = JSON.parse(readFileSync(legacyPath, 'utf-8'))
      if (saved && typeof saved === 'object' && this.getSetting('auto-task') == null) {
        this.setSetting('auto-task', JSON.stringify(saved))
      }
      renameSync(legacyPath, `${legacyPath}.bak`)
      console.log('[dsh-kanban] Migrated legacy auto-task config into SQLite')
    } catch (error) {
      console.error('[dsh-kanban] Auto-task config migration failed:', error)
    }
  }

  /** Migrate legacy ~/.dsh/dsh-kanban-feishu.json into settings */
  private migrateLegacyFeishuConfig(): void {
    const legacyPath = join(resolveDshHome(), 'dsh-kanban-feishu.json')
    if (!existsSync(legacyPath)) return
    try {
      const saved = JSON.parse(readFileSync(legacyPath, 'utf-8'))
      if (saved && typeof saved === 'object' && this.getSetting('feishu') == null) {
        this.setSetting('feishu', JSON.stringify(saved))
      }
      renameSync(legacyPath, `${legacyPath}.bak`)
      console.log('[dsh-kanban] Migrated legacy feishu config into SQLite')
    } catch (error) {
      console.error('[dsh-kanban] Feishu config migration failed:', error)
    }
  }

  // ── Settings key/value helpers (shared by auto-task & feishu config) ──

  /** Read one settings value as raw JSON string, or null */
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? String(row.value) : null
  }

  /** Write one settings value (raw JSON string) */
  setSetting(key: string, value: string): void {
    this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value)
  }

  // ── Task queries ──

  /** Get all tasks grouped by status */
  getAll(): Record<TaskStatus, Task[]> {
    const grouped: Record<TaskStatus, Task[]> = {
      'planned': [],
      'todo': [],
      'in-progress': [],
      'review': [],
      'done': [],
    }

    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY task_order ASC').all()
    for (const row of rows) {
      const task = rowToTask(row)
      if (grouped[task.status]) grouped[task.status].push(task)
    }

    return grouped
  }

  /** Get a single task by ID */
  getById(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? rowToTask(row) : undefined
  }

  /** Create a new task */
  create(input: CreateTaskInput): Task {
    if (this.count >= this.maxTasks) {
      throw new Error(`Maximum task limit (${this.maxTasks}) reached`)
    }

    const status: TaskStatus = VALID_STATUSES.has(input.status ?? '') ? (input.status as TaskStatus) : 'todo'
    const maxRow = this.db.prepare('SELECT COALESCE(MAX(task_order), -1) AS m FROM tasks WHERE status = ?').get(status) as { m: number }
    const order = Number(maxRow?.m ?? -1) + 1

    const now = new Date().toISOString()
    const task: Task = {
      // Callers may pin the id (Feishu sync preserves record ids); default random.
      id: input.id ?? randomUUID(),
      title: input.title,
      description: input.description,
      status,
      priority: input.priority || 'medium',
      tags: input.tags || [],
      assignee: input.assignee,
      project: input.project,
      createdAt: now,
      updatedAt: now,
      dueDate: input.dueDate,
      order,
    }

    this.db.prepare(
      `INSERT INTO tasks
         (id, title, description, status, priority, tags, assignee, project, created_at, updated_at, due_date, task_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      task.id, task.title, task.description ?? null, task.status, task.priority,
      JSON.stringify(task.tags), task.assignee ?? null, task.project ?? null,
      task.createdAt, task.updatedAt, task.dueDate ?? null, order,
    )

    console.log(`[dsh-kanban] Created task: ${task.id}`)
    return task
  }

  /** Update an existing task */
  update(id: string, input: UpdateTaskInput): Task | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined

    const updated: Task = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    }

    this.db.prepare(
      `UPDATE tasks SET
         title = ?, description = ?, status = ?, priority = ?, tags = ?,
         assignee = ?, project = ?, created_at = ?, updated_at = ?, due_date = ?, task_order = ?
       WHERE id = ?`,
    ).run(
      updated.title, updated.description ?? null, updated.status, updated.priority,
      JSON.stringify(updated.tags ?? []), updated.assignee ?? null, updated.project ?? null,
      updated.createdAt, updated.updatedAt, updated.dueDate ?? null,
      Math.trunc(updated.order ?? 0), id,
    )

    console.log(`[dsh-kanban] Updated task: ${id}`)
    return updated
  }

  /** Move a task to a new status and order */
  move(id: string, status: TaskStatus, order: number): Task | undefined {
    const task = this.getById(id)
    if (!task) return undefined

    const oldStatus = task.status
    const now = new Date().toISOString()

    this.db.exec('BEGIN')
    try {
      this.db.prepare('UPDATE tasks SET status = ?, task_order = ?, updated_at = ? WHERE id = ?')
        .run(status, Math.trunc(order), now, id)

      if (oldStatus !== status) {
        // Reindex siblings in the target column, mirroring the legacy in-memory logic.
        const siblings = this.db.prepare('SELECT id FROM tasks WHERE status = ? AND id != ? ORDER BY task_order ASC')
          .all(status, id)
        const update = this.db.prepare('UPDATE tasks SET task_order = ? WHERE id = ?')
        siblings.forEach((row, i) => {
          update.run(i >= order ? i + 1 : i, String(row.id))
        })
      }
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }

    console.log(`[dsh-kanban] Moved task ${id} to ${status} at position ${order}`)
    return this.getById(id)
  }

  /** Record which DSH session carries a task's delivery/execution. */
  attachDeliverySession(taskId: string, sessionId: string): void {
    this.db.prepare('UPDATE tasks SET session_id = ?, updated_at = ? WHERE id = ?')
      .run(sessionId, new Date().toISOString(), taskId)
  }

  /** Record the Feishu record id backing a locally created task (push dedup). */
  attachFeishuRecord(taskId: string, recordId: string): void {
    this.db.prepare('UPDATE tasks SET feishu_record_id = ? WHERE id = ?').run(recordId, taskId)
  }

  /** Delete a task */
  delete(id: string): boolean {
    const { changes } = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    if (changes > 0) {
      console.log(`[dsh-kanban] Deleted task: ${id}`)
      return true
    }
    return false
  }

  /** Get task count */
  get count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }
    return Number(row?.n ?? 0)
  }

  /** Close the database (call from plugin dispose) */
  close(): void {
    try {
      // Checkpoint WAL so the .db file is self-contained after shutdown.
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch { /* best effort */ }
    try {
      this.db.close()
    } catch { /* already closed */ }
  }

  // ── Execution workflow (events kept in memory for SSE) ──

  /** Claim a task for execution (todo/planned → in-progress). Idempotent: already in-progress is a no-op. */
  claimTask(id: string, message?: string): Task | undefined {
    const task = this.getById(id)
    if (!task) return undefined
    if (task.status !== 'todo' && task.status !== 'planned' && task.status !== 'in-progress') {
      throw new Error(`Cannot claim task in "${task.status}" status, must be "todo", "planned", or "in-progress"`)
    }

    const alreadyClaimed = task.status === 'in-progress'
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('in-progress', new Date().toISOString(), id)

    if (alreadyClaimed) {
      console.log(`[dsh-kanban] Task already in-progress, re-claimed: ${id}`)
    }

    this.events.emit({
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      type: 'task:claimed',
      message: message || `任务已认领：${task.title}`,
      timestamp: new Date().toISOString(),
    })

    console.log(`[dsh-kanban] Claimed task: ${id}`)
    return this.getById(id)
  }

  /** Complete a task's work (→ review; a human promotes it to done from the board). */
  completeTask(id: string, message?: string): Task | undefined {
    const task = this.getById(id)
    if (!task) return undefined

    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('review', new Date().toISOString(), id)

    this.events.emit({
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      type: 'task:completed',
      message: message || `任务工作完成，已移入评审中：${task.title}`,
      timestamp: new Date().toISOString(),
    })

    console.log(`[dsh-kanban] Task work completed (review): ${id}`)
    return this.getById(id)
  }

  /** Mark a task as failed (keeps current status, emits event) */
  failTask(id: string, error: string): Task | undefined {
    const task = this.getById(id)
    if (!task) return undefined

    this.db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)

    this.events.emit({
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      type: 'task:failed',
      message: `任务执行失败：${error}`,
      timestamp: new Date().toISOString(),
    })

    console.log(`[dsh-kanban] Task failed: ${id} — ${error}`)
    return task
  }

  /** Emit an executing progress event (no status change) */
  emitExecuting(id: string, message: string): void {
    const task = this.getById(id)
    if (!task) return

    this.events.emit({
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      type: 'task:executing',
      message,
      timestamp: new Date().toISOString(),
    })
  }

  /** Emit a comment event (no status change) */
  emitComment(id: string, message: string): void {
    const task = this.getById(id)
    if (!task) return

    this.events.emit({
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      type: 'task:comment',
      message,
      timestamp: new Date().toISOString(),
    })
  }
}
