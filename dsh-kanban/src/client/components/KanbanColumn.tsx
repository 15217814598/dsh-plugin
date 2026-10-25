/**
 * Kanban column — pure CSS + inline SVG, drag-and-drop target.
 */
import { useState, useCallback, useRef } from 'react'
import type { Task, TaskStatus, ExecutionEventType } from '../api'
import { TaskCard } from './TaskCard'
import { IconPlus } from './icons'

interface KanbanColumnProps {
  id: TaskStatus
  title: string
  color: string
  tasks: Task[]
  executingTasks?: Map<string, ExecutionEventType>
  onAddTask: (status: TaskStatus) => void
  onEditTask: (task: Task) => void
  onDeleteTask: (id: string) => void
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void
  onExecTask?: (task: Task) => void
}

export function KanbanColumn({
  id,
  title,
  color,
  tasks,
  executingTasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onMoveTask,
  onExecTask,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) onMoveTask(taskId, id)
  }, [id, onMoveTask])

  return (
    <div
      className={`kb-col${isDragOver ? ' dragover' : ''}`}
      style={{ '--col-color': color } as React.CSSProperties}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="kb-col-head">
        <span className="kb-col-title">{title}</span>
        <span className="kb-count">{tasks.length}</span>
      </div>

      <div className="kb-col-body">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isExecuting={executingTasks?.has(task.id)}
            executionEventType={executingTasks?.get(task.id)}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
            onExec={onExecTask}
          />
        ))}

        {tasks.length === 0 && isDragOver && (
          <div className="kb-empty-zone">放置到此处</div>
        )}
      </div>

      <div className="kb-col-foot">
        <button className="kb-add-btn" onClick={() => onAddTask(id)}>
          <IconPlus size={13} />
          添加任务
        </button>
      </div>
    </div>
  )
}
