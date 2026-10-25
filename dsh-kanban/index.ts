/**
 * dsh-kanban — Task kanban board plugin for DeepSeek Harness.
 * Provides task management with drag-and-drop, status tracking,
 * and SQLite persistent storage (node:sqlite, WAL).
 *
 * Auto-task delivery follows the DSH agent surface (docs/subsystems/core.md).
 * Two configurable modes: 'new-session' creates a dedicated session per task
 * through `ctx.sessionController.create()` — the official entry the GUI uses
 * (workspaceId attaches the session to the project; the default agent preset
 * resolves the model) — and delivers the task with `sessionController.prompt()`
 * in queue mode. 'existing' enqueues the task as a follow-up conversation turn
 * on a live agent via `agent.followup()` — the same programmatic delivery the
 * first-party schedule plugin uses. Status transitions stay on the HTTP API
 * (claim/progress/comment/complete/fail), taught to the model through a
 * system-prompt section; no browser DOM automation is involved.
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { TaskStore } from './store.js'
import { AutoTaskStore } from './auto-task-store.js'
import { FeishuClient, type FeishuConfig } from './feishu.js'
import { createKanbanRoutes, KANBAN_API_BASE, type FeishuClientRef } from './routes.js'
import { createKanbanTools } from './tools.js'
import type { KanbanConfig, Task } from './types.js'

/** Stable cordis plugin name */
export const name = 'kanban'

/** Services required before the kanban surfaces can mount */
export const inject = ['webServer', 'agents', 'systemPrompt', 'sessionController', 'tools']

/** Utility to ensure a plugin is mounted only once */
const mounted = new Set<string>()

function mountOnce(pluginName: string, apply: (ctx: Context, config?: KanbanConfig) => void) {
  return (ctx: Context, config?: KanbanConfig) => {
    if (mounted.has(pluginName)) return
    mounted.add(pluginName)
    apply(ctx, config)
  }
}

/** Default columns configuration */
const defaultColumns = [
  { id: 'planned' as const, title: '待规划', color: '#9ca3af' },
  { id: 'todo' as const, title: '待办', color: '#60a5fa' },
  { id: 'in-progress' as const, title: '进行中', color: '#a78bfa' },
  { id: 'review' as const, title: '评审中', color: '#fbbf24' },
  { id: 'done' as const, title: '已完成', color: '#34d399' },
]

/** Default config */
const defaultConfig: Required<Pick<KanbanConfig, 'enabled' | 'maxTasks' | 'columns'>> = {
  enabled: true,
  maxTasks: 1000,
  columns: defaultColumns,
}

/** Give up watching a delivered task after this long (session may be closed) */
const DELIVERY_WATCH_TIMEOUT_MS = 30 * 60_000

/** Treat a delivered turn as dead when the agent never went busy within this window */
const DELIVERY_START_TIMEOUT_MS = 60_000

/**
 * Model-facing guidance: the kanban_* tools carry their own schemas, so this
 * section only teaches the workflow rules. Registered as a system-prompt
 * section (order 150 = tool guidance band).
 */
function buildKanbanGuidance(): string {
  return [
    '本机已安装 dsh-kanban 插件（任务看板）。用户提到「看板 / 任务 / todo / 待办」时即指本插件，用 kanban_* 工具管理：',
    '- kanban_list 读任务，kanban_claim 认领（仅 planned/todo/in-progress），kanban_progress 报进度，kanban_comment 记录结果，kanban_complete 完成，kanban_fail 标记失败',
    '',
    '规则：一次只认领一个任务；先认领再工作；结束时必须调用 kanban_complete 或 kanban_fail，否则任务会一直挂在看板上。',
  ].join('\n')
}

/**
 * Task prompt delivered as a follow-up turn — just the task itself. The
 * system-prompt guidance + kanban_* tool schemas carry the workflow; the task
 * was already claimed server-side, so no protocol boilerplate is needed.
 */
function buildTaskPrompt(task: Task): string {
  return task.description?.trim() ? `${task.title}\n\n${task.description.trim()}` : task.title
}

/**
 * Plugin apply function — mounts kanban routes and the auto-task scheduler.
 */
function applyImpl(ctx: Context, config?: KanbanConfig): void {
  const resolvedConfig = { ...defaultConfig, ...config }

  if (!resolvedConfig.enabled) {
    console.log('[dsh-kanban] Kanban plugin disabled by config')
    return
  }

  const store = new TaskStore(resolvedConfig.maxTasks, resolvedConfig.dbPath)
  const autoTaskStore = new AutoTaskStore(store)

  // Resolve the Feishu client once (SQLite-saved config wins over patch config);
  // the ref is shared with the routes (config saves swap it) and the sync timers.
  const feishuRef: FeishuClientRef = { current: null }
  try {
    const savedRaw = store.getSetting('feishu')
    const saved: FeishuConfig | null = savedRaw ? JSON.parse(savedRaw) : null
    const isPlaceholder = (cfg?: FeishuConfig) =>
      !cfg?.appId || !cfg?.appSecret || !cfg?.appToken || !cfg?.tableId
      || cfg.appId.startsWith('your-') || cfg.appSecret.startsWith('your-')
      || cfg.appToken.startsWith('your-') || cfg.tableId.startsWith('your-')
    if (saved && !isPlaceholder(saved)) {
      feishuRef.current = new FeishuClient(saved)
    } else if (!isPlaceholder(resolvedConfig.feishu)) {
      feishuRef.current = new FeishuClient(resolvedConfig.feishu)
    }
  } catch (e) {
    console.error('[dsh-kanban] Failed to load feishu config from SQLite:', e)
  }

  const kanbanRoutes = createKanbanRoutes(store, resolvedConfig.feishu, autoTaskStore, store.events, startTaskDelivery, feishuRef)

  console.log(`[dsh-kanban] Initializing with ${store.count} existing tasks`)

  // Register kanban API routes — route objects carry kind/path/handler directly
  const disposers: (() => void)[] = []

  for (const route of kanbanRoutes) {
    disposers.push(ctx.webServer.register(route))
  }

  // Native kanban tools for the model (kanban_list/claim/progress/comment/complete/fail)
  try {
    for (const tool of createKanbanTools(store)) {
      disposers.push(ctx.tools.register(tool))
    }
  } catch (e) {
    console.warn('[dsh-kanban] Failed to register kanban tools:', e)
  }

  // Teach the kanban workflow to every session (system-prompt section, tool-guidance band)
  try {
    disposers.push(ctx.systemPrompt.section({
      name: 'dsh-kanban',
      order: 150,
      text: buildKanbanGuidance(),
    }))
  } catch (e) {
    console.warn('[dsh-kanban] Failed to register system-prompt section:', e)
  }

  // ── Auto-task scheduler ──
  /** Set when the plugin fiber is disposing; event listeners and sweeps check
   * it so nothing keeps working after DSH shuts down. */
  let disposed = false

  /** One in-flight delivery, keyed by the delivering session id. */
  interface PendingDelivery {
    taskId: string
    startedAt: number
    /** Saw the turn/start event — the conversation actually began. */
    started: boolean
    /** Latest assistant text seen on the session (fallback board result). */
    result?: string
    /** Last board-liveness heartbeat emission. */
    lastHeartbeatAt?: number
    /** The AI explicitly called kanban_fail — never auto-complete over it. */
    aiFailed?: boolean
  }
  /** The execution gate: at most one delivery at a time. */
  const pendingDeliveries = new Map<string, PendingDelivery>()

  /** Read an optional host service the plugin does not inject (cordis property access won't resolve these) */
  function getOptionalService(key: string): unknown {
    try {
      return (ctx as unknown as { get(k: string): unknown }).get(key)
    } catch {
      return undefined
    }
  }

  /** Resolve the task's project to its registered workspace, if any */
  function resolveProjectWorkspace(project?: string): KanbanWorkspace | undefined {
    if (!project) return undefined
    const registry = getOptionalService('workspaceRegistry') as { list?: () => KanbanWorkspace[] } | undefined
    const list = registry?.list?.()
    if (!Array.isArray(list)) return undefined
    return list.find(w => w.title === project)
  }

  /** Build the model-facing task prompt message */
  function buildKanbanMessage(task: Task): KanbanUserMessage {
    return {
      id: randomUUID(),
      role: 'user' as const,
      content: [{ type: 'text' as const, text: buildTaskPrompt(task) }],
      // Producer-owned source kind — session format v4 rejects the retired
      // `kind: 'plugin'` wrapper (same convention as schedule's kind: 'schedule')
      source: { kind: 'kanban' },
    }
  }

  /**
   * Move an auto-delivered task back to todo after an infrastructure failure
   * (model not yet registered at boot, session never woke, ...) so the next
   * scheduler cycle retries it. Tasks the AI itself marked failed keep their
   * status — only delivery-level errors recycle.
   */
  function recycleTask(taskId: string, note: string): void {
    store.emitComment(taskId, note)
    const current = store.getById(taskId)
    if (current && current.status === 'in-progress') {
      store.move(taskId, 'todo', 0)
    }
  }

  /**
   * Finalize a delivery whose turn ended cleanly: move the task to review
   * (评审中) with the AI's last reply as the result message — a human reviews
   * it on the board and promotes it to done. The one exception is a task the
   * AI explicitly marked failed (kanban_fail) — that stays in-progress for
   * retry/human handling. Tasks the AI completed via kanban_complete already
   * left in-progress before this runs (no-op).
   */
  function finishDelivery(entry: PendingDelivery): void {
    const current = store.getById(entry.taskId)
    if (!current || current.status !== 'in-progress') return
    const text = entry.result?.trim() || '（会话结束，AI 未输出文本结果）'
    if (entry.aiFailed) {
      store.emitComment(entry.taskId, '自动执行会话已结束；任务此前被 AI 标记失败，保持进行中等待重试或人工处理。')
      return
    }
    store.completeTask(entry.taskId, `AI 完成工作，已移入评审中：${text.slice(0, 600)}`)
  }

  /** Track an in-flight delivery: it joins the execution gate until turn/end. */
  function trackDelivery(sessionId: string, taskId: string): void {
    pendingDeliveries.set(sessionId, { taskId, startedAt: Date.now(), started: false })
    // Link the task to its executing conversation so the board can jump to it
    store.attachDeliverySession(taskId, sessionId)
  }

  // ── Event-driven delivery lifecycle (fiber-scoped; auto-disposed with the plugin) ──
  ctx.on('session/event', (session: { id?: string }, event: { type: string; data?: {
    message?: { content?: Array<{ type?: string; text?: string }> }
    reason?: { kind?: string; error?: { message?: string } }
  } }) => {
    const sessionId = session?.id
    const entry = sessionId ? pendingDeliveries.get(sessionId) : undefined
    if (!entry || disposed) return

    if (event.type === 'assistant/message') {
      const content = event.data?.message?.content ?? []
      const text = content.filter(b => b?.type === 'text').map(b => b.text ?? '').join('\n').trim()
      if (text) entry.result = text
      return
    }
    if (event.type === 'turn/start') {
      entry.started = true
      return
    }
    if (event.type === 'turn/end') {
      pendingDeliveries.delete(sessionId)
      const reason = event.data?.reason
      if (reason?.kind === 'error' && reason.error?.message) {
        recycleTask(entry.taskId, `自动执行失败：${reason.error.message}；任务已移回待办，下个周期自动重试。`)
      } else {
        finishDelivery(entry)
      }
    }
  })

  // Watch the board's own event stream: an explicit AI kanban_fail pins the
  // delivery so turn/end never auto-completes over the failure.
  const unwatchFailures = store.events.subscribe(evt => {
    if (evt.type !== 'task:failed') return
    const entry = [...pendingDeliveries.values()].find(e => e.taskId === evt.taskId)
    if (entry) entry.aiFailed = true
  })
  disposers.push(unwatchFailures)

  ctx.on('agent/disposed', ({ agent }: { agent: { id?: string } }) => {
    const sessionId = agent?.id
    const entry = sessionId ? pendingDeliveries.get(sessionId) : undefined
    if (!entry || disposed) return
    pendingDeliveries.delete(sessionId)
    if (entry.started) {
      finishDelivery(entry)
    } else {
      recycleTask(entry.taskId, '自动执行会话在启动前被关闭；任务已移回待办，下个周期自动重试。')
    }
  })

  /**
   * Sweep: covers only the paths events don't reach — deliveries whose
   * conversation never started (60s) and runs exceeding the total timeout
   * (30min; the running session is left alone, not cancelled).
   */
  const deliverySweep = setInterval(() => {
    if (disposed) return
    const now = Date.now()
    for (const [sessionId, entry] of [...pendingDeliveries]) {
      if (entry.started && now - (entry.lastHeartbeatAt ?? entry.startedAt) >= 60_000) {
        // Board liveness: the model is not required to report status itself
        entry.lastHeartbeatAt = now
        store.emitExecuting(entry.taskId, `AI 执行中（已 ${Math.max(1, Math.round((now - entry.startedAt) / 60_000))} 分钟）`)
      }
      if (!entry.started && now - entry.startedAt > DELIVERY_START_TIMEOUT_MS) {
        pendingDeliveries.delete(sessionId)
        recycleTask(entry.taskId, '自动执行会话未启动；任务已移回待办，下个周期自动重试。')
      } else if (entry.started && now - entry.startedAt > DELIVERY_WATCH_TIMEOUT_MS) {
        pendingDeliveries.delete(sessionId)
        store.emitComment(entry.taskId, '等待自动执行会话超时（30分钟），任务保持进行中，请人工确认。')
      }
    }
  }, 10_000)

  // ── Feishu auto-sync ──
  /** Pull Feishu records into the board (upsert by record id). Existing tasks
   * keep their local status — status flows to Feishu via push-back instead. */
  const pullNow = async (): Promise<number> => {
    const client = feishuRef.current
    if (!client) return 0
    const tasks = await client.syncFromFeishu()
    for (const task of tasks) {
      const existing = store.getById(task.id)
      if (existing) {
        const { status: _status, ...fields } = task
        store.update(task.id, fields)
      } else {
        store.create(task)
      }
    }
    return tasks.length
  }

  let lastPullAt = 0
  // 60s master tick: pull when the configured autoSyncMinutes interval elapses
  const feishuSweep = setInterval(() => {
    if (disposed || !feishuRef.current) return
    let minutes = 0
    try {
      const raw = store.getSetting('feishu')
      minutes = raw ? (JSON.parse(raw).autoSyncMinutes ?? 0) : 0
    } catch { return }
    if (minutes <= 0) return
    if (Date.now() - lastPullAt < minutes * 60_000) return
    lastPullAt = Date.now()
    pullNow()
      .then(n => console.log(`[dsh-kanban] Feishu auto-pull: ${n} tasks`))
      .catch(e => console.warn('[dsh-kanban] Feishu auto-pull failed:', (e as Error)?.message ?? e))
  }, 60_000)

  // Push back to Feishu when the AI finishes a task's work (status → 评审中)
  disposers.push(store.events.subscribe(evt => {
    if (evt.type !== 'task:completed' || disposed) return
    const task = store.getById(evt.taskId)
    if (!task || !feishuRef.current) return
    feishuRef.current.syncToFeishu([task], (taskId, recordId) => store.attachFeishuRecord(taskId, recordId))
      .then(() => console.log(`[dsh-kanban] Feishu push-back ok: ${task.title}`))
      .catch(e => console.warn(`[dsh-kanban] Feishu push-back failed for "${task.title}":`, (e as Error)?.message ?? e))
  }))

  /**
   * Delivery mode 'existing': enqueue the task as a follow-up turn on a live
   * root agent — prefer an idle session so the turn starts immediately;
   * otherwise the newest root (followup queues as its next turn).
   * Synchronous; does not manage the deliveryOutstanding gate.
   */
  function deliverToExistingAgent(task: Task): { delivered: boolean; reason?: string } {
    let agent
    try {
      const roots = ctx.agents.roots()
      agent = roots.length === 0 ? undefined : roots.find(a => a.status === 'idle') ?? roots[roots.length - 1]
    } catch {
      agent = undefined
    }
    if (!agent) {
      console.log('[dsh-kanban] Delivery: no live DSH session, task stays in todo')
      return { delivered: false, reason: '当前没有活跃的 DSH 会话' }
    }

    store.claimTask(task.id, `已投递给 AI 执行（会话 ${agent.id}）`)
    autoTaskStore.recordRun(task.id, task.title)

    trackDelivery(agent.id, task.id)
    try {
      agent.followup(buildKanbanMessage(task))
    } catch (e) {
      pendingDeliveries.delete(agent.id)
      throw e
    }
    console.log(`[dsh-kanban] Delivered "${task.title}" to session ${agent.id}`)
    return { delivered: true }
  }

  /**
   * Delivery mode 'new-session': create a dedicated session through the host
   * session controller — the same official entry the GUI uses. Creating with
   * the project's `workspaceId` attaches the session to the workspace (the
   * sidebar lists it under the project); the default agent preset resolves
   * the model. Falls back to 'existing' delivery when creation fails.
   * The session id is pre-generated so the delivery joins the execution gate
   * before any async work; finalization happens on the session's turn/end.
   */
  async function deliverInNewSession(task: Task, sessionId: string): Promise<void> {
    try {
      const workspace = resolveProjectWorkspace(task.project)
      await ctx.sessionController.create(workspace ? { workspaceId: workspace.id, sessionId } : { cwd: homedir(), sessionId })
    } catch (e) {
      pendingDeliveries.delete(sessionId)
      console.warn('[dsh-kanban] Delivery: session creation failed, falling back to existing session:', e)
      const fallback = deliverToExistingAgent(task)
      if (!fallback.delivered) {
        console.warn(`[dsh-kanban] Delivery fallback failed: ${fallback.reason}`)
      }
      return
    }

    store.claimTask(task.id, `已投递给 AI 执行（会话 ${sessionId}）`)
    autoTaskStore.recordRun(task.id, task.title)

    // prompt() validates the model route before queueing — a deployment whose
    // default model is not resolvable yet surfaces here with a clear error.
    // The direct host-side call must pass the Remote signature's AbortSignal.
    try {
      await ctx.sessionController.prompt({
        requestId: randomUUID(),
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: buildTaskPrompt(task) }],
      }, new AbortController().signal)
    } catch (e) {
      pendingDeliveries.delete(sessionId)
      const err = e as Error
      recycleTask(task.id, `自动执行失败：${err?.message ?? String(e)}；任务已移回待办，下个周期自动重试。`)
      return
    }
    console.log(`[dsh-kanban] Delivered "${task.title}" to new session ${sessionId}`)
  }

  /**
   * Shared delivery entry for the scheduler and the manual exec route. The
   * execution gate is the pendingDeliveries map — a delivery joins it before
   * any async work (pre-generated session id) and leaves it on turn/end
   * (event-driven) or when the sweep recycles it.
   */
  function startTaskDelivery(task: Task): { started: boolean; error?: string } {
    if (disposed) return { started: false, error: '插件正在卸载' }
    if (pendingDeliveries.size > 0) return { started: false, error: '已有任务正在执行，请等待完成后再试' }

    const cfg = autoTaskStore.getConfig()
    if (cfg.deliveryMode === 'new-session') {
      // session- prefix matches the GUI's own session id format
      const sessionId = `session-${randomUUID()}`
      trackDelivery(sessionId, task.id)
      void deliverInNewSession(task, sessionId)
        .catch(e => {
          pendingDeliveries.delete(sessionId)
          console.error('[dsh-kanban] Task delivery error:', e)
        })
      return { started: true }
    }

    const result = deliverToExistingAgent(task)
    return result.delivered ? { started: true } : { started: false, error: result.reason }
  }

  function runAutoTask() {
    const cfg = autoTaskStore.getConfig()
    if (!cfg.enabled) return

    autoTaskStore.setRunning(true)
    try {
      const todoTasks = store.getAll()['todo'] || []
      if (todoTasks.length === 0) return

      // Prefer project-bound tasks so related work goes first
      const task = todoTasks.find(t => t.project) || todoTasks[0]

      if (cfg.autoExecute === false) {
        store.move(task.id, 'in-progress', 0)
        autoTaskStore.recordRun(task.id, task.title)
        console.log(`[dsh-kanban] Auto-task: moved "${task.title}" to in-progress (delivery disabled)`)
        return
      }

      const result = startTaskDelivery(task)
      if (!result.started) {
        console.log(`[dsh-kanban] Auto-task skipped: ${result.error}`)
      }
    } catch (e) {
      console.error('[dsh-kanban] Auto-task error:', e)
    } finally {
      autoTaskStore.setRunning(false)
    }
  }

  // Start or restart the auto-task timer
  function startAutoTaskTimer() {
    autoTaskStore.clearTimer()
    const cfg = autoTaskStore.getConfig()
    if (!cfg.enabled) return

    const ms = (cfg.intervalMinutes || 30) * 60 * 1000
    console.log(`[dsh-kanban] Auto-task scheduler started, interval: ${cfg.intervalMinutes}min`)
    const timer = setInterval(runAutoTask, ms)
    autoTaskStore.setTimer(timer)
  }

  startAutoTaskTimer()

  // Restart timer when config changes
  autoTaskStore.onConfigChange(() => startAutoTaskTimer())

  // Cleanup on dispose
  ctx.effect(() => () => {
    disposed = true
    clearInterval(deliverySweep)
    clearInterval(feishuSweep)
    for (const dispose of disposers) dispose()
    autoTaskStore.clearTimer()
    store.close()
  }, 'dsh-kanban: routes')

  console.log('[dsh-kanban] Plugin initialized successfully')
}

export const apply = mountOnce('dsh-kanban', applyImpl)
