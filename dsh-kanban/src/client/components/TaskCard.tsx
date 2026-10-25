/**
 * Task card — pure CSS + inline SVG, follows the host theme via kanban.css.
 */
import type { Task, ExecutionEventType } from '../api'
import { PRIORITY_CONFIG, TAG_COLORS, getAvatarColor, formatDate } from '../theme'
import { openSessionInGui } from '../session-jump'
import { IconEdit, IconDelete, IconProject, IconCalendar, IconComment, IconClip, IconBolt } from './icons'

interface TaskCardProps {
  task: Task
  isExecuting?: boolean
  executionEventType?: ExecutionEventType
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onExec?: (task: Task) => void
}

const EXEC_COLORS: Record<string, string> = {
  'task:completed': '#34d399',
  'task:failed': '#ef4444',
}

/** Statuses the delivery engine accepts for a manual start */
const EXECUTABLE_STATUSES = new Set(['planned', 'todo', 'in-progress'])

export function TaskCard({ task, isExecuting, executionEventType, onEdit, onDelete, onExec }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const execColor = EXEC_COLORS[executionEventType || ''] || '#a78bfa'

  return (
    <div
      className={`kb-card${isExecuting ? ' executing' : ''}`}
      style={{ '--card-color': isExecuting ? '#a78bfa' : priority.color } as React.CSSProperties}
      draggable={!isExecuting}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={(e) => {
        ;(e.currentTarget as HTMLElement).style.opacity = '1'
      }}
      onClick={() => {
        // Tasks linked to an execution conversation jump to it instead of editing
        if (task.sessionId) {
          openSessionInGui(task.sessionId)
          return
        }
        onEdit(task)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (task.sessionId) {
            openSessionInGui(task.sessionId)
            return
          }
          onEdit(task)
        }
      }}
    >
      <div className="kb-card-actions">
        {onExec && EXECUTABLE_STATUSES.has(task.status) && (
          <button
            className="kb-icon-btn"
            aria-label="启动执行"
            title="交给 AI 执行此任务"
            onClick={(e) => { e.stopPropagation(); onExec(task) }}
          >
            <IconBolt size={13} />
          </button>
        )}
        <button
          className="kb-icon-btn"
          aria-label="编辑"
          onClick={(e) => { e.stopPropagation(); onEdit(task) }}
        >
          <IconEdit size={13} />
        </button>
        <button
          className="kb-icon-btn danger"
          aria-label="删除"
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('确定删除此任务？')) onDelete(task.id)
          }}
        >
          <IconDelete size={13} />
        </button>
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="kb-card-tags">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="kb-tag"
              style={TAG_COLORS[tag] ? { color: TAG_COLORS[tag] } : undefined}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="kb-card-meta">
        {isExecuting && (
          <span
            className={`kb-exec-dot${executionEventType === 'task:executing' || executionEventType === 'task:claimed' ? ' pulse' : ''}`}
            style={{ background: execColor }}
          />
        )}
        <span className="kb-priority" style={{ background: isExecuting ? '#a78bfa' : priority.color }}>
          {isExecuting ? '执行中' : priority.label}
        </span>
        {task.project && (
          <span className="kb-project">
            <IconProject size={11} />
            {task.project}
          </span>
        )}
      </div>

      <p className="kb-card-title">{task.title}</p>
      {task.description && <p className="kb-card-desc">{task.description}</p>}

      <div className="kb-card-foot">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {task.assignee && (
            <span
              className="kb-avatar"
              style={{ background: getAvatarColor(task.assignee) }}
              title={task.assignee}
            >
              {task.assignee.charAt(0).toUpperCase()}
            </span>
          )}
          {task.dueDate && (
            <span className="kb-meta-item">
              <IconCalendar size={11} />
              {formatDate(task.dueDate)}
            </span>
          )}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {task.comments ? (
            <span className="kb-meta-item"><IconComment size={11} />{task.comments}</span>
          ) : null}
          {task.attachments ? (
            <span className="kb-meta-item"><IconClip size={11} />{task.attachments}</span>
          ) : null}
        </span>
      </div>
    </div>
  )
}
