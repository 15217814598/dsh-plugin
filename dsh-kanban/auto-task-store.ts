/**
 * Auto-task configuration store.
 * Persistence lives in the kanban SQLite `settings` table (key: 'auto-task'),
 * owned by TaskStore; the legacy ~/.dsh/dsh-kanban-auto-task.json is migrated
 * once by TaskStore and kept as .bak.
 * Runtime-only state (status, timer) stays in memory; task delivery happens
 * server-side via agent.followup() — there is no client-side pending queue.
 */

import type { TaskStore } from './store.js'

const SETTING_KEY = 'auto-task'

/** How a due auto-task reaches the AI */
export type AutoTaskDeliveryMode = 'new-session' | 'existing'

const DEFAULT_CONFIG = {
  enabled: false,
  intervalMinutes: 30,
  autoExecute: true,
  /** 'new-session' runs each task in its own conversation; 'existing' appends a turn to a live session */
  deliveryMode: 'new-session' as AutoTaskDeliveryMode,
  lastRunAt: null as string | null,
  lastTaskId: null as string | null,
  lastTaskTitle: null as string | null,
}

const VALID_DELIVERY_MODES: ReadonlySet<string> = new Set<AutoTaskDeliveryMode>(['new-session', 'existing'])

export class AutoTaskStore {
  config: typeof DEFAULT_CONFIG
  status: 'idle' | 'running' = 'idle'
  timer: ReturnType<typeof setInterval> | null = null
  private _onChange: ((cfg: unknown) => void) | null = null
  private store: TaskStore

  constructor(store: TaskStore) {
    this.store = store
    this.config = { ...DEFAULT_CONFIG }
    this.load()
  }

  load() {
    try {
      const raw = this.store.getSetting(SETTING_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        this.config = { ...DEFAULT_CONFIG, ...saved }
      }
    } catch (e) {
      console.error('[dsh-kanban] Failed to load auto-task config:', e)
    }
  }

  save() {
    try {
      this.store.setSetting(SETTING_KEY, JSON.stringify(this.config))
    } catch (e) {
      console.error('[dsh-kanban] Failed to save auto-task config:', e)
    }
  }

  getConfig() {
    return { ...this.config, status: this.status }
  }

  onConfigChange(cb: (cfg: unknown) => void) {
    this._onChange = cb
  }

  updateConfig(input: Record<string, unknown>) {
    if (input.enabled !== undefined) this.config.enabled = !!input.enabled
    if (input.intervalMinutes !== undefined) {
      const mins = parseInt(String(input.intervalMinutes), 10)
      this.config.intervalMinutes = Math.max(1, Math.min(1440, mins || 30))
    }
    if (input.autoExecute !== undefined) this.config.autoExecute = !!input.autoExecute
    if (input.deliveryMode !== undefined) {
      const mode = String(input.deliveryMode)
      if (!VALID_DELIVERY_MODES.has(mode)) {
        throw new Error(`deliveryMode must be one of: ${[...VALID_DELIVERY_MODES].join(', ')}`)
      }
      this.config.deliveryMode = mode as AutoTaskDeliveryMode
    }
    this.save()
    if (this._onChange) this._onChange(this.config)
    return this.getConfig()
  }

  recordRun(taskId: string, taskTitle: string) {
    this.config.lastRunAt = new Date().toISOString()
    this.config.lastTaskId = taskId
    this.config.lastTaskTitle = taskTitle
    this.save()
  }

  setRunning(val: boolean) {
    this.status = val ? 'running' : 'idle'
  }

  setTimer(timer: ReturnType<typeof setInterval>) {
    this.timer = timer
  }

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
