/**
 * API client for dsh-kanban — aligned with actual server routes
 * Enhanced with retry logic, timeout, and structured error handling
 * (referenced from dashi-taskboard's api.ts patterns)
 */

// ── Types ──────────────────────────────────────────────────────────

export type ExecutionEventType = 'task:claimed' | 'task:executing' | 'task:completed' | 'task:failed' | 'task:comment'

export interface ExecutionEvent {
  id: string
  taskId: string
  taskTitle: string
  type: ExecutionEventType
  message: string
  timestamp: string
}

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: 'urgent' | 'high' | 'medium' | 'low'
  tags: string[]
  project?: string
  assignee?: string
  /** Session that executed/witnessed this task (set on auto-task delivery). */
  sessionId?: string
  comments?: number
  attachments?: number
  dueDate?: string
  createdAt?: string
  updatedAt?: string
  order?: number
}

export type TaskStatus = 'planned' | 'todo' | 'in-progress' | 'review' | 'done'

export interface CreateTaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  tags?: string[]
  project?: string
  assignee?: string
  dueDate?: string
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  tags?: string[]
  project?: string
  assignee?: string
  dueDate?: string
}

export interface FeishuConfig {
  appId: string
  appSecret: string
  bitableAppToken: string
  tableId: string
  /** Auto-pull interval in minutes; 0/undefined = off. */
  autoSyncMinutes?: number
}

export type AutoTaskDeliveryMode = 'new-session' | 'existing'

export interface AutoTaskConfig {
  enabled: boolean
  intervalMinutes: number
  /** 'new-session': run each task in its own conversation; 'existing': append a turn to a live session */
  deliveryMode?: AutoTaskDeliveryMode
}

export interface AutoTaskStatus {
  lastRunAt?: string
  lastTaskTitle?: string
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ── Error class ────────────────────────────────────────────────────

export class KanbanApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, message: string, code = 'REQUEST_FAILED') {
    super(message)
    this.name = 'KanbanApiError'
    this.status = status
    this.code = code
  }
}

// ── Request helpers ────────────────────────────────────────────────

const API_BASE = '/api/dsh-kanban'
const REQUEST_TIMEOUT = 15_000 // 15s timeout
const MAX_RETRIES = 2 // retry GET requests up to 2 times

function getAuthToken(): string {
  return localStorage.getItem('dsh-auth-token') || ''
}

async function request<T>(
  path: string,
  options?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const isRead = method === 'GET' || method === 'HEAD'

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= (isRead ? MAX_RETRIES : 0); attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 250ms, 500ms
      await new Promise((r) => setTimeout(r, 250 * attempt))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    // Link external signal to our controller
    const externalSignal = options?.signal
    const onAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onAbort)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
          ...options?.headers,
        },
      })

      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', onAbort)

      let body: ApiResponse<T>
      try {
        body = await response.json()
      } catch {
        body = { success: false, error: `Invalid JSON response (${response.status})` }
      }

      if (!response.ok || !body.success) {
        const errorMsg = body.error || `Request failed (${response.status})`
        throw new KanbanApiError(response.status, errorMsg, response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED')
      }

      return body.data as T
    } catch (err: any) {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', onAbort)

      if (err.name === 'AbortError') {
        if (externalSignal?.aborted) throw err // user cancelled
        lastError = new KanbanApiError(0, '请求超时，请稍后重试', 'TIMEOUT')
      } else if (err instanceof KanbanApiError) {
        throw err // don't retry client errors
      } else {
        lastError = new KanbanApiError(0, '网络连接失败，请检查网络', 'NETWORK_ERROR')
      }

      // Only retry on read requests
      if (!isRead) throw lastError
    }
  }

  throw lastError ?? new KanbanApiError(0, '请求失败', 'REQUEST_FAILED')
}

// ── Public API ─────────────────────────────────────────────────────

export const kanbanApi = {
  // Tasks
  async getAll(signal?: AbortSignal): Promise<Record<TaskStatus, Task[]>> {
    return request<Record<TaskStatus, Task[]>>('/tasks', { signal })
  },

  async create(input: CreateTaskInput): Promise<Task> {
    return request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    return request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },

  async delete(id: string): Promise<void> {
    return request<void>(`/tasks/${id}`, {
      method: 'DELETE',
    })
  },

  async move(id: string, status: TaskStatus, order = 0): Promise<Task> {
    return request<Task>(`/tasks/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ status, order }),
    })
  },

  // Feishu sync
  async feishuSyncFrom(): Promise<{ message: string }> {
    return request<{ message: string }>('/feishu/sync-from', {
      method: 'POST',
    })
  },

  async feishuSyncTo(): Promise<{ message: string }> {
    return request<{ message: string }>('/feishu/sync-to', {
      method: 'POST',
    })
  },

  async feishuSaveConfig(config: FeishuConfig): Promise<void> {
    // Persist server-side (SQLite settings) so it survives restarts and the
    // sync endpoints actually see it. The client field is bitableAppToken;
    // the wire format uses appToken.
    await request<{ message: string }>('/feishu/config', {
      method: 'POST',
      body: JSON.stringify({
        appId: config.appId,
        appSecret: config.appSecret,
        appToken: config.bitableAppToken,
        tableId: config.tableId,
        autoSyncMinutes: config.autoSyncMinutes ?? 0,
      }),
    })
    // Keep a local copy as an offline fallback for dialog prefill
    localStorage.setItem('dsh-kanban-feishu-config', JSON.stringify(config))
  },

  /** Read the active Feishu config from the server (null when unconfigured). */
  async feishuGetConfig(): Promise<FeishuConfig | null> {
    const data = await request<{ appId: string; appSecret: string; appToken: string; tableId: string; autoSyncMinutes?: number } | null>(
      '/feishu/config',
    )
    if (!data || !data.appId) return null
    return {
      appId: data.appId,
      appSecret: data.appSecret,
      bitableAppToken: data.appToken,
      tableId: data.tableId,
      autoSyncMinutes: data.autoSyncMinutes ?? 0,
    }
  },

  // Auto-task
  async getAutoTaskConfig(): Promise<AutoTaskConfig> {
    return request<AutoTaskConfig>('/auto-task/config')
  },

  async saveAutoTaskConfig(config: AutoTaskConfig): Promise<void> {
    return request<void>('/auto-task/config', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  },

  async getAutoTaskStatus(): Promise<AutoTaskStatus> {
    return request<AutoTaskStatus>('/auto-task/status')
  },

  // ── Task execution API ──

  async claimTask(taskId: string, message?: string): Promise<Task> {
    return request<Task>('/tasks/claim', {
      method: 'POST',
      body: JSON.stringify({ taskId, message }),
    })
  },

  async completeTask(taskId: string, message?: string): Promise<Task> {
    return request<Task>('/tasks/complete', {
      method: 'POST',
      body: JSON.stringify({ taskId, message }),
    })
  },

  async failTask(taskId: string, error: string): Promise<Task> {
    return request<Task>('/tasks/fail', {
      method: 'POST',
      body: JSON.stringify({ taskId, error }),
    })
  },

  async reportProgress(taskId: string, message: string): Promise<void> {
    return request<void>('/tasks/progress', {
      method: 'POST',
      body: JSON.stringify({ taskId, message }),
    })
  },

  /** Manually start a task via the server-side delivery engine */
  async execTask(taskId: string): Promise<Task> {
    return request<Task>('/tasks/exec', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    })
  },

  async addComment(taskId: string, message: string): Promise<void> {
    return request<void>('/tasks/comment', {
      method: 'POST',
      body: JSON.stringify({ taskId, message }),
    })
  },
}

// ── SSE Subscription ───────────────────────────────────────────────

export interface SSESubscription {
  unsubscribe: () => void
}

/**
 * Subscribe to task execution events via SSE.
 * Returns an unsubscribe function.
 * Uses the "hint-then-poll" pattern from dashi-taskboard:
 * SSE delivers lightweight events, client fetches full state when needed.
 */
export function subscribeExecutionEvents(
  onEvent: (event: ExecutionEvent) => void,
  onInit?: (history: ExecutionEvent[]) => void,
  onError?: () => void,
): SSESubscription {
  const source = new EventSource(`${API_BASE}/events`)

  source.addEventListener('init', ((e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      onInit?.(data.history || [])
    } catch { /* ignore parse errors */ }
  }) as EventListener)

  source.addEventListener('execution', ((e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as ExecutionEvent
      onEvent(event)
    } catch { /* ignore parse errors */ }
  }) as EventListener)

  source.addEventListener('error', (() => {
    onError?.()
  }) as EventListener)

  return {
    unsubscribe: () => source.close(),
  }
}
