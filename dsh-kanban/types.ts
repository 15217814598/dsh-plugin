/**
 * Type definitions for dsh-kanban plugin
 */

/** Task priority levels */
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

/** Task status */
export type TaskStatus = 'planned' | 'todo' | 'in-progress' | 'review' | 'done'

/** Task item */
export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  tags: string[]
  assignee?: string
  project?: string
  /** Session that executed/witnessed this task (set on auto-task delivery). */
  sessionId?: string
  /** Feishu bitable record id backing this task (set by sync/push-back). */
  feishuRecordId?: string
  comments?: number
  attachments?: number
  createdAt: string
  updatedAt: string
  dueDate?: string
  order: number
}

/** Column configuration */
export interface ColumnConfig {
  id: TaskStatus
  title: string
  color: string
}

/** Plugin configuration */
export interface KanbanConfig {
  enabled?: boolean
  maxTasks?: number
  columns?: ColumnConfig[]
  feishu?: FeishuConfig
  /** SQLite 数据库路径覆盖；默认 $DSH_HOME/dsh-kanban.db（DSH_HOME 缺省为 ~/.dsh） */
  dbPath?: string
}

/** 飞书配置 */
export interface FeishuConfig {
  appId: string
  appSecret: string
  appToken: string
  tableId: string
  fieldMapping?: {
    title?: string
    description?: string
    status?: string
    priority?: string
    tags?: string
    dueDate?: string
    project?: string
    assignee?: string
  }
}

/** API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** Task create input */
export interface CreateTaskInput {
  /** Caller-pinned id (Feishu sync preserves record ids). */
  id?: string
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  tags?: string[]
  assignee?: string
  project?: string
  dueDate?: string
}

/** Task update input */
export interface UpdateTaskInput {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  tags?: string[]
  assignee?: string
  project?: string
  dueDate?: string
  order?: number
}

/** Move task input */
export interface MoveTaskInput {
  status: TaskStatus
  order: number
}

/** Auto-task configuration */
export interface AutoTaskConfig {
  enabled: boolean
  intervalMinutes: number
  lastRunAt: string | null
  lastTaskId: string | null
  lastTaskTitle: string | null
}

/** Task execution status (optional field on Task, backward-compatible) */
export type TaskExecutionStatus = 'idle' | 'executing' | 'completed' | 'failed'

/** Execution event types */
export type ExecutionEventType = 'task:claimed' | 'task:executing' | 'task:completed' | 'task:failed' | 'task:comment'

/** Execution event for SSE streaming */
export interface ExecutionEvent {
  id: string
  taskId: string
  taskTitle: string
  type: ExecutionEventType
  message: string
  timestamp: string
}

/** SSE event payload */
export interface SSEPayload {
  type: 'execution'
  event: ExecutionEvent
}
