/**
 * Main Kanban Board component.
 * Pure CSS + inline SVG (host-themed via kanban.css) — no antd.
 * Enhanced with SSE real-time events, task filtering, and execution status.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput, ExecutionEventType } from '../api'
import { kanbanApi, KanbanApiError, subscribeExecutionEvents } from '../api'
import { COLUMNS } from '../theme'
import { getDshProjects } from '../sidebar'
import { NavHeader } from './NavHeader'
import { KanbanColumn } from './KanbanColumn'
import { TaskForm } from './TaskForm'
import { ArchiveDialog } from './ArchiveDialog'
import { FeishuDialog } from './FeishuDialog'
import { AutoTaskDialog } from './AutoTaskDialog'
import { TaskFilterBar, applyFilters, type TaskFilters } from './TaskFilterBar'
import { ExecutionLog } from './ExecutionLog'
import { toast } from './ui'
import {
  initAutoTaskPoll,
  stopStatusPoll,
} from './AutoTaskEngine'

interface KanbanBoardProps {
  onClose: () => void
}

const EMPTY_FILTERS: TaskFilters = { priorities: [], tags: [], assignees: [] }

export function KanbanBoard({ onClose }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Record<TaskStatus, Task[]>>({
    planned: [],
    todo: [],
    'in-progress': [],
    review: [],
    done: [],
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [feishuOpen, setFeishuOpen] = useState(false)
  const [autoTaskOpen, setAutoTaskOpen] = useState(false)
  const [projects, setProjects] = useState<string[]>([])

  // Execution state from SSE
  const [executingTasks, setExecutingTasks] = useState<Map<string, ExecutionEventType>>(new Map())
  const [showExecutionLog, setShowExecutionLog] = useState(false)

  // Subscribe to SSE execution events
  useEffect(() => {
    const sub = subscribeExecutionEvents(
      // onEvent
      (event) => {
        // Track executing tasks
        setExecutingTasks((prev) => {
          const next = new Map(prev)
          if (event.type === 'task:claimed' || event.type === 'task:executing') {
            next.set(event.taskId, event.type)
          } else {
            // task:completed, task:failed, task:comment — remove from executing
            next.delete(event.taskId)
          }
          return next
        })
      },
      // onInit
      (history) => {
        // Rebuild executing state from history
        const executing = new Map<string, ExecutionEventType>()
        for (const e of history) {
          if (e.type === 'task:claimed' || e.type === 'task:executing') {
            executing.set(e.taskId, e.type)
          } else {
            executing.delete(e.taskId)
          }
        }
        setExecutingTasks(executing)
      },
    )

    return () => sub.unsubscribe()
  }, [])

  // Load tasks
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await kanbanApi.getAll()
      setTasks(data)
    } catch (err: any) {
      const msg = err instanceof KanbanApiError ? err.message : (err.message || '加载任务失败')
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
    const getProjects = () => {
      setProjects(getDshProjects())
    }
    getProjects()
    initAutoTaskPoll(() => loadTasks())
    return () => {
      stopStatusPoll()
    }
  }, [loadTasks])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        if (formOpen) {
          setFormOpen(false)
          setEditingTask(null)
        } else if (archiveOpen) {
          setArchiveOpen(false)
        } else if (feishuOpen) {
          setFeishuOpen(false)
        } else if (autoTaskOpen) {
          setAutoTaskOpen(false)
        }
      }
      // Ctrl+N to create new task
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handleAddTask('todo')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [formOpen, archiveOpen, feishuOpen, autoTaskOpen])

  // Filtered and searched tasks
  const displayTasks = useMemo(() => {
    // Apply filters first
    let result = applyFilters(tasks, filters)

    // Then apply search
    if (search.trim()) {
      const q = search.toLowerCase()
      const searched: Record<TaskStatus, Task[]> = {
        planned: [], todo: [], 'in-progress': [], review: [], done: [],
      }
      for (const status of Object.keys(result) as TaskStatus[]) {
        searched[status] = result[status].filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
            (t.assignee || '').toLowerCase().includes(q) ||
            (t.project || '').toLowerCase().includes(q)
        )
      }
      result = searched
    }

    return result
  }, [tasks, search, filters])

  // Task count stats
  const taskStats = useMemo(() => {
    const allTasks = Object.values(tasks) as Task[][]
    const total = allTasks.reduce((sum: number, list: Task[]) => sum + list.length, 0)
    const done = tasks.done?.length ?? 0
    return { total, done, active: total - done }
  }, [tasks])

  // Create task
  const handleCreate = useCallback(async (input: CreateTaskInput) => {
    try {
      const task = await kanbanApi.create(input)
      setTasks((prev) => ({
        ...prev,
        [task.status]: [...prev[task.status], task],
      }))
      setFormOpen(false)
      toast('任务已创建')
    } catch (err: any) {
      toast(err.message || '创建任务失败', 'error')
    }
  }, [])

  // Update task
  const handleUpdate = useCallback(async (input: UpdateTaskInput) => {
    if (!editingTask) return
    try {
      const updated = await kanbanApi.update(editingTask.id, input)
      setTasks((prev) => {
        const next = { ...prev }
        for (const status of Object.keys(next) as TaskStatus[]) {
          const idx = next[status].findIndex((t) => t.id === editingTask.id)
          if (idx !== -1) {
            if (updated.status === status) {
              next[status] = [...next[status]]
              next[status][idx] = updated
            } else {
              next[status] = next[status].filter((t) => t.id !== editingTask.id)
              next[updated.status] = [...next[updated.status], updated]
            }
            break
          }
        }
        return next
      })
      setFormOpen(false)
      setEditingTask(null)
      toast('任务已更新')
    } catch (err: any) {
      toast(err.message || '更新任务失败', 'error')
    }
  }, [editingTask])

  // Delete task
  const handleDelete = useCallback(async (id: string) => {
    try {
      await kanbanApi.delete(id)
      setTasks((prev) => {
        const next = { ...prev }
        for (const status of Object.keys(next) as TaskStatus[]) {
          next[status] = next[status].filter((t) => t.id !== id)
        }
        return next
      })
      toast('任务已删除')
    } catch (err: any) {
      toast(err.message || '删除任务失败', 'error')
    }
  }, [])

  // Manually start a task via the server-side delivery engine
  const handleExecTask = useCallback(async (task: Task) => {
    try {
      await kanbanApi.execTask(task.id)
      toast(`已启动执行：${task.title}`)
      loadTasks()
    } catch (err: any) {
      const msg = err instanceof KanbanApiError ? err.message : (err.message || '启动执行失败')
      toast(msg, 'error')
    }
  }, [loadTasks])

  // Move task between columns
  const handleMove = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    try {
      let task: Task | undefined
      for (const status of Object.keys(tasks) as TaskStatus[]) {
        task = tasks[status].find((t) => t.id === taskId)
        if (task) break
      }
      if (!task || task.status === newStatus) return

      await kanbanApi.update(taskId, { status: newStatus })
      setTasks((prev) => {
        const next = { ...prev }
        for (const status of Object.keys(next) as TaskStatus[]) {
          const idx = next[status].findIndex((t) => t.id === taskId)
          if (idx !== -1) {
            const [moved] = next[status].splice(idx, 1)
            moved.status = newStatus
            next[newStatus] = [...next[newStatus], moved]
            break
          }
        }
        return next
      })
      toast('任务已移动')
    } catch (err: any) {
      toast(err.message || '移动任务失败', 'error')
    }
  }, [tasks])

  // Open create dialog
  const handleAddTask = useCallback((status: TaskStatus) => {
    setFormMode('create')
    setEditingTask(null)
    setDefaultStatus(status)
    setFormOpen(true)
  }, [])

  // Open edit dialog
  const handleEditTask = useCallback((task: Task) => {
    setFormMode('edit')
    setEditingTask(task)
    setFormOpen(true)
  }, [])

  // Clear all done tasks
  const handleClearAll = useCallback(async () => {
    const doneTasks = tasks.done || []
    try {
      await Promise.all(doneTasks.map((t) => kanbanApi.delete(t.id)))
      setTasks((prev) => ({ ...prev, done: [] }))
      toast('已清空所有已完成任务')
    } catch (err: any) {
      toast(err.message || '清空失败', 'error')
    }
  }, [tasks.done])

  if (loading) {
    return (
      <div className="kb-loading">加载中…</div>
    )
  }

  return (
    <div className="kb-page" data-kanban-root>
      <NavHeader
        onBack={onClose}
          searchValue={search}
          onSearchChange={setSearch}
          onArchive={() => setArchiveOpen(true)}
          onFeishu={() => setFeishuOpen(true)}
          onAutoTask={() => setAutoTaskOpen(true)}
          onNewTask={() => handleAddTask('todo')}
          taskStats={taskStats}
          executingCount={executingTasks.size}
          onToggleLog={() => setShowExecutionLog((v) => !v)}
        />

        {/* Filter bar + Execution log toggle */}
        <div
          style={{
            padding: '8px 20px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TaskFilterBar
            filters={filters}
            onFiltersChange={setFilters}
            tasks={tasks}
          />
        </div>

        {/* Execution Log Panel (collapsible) */}
        {showExecutionLog && (
          <div style={{ padding: '8px 20px 0' }}>
            <ExecutionLog />
          </div>
        )}

        {/* Board */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 14,
            padding: '12px 20px 20px',
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
        >
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              color={col.color}
              tasks={displayTasks[col.id] || []}
              executingTasks={executingTasks}
              onAddTask={handleAddTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDelete}
              onMoveTask={handleMove}
              onExecTask={handleExecTask}
            />
          ))}
        </div>

        {/* Task Form Dialog */}
        <TaskForm
          open={formOpen}
          mode={formMode}
          task={editingTask}
          defaultStatus={defaultStatus}
          projects={projects}
          onClose={() => {
            setFormOpen(false)
            setEditingTask(null)
          }}
          onSubmit={(input) =>
            formMode === 'create'
              ? handleCreate(input as CreateTaskInput)
              : handleUpdate(input as UpdateTaskInput)
          }
        />

        {/* Archive Dialog */}
        <ArchiveDialog
          open={archiveOpen}
          tasks={tasks.done || []}
          onClose={() => setArchiveOpen(false)}
          onDelete={handleDelete}
          onClearAll={handleClearAll}
        />

        {/* Feishu Sync Dialog */}
        <FeishuDialog
          open={feishuOpen}
          onClose={() => setFeishuOpen(false)}
          onSyncComplete={loadTasks}
        />

        {/* Auto-Task Dialog */}
        <AutoTaskDialog
          open={autoTaskOpen}
          onClose={() => setAutoTaskOpen(false)}
          onConfigChanged={(config) => {
            if (config.enabled) {
              initAutoTaskPoll(() => loadTasks())
            } else {
              stopStatusPoll()
            }
          }}
        />
      </div>
  )
}
