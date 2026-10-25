/**
 * Archive management dialog — shows completed tasks.
 */
import type { Task } from '../api'
import { formatDate } from '../theme'
import { Modal } from './ui'
import { IconDelete, IconClear } from './icons'

interface ArchiveDialogProps {
  open: boolean
  tasks: Task[]
  onClose: () => void
  onDelete: (id: string) => void
  onClearAll: () => void
}

export function ArchiveDialog({ open, tasks, onClose, onDelete, onClearAll }: ArchiveDialogProps) {
  return (
    <Modal
      open={open}
      title="归档管理 — 已完成任务"
      onClose={onClose}
      width={520}
      splitFooter
      footer={
        <>
          <button
            className="kb-btn kb-btn-danger"
            disabled={tasks.length === 0}
            onClick={() => {
              if (window.confirm('确定清空所有已完成任务？')) onClearAll()
            }}
          >
            <IconClear size={13} />
            清空全部
          </button>
          <button className="kb-btn" onClick={onClose}>
            关闭
          </button>
        </>
      }
    >
      {tasks.length === 0 ? (
        <div className="kb-empty">暂无已完成任务</div>
      ) : (
        <div className="kb-list">
          {tasks.map((task) => (
            <div className="kb-list-row" key={task.id}>
              <div className="kb-list-main">
                <div className="kb-list-title">{task.title}</div>
                <div className="kb-list-sub">
                  {task.assignee && `👤 ${task.assignee}`}
                  {task.dueDate && ` · ${formatDate(task.dueDate)}`}
                </div>
              </div>
              <button
                className="kb-icon-btn danger"
                aria-label="删除"
                onClick={() => {
                  if (window.confirm('确定删除？')) onDelete(task.id)
                }}
              >
                <IconDelete size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
