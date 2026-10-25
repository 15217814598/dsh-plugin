/**
 * API routes for task kanban
 * Each path registered once; method dispatch inside handler.
 * Task IDs use path parameters (/tasks/:id) served by a single prefix route —
 * the webserver only supports exact/prefix matching, so the handler parses
 * the sub-path itself. Legacy /task?id= routes kept for backward compatibility.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { FeishuClient } from './feishu.js'
import type { FeishuConfig, ExecutionEvent } from './types.js'
import type { CreateTaskInput, UpdateTaskInput, MoveTaskInput, ApiResponse } from './types.js'
import type { TaskEventEmitter } from './store.js'

/** API base path */
export const KANBAN_API_BASE = '/api/dsh-kanban'

/**
 * Route definition for the DSH webServer service.
 * `kind: 'exact'` matches the path itself; `kind: 'prefix'` matches the path
 * and anything below it (longest prefix wins, exact table wins over prefixes).
 */
export interface KanbanRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

/** Parse JSON body from request */
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** Send JSON response */
function sendJson(res: ServerResponse, status: number, data: ApiResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Get query parameter */
function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/** 判断飞书配置是否仍为 cordis.patch.yml 中的占位符 */
function isFeishuPlaceholder(cfg?: FeishuConfig): boolean {
  if (!cfg?.appId || !cfg?.appSecret || !cfg?.appToken || !cfg?.tableId) return true
  return cfg.appId.startsWith('your-') || cfg.appSecret.startsWith('your-')
    || cfg.appToken.startsWith('your-') || cfg.tableId.startsWith('your-')
}

/** Shared, mutable Feishu client holder (index.ts owns resolution; config saves swap it). */
export interface FeishuClientRef {
  current: FeishuClient | null
}

/** Create API routes */
export function createKanbanRoutes(
  store: import('./store.js').TaskStore,
  feishuConfig?: FeishuConfig,
  autoTaskStore?: import('./auto-task-store.js').AutoTaskStore,
  eventEmitter?: TaskEventEmitter,
  execTask?: (task: import('./types.js').Task) => { started: boolean; error?: string },
  feishuRef?: FeishuClientRef,
): KanbanRoute[] {
  // The Feishu client is resolved and owned by index.ts via feishuRef (shared
  // with the auto-sync timers); config saves through these routes swap it.

  return [
    // ── /api/dsh-kanban/tasks (GET=list, POST=create) ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/tasks`,
      handler: async (req, res) => {
        const method = req.method ?? 'GET'

        // GET - Get all tasks
        if (method === 'GET') {
          const tasks = store.getAll()
          sendJson(res, 200, { success: true, data: tasks })
          return
        }

        // POST - Create new task
        if (method === 'POST') {
          try {
            const input: CreateTaskInput = await parseBody(req)
            if (!input.title?.trim()) {
              sendJson(res, 400, { success: false, error: 'Title is required' })
              return
            }
            const task = store.create(input)
            sendJson(res, 201, { success: true, data: task })
          } catch (error: any) {
            sendJson(res, 400, { success: false, error: error.message })
          }
          return
        }

        sendJson(res, 405, { success: false, error: `method not allowed: ${method}` })
      },
    },

    // ── /api/dsh-kanban/tasks/:id (GET=get, PUT=update, DELETE=delete) ──
    // ── /api/dsh-kanban/tasks/:id/move (PATCH) ──
    {
      kind: 'prefix',
      path: `${KANBAN_API_BASE}/tasks`,
      handler: async (req, res) => {
        const method = req.method ?? 'GET'
        const url = new URL(req.url ?? '/', 'http://localhost')
        const base = `${KANBAN_API_BASE}/tasks/`
        if (!url.pathname.startsWith(base)) {
          sendJson(res, 404, { success: false, error: 'Task not found' })
          return
        }

        const [rawId, sub, ...rest] = url.pathname.slice(base.length).split('/')
        const id = decodeURIComponent(rawId ?? '')

        if (!id || rest.length > 0) {
          sendJson(res, 404, { success: false, error: 'Task not found' })
          return
        }

        // /tasks/:id/move — PATCH
        if (sub) {
          if (sub !== 'move' || method !== 'PATCH') {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }
          try {
            const input: MoveTaskInput = await parseBody(req)

            if (!input.status) {
              sendJson(res, 400, { success: false, error: 'Status is required' })
              return
            }

            const task = store.move(id, input.status, input.order ?? 0)
            if (!task) {
              sendJson(res, 404, { success: false, error: 'Task not found' })
              return
            }

            sendJson(res, 200, { success: true, data: task })
          } catch (error: any) {
            sendJson(res, 400, { success: false, error: error.message })
          }
          return
        }

        // /tasks/:id — GET
        if (method === 'GET') {
          const task = store.getById(id)
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }
          sendJson(res, 200, { success: true, data: task })
          return
        }

        // /tasks/:id — PUT
        if (method === 'PUT') {
          try {
            const input: UpdateTaskInput = await parseBody(req)
            const task = store.update(id, input)
            if (!task) {
              sendJson(res, 404, { success: false, error: 'Task not found' })
              return
            }
            sendJson(res, 200, { success: true, data: task })
          } catch (error: any) {
            sendJson(res, 400, { success: false, error: error.message })
          }
          return
        }

        // /tasks/:id — DELETE
        if (method === 'DELETE') {
          const deleted = store.delete(id)
          if (!deleted) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }
          sendJson(res, 200, { success: true })
          return
        }

        sendJson(res, 405, { success: false, error: `method not allowed: ${method}` })
      },
    },

    // ── /api/dsh-kanban/task?id=xxx (GET=get, PUT=update, DELETE=delete; legacy) ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/task`,
      handler: async (req, res) => {
        const method = req.method ?? 'GET'
        const url = new URL(req.url ?? '/', 'http://localhost')
        const id = queryParam(url, 'id')

        if (!id) {
          sendJson(res, 400, { success: false, error: 'id query parameter is required' })
          return
        }

        // GET - Get task by ID
        if (method === 'GET') {
          const task = store.getById(id)
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }
          sendJson(res, 200, { success: true, data: task })
          return
        }

        // PUT - Update task
        if (method === 'PUT') {
          try {
            const input: UpdateTaskInput = await parseBody(req)
            const task = store.update(id, input)
            if (!task) {
              sendJson(res, 404, { success: false, error: 'Task not found' })
              return
            }
            sendJson(res, 200, { success: true, data: task })
          } catch (error: any) {
            sendJson(res, 400, { success: false, error: error.message })
          }
          return
        }

        // DELETE - Delete task
        if (method === 'DELETE') {
          const deleted = store.delete(id)
          if (!deleted) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }
          sendJson(res, 200, { success: true })
          return
        }

        sendJson(res, 405, { success: false, error: `method not allowed: ${method}` })
      },
    },

    // ── /api/dsh-kanban/task/move?id=xxx (PATCH; legacy) ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/task/move`,
      handler: async (req, res) => {
        if (req.method !== 'PATCH') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        const url = new URL(req.url ?? '/', 'http://localhost')
        const id = queryParam(url, 'id')

        if (!id) {
          sendJson(res, 400, { success: false, error: 'id query parameter is required' })
          return
        }

        try {
          const input: MoveTaskInput = await parseBody(req)

          if (!input.status) {
            sendJson(res, 400, { success: false, error: 'Status is required' })
            return
          }

          const task = store.move(id, input.status, input.order ?? 0)
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }

          sendJson(res, 200, { success: true, data: task })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/feishu/status ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/feishu/status`,
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        if (!feishuRef?.current) {
          sendJson(res, 200, {
            success: true,
            data: { configured: false, message: '飞书未配置' },
          })
          return
        }

        sendJson(res, 200, {
          success: true,
          data: { configured: true, message: '飞书已配置' },
        })
      },
    },

    // ── /api/dsh-kanban/feishu/config (GET=read config, POST=save config) ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/feishu/config`,
      handler: async (req, res) => {
        // GET — return the active config so the dialog can prefill.
        if (req.method === 'GET') {
          try {
            const savedRaw = store.getSetting('feishu')
            const saved = savedRaw ? JSON.parse(savedRaw) : null
            const fromPatch = isFeishuPlaceholder(feishuConfig) ? null : feishuConfig
            const active = saved || fromPatch
            sendJson(res, 200, {
              success: true,
              data: active
                ? {
                    appId: active.appId ?? '',
                    appSecret: active.appSecret ?? '',
                    appToken: active.appToken ?? '',
                    tableId: active.tableId ?? '',
                    fieldMapping: active.fieldMapping,
                    autoSyncMinutes: active.autoSyncMinutes ?? 0,
                  }
                : null,
            })
          } catch (error: any) {
            sendJson(res, 500, { success: false, error: `读取配置失败: ${error.message}` })
          }
          return
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const config = await parseBody(req)

          if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
            sendJson(res, 400, {
              success: false,
              error: '缺少必填字段',
            })
            return
          }

          // 归一化：去掉复制粘贴带来的首尾空白/换行（飞书对脏值报 invalid param）
          const autoSyncMinutes = Math.max(0, Math.min(1440, parseInt(String(config.autoSyncMinutes ?? 0), 10) || 0))
          const normalized = {
            appId: String(config.appId).trim(),
            appSecret: String(config.appSecret).trim(),
            appToken: String(config.appToken).trim(),
            tableId: String(config.tableId).trim(),
            fieldMapping: config.fieldMapping,
            autoSyncMinutes,
          }

          // 创建新的飞书客户端
          if (feishuRef) feishuRef.current = new FeishuClient(normalized as FeishuConfig)

          // 保存到 SQLite settings 表（重启后自动加载）
          store.setSetting('feishu', JSON.stringify(normalized))

          sendJson(res, 200, {
            success: true,
            data: { message: '飞书配置已保存' },
          })
        } catch (error: any) {
          sendJson(res, 500, {
            success: false,
            error: `保存配置失败: ${error.message}`,
          })
        }
      },
    },

    // ── /api/dsh-kanban/feishu/sync-from ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/feishu/sync-from`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        if (!feishuRef?.current) {
          sendJson(res, 400, {
            success: false,
            error: '飞书未配置，请在 cordis.patch.yml 中配置飞书应用凭证',
          })
          return
        }

        try {
          const tasks = await feishuRef.current.syncFromFeishu()

          for (const task of tasks) {
            const existing = store.getById(task.id)
            if (existing) {
              // 更新本地已有的任务时不覆盖状态——状态流转以看板为准（完成时推回飞书）
              const { status: _status, ...fields } = task
              store.update(task.id, fields)
            } else {
              store.create(task)
            }
          }

          sendJson(res, 200, {
            success: true,
            data: { imported: tasks.length, message: `成功从飞书同步 ${tasks.length} 个任务` },
          })
        } catch (error: any) {
          sendJson(res, 500, {
            success: false,
            error: `同步失败: ${error.message}`,
          })
        }
      },
    },

    // ── /api/dsh-kanban/feishu/sync-to ──
    {
      kind: 'exact',
      path: `${KANBAN_API_BASE}/feishu/sync-to`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        if (!feishuRef?.current) {
          sendJson(res, 400, {
            success: false,
            error: '飞书未配置，请在 cordis.patch.yml 中配置飞书应用凭证',
          })
          return
        }

        try {
          const allTasks = store.getAll()
          const tasks = [
            ...allTasks.planned,
            ...allTasks.todo,
            ...allTasks['in-progress'],
            ...allTasks.review,
            ...allTasks.done,
          ]

          await feishuRef.current.syncToFeishu(tasks, (taskId, recordId) => store.attachFeishuRecord(taskId, recordId))

          sendJson(res, 200, {
            success: true,
            data: { exported: tasks.length, message: `成功同步 ${tasks.length} 个任务到飞书` },
          })
        } catch (error: any) {
          sendJson(res, 500, {
            success: false,
            error: `同步失败: ${error.message}`,
          })
        }
      },
    },

    // ── /api/dsh-kanban/auto-task/config (GET=get, POST=update) ──
    ...(autoTaskStore ? [
      {
        kind: 'exact' as const,
        path: `${KANBAN_API_BASE}/auto-task/config`,
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          const method = req.method ?? 'GET'

          if (method === 'GET') {
            sendJson(res, 200, { success: true, data: autoTaskStore.getConfig() })
            return
          }

          if (method === 'POST') {
            try {
              const input = await parseBody(req)
              const config = autoTaskStore.updateConfig(input)
              sendJson(res, 200, { success: true, data: config })
            } catch (error: any) {
              sendJson(res, 400, { success: false, error: error.message })
            }
            return
          }

          sendJson(res, 405, { success: false, error: `method not allowed: ${method}` })
        },
      },

      {
        kind: 'exact' as const,
        path: `${KANBAN_API_BASE}/auto-task/status`,
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            sendJson(res, 405, { success: false, error: 'method not allowed' })
            return
          }
          sendJson(res, 200, { success: true, data: autoTaskStore.getConfig() })
        },
      },
    ] : []),

    // ── /api/dsh-kanban/tasks/:id/claim (POST) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/tasks/claim`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const { taskId, message: msg } = await parseBody(req)
          if (!taskId) {
            sendJson(res, 400, { success: false, error: 'taskId is required' })
            return
          }

          const task = store.claimTask(taskId, msg)
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }

          sendJson(res, 200, { success: true, data: task })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/tasks/:id/complete (POST) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/tasks/complete`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const { taskId, message: msg } = await parseBody(req)
          if (!taskId) {
            sendJson(res, 400, { success: false, error: 'taskId is required' })
            return
          }

          const task = store.completeTask(taskId, msg)
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }

          sendJson(res, 200, { success: true, data: task })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/tasks/:id/fail (POST) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/tasks/fail`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const { taskId, error: errorMsg } = await parseBody(req)
          if (!taskId) {
            sendJson(res, 400, { success: false, error: 'taskId is required' })
            return
          }

          const task = store.failTask(taskId, errorMsg || '未知错误')
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }

          sendJson(res, 200, { success: true, data: task })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/tasks/exec (POST — manual start, uses the scheduler's delivery engine) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/tasks/exec`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const { taskId } = await parseBody(req)
          if (!taskId) {
            sendJson(res, 400, { success: false, error: 'taskId is required' })
            return
          }

          const task = store.getById(taskId)
          if (!task) {
            sendJson(res, 404, { success: false, error: 'Task not found' })
            return
          }

          if (task.status !== 'todo' && task.status !== 'planned' && task.status !== 'in-progress') {
            sendJson(res, 400, {
              success: false,
              error: `任务状态为「${task.status}」，只能启动待规划/待办/进行中的任务`,
            })
            return
          }

          if (!execTask) {
            sendJson(res, 500, { success: false, error: '任务执行引擎不可用' })
            return
          }

          const result = execTask(task)
          if (!result.started) {
            sendJson(res, 409, { success: false, error: result.error || '任务未能启动' })
            return
          }

          sendJson(res, 200, { success: true, data: store.getById(taskId) })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/tasks/:id/progress (POST) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/tasks/progress`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const { taskId, message: msg } = await parseBody(req)
          if (!taskId || !msg) {
            sendJson(res, 400, { success: false, error: 'taskId and message are required' })
            return
          }

          store.emitExecuting(taskId, msg)
          sendJson(res, 200, { success: true })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/tasks/:id/comment (POST) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/tasks/comment`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        try {
          const { taskId, message: msg } = await parseBody(req)
          if (!taskId || !msg) {
            sendJson(res, 400, { success: false, error: 'taskId and message are required' })
            return
          }

          store.emitComment(taskId, msg)
          sendJson(res, 200, { success: true })
        } catch (error: any) {
          sendJson(res, 400, { success: false, error: error.message })
        }
      },
    },

    // ── /api/dsh-kanban/events (GET — SSE endpoint) ──
    {
      kind: 'exact' as const,
      path: `${KANBAN_API_BASE}/events`,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { success: false, error: 'method not allowed' })
          return
        }

        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        })

        // Send initial connection confirmation
        res.write(': connected\n\n')
        res.write(`event: init\ndata: ${JSON.stringify({ history: eventEmitter?.getHistory(30) || [] })}\n\n`)

        // Subscribe to execution events
        const unsubscribe = eventEmitter?.subscribe((event: ExecutionEvent) => {
          try {
            res.write(`event: execution\ndata: ${JSON.stringify(event)}\n\n`)
          } catch { /* client disconnected */ }
        })

        // Keep-alive every 20 seconds
        const keepAlive = setInterval(() => {
          try { res.write(': keep-alive\n\n') } catch { /* ignore */ }
        }, 20_000)

        // Cleanup on disconnect
        req.once('close', () => {
          clearInterval(keepAlive)
          unsubscribe?.()
        })
      },
    },
  ]
}
