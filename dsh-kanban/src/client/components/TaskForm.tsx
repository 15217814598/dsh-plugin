/**
 * Task create/edit form — native controls, host-themed via kanban.css.
 */
import { useEffect, useState } from 'react'
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../api'
import { PRIORITY_CONFIG, COLUMNS } from '../theme'
import { Modal, Field } from './ui'

interface TaskFormProps {
  open: boolean
  mode: 'create' | 'edit'
  task?: Task | null
  defaultStatus?: TaskStatus
  projects?: string[]
  onClose: () => void
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => void
}

const COMMON_TAGS = ['bug', 'feature', '需求', '研究', '技术', '设计', '后端', '优化', 'test', 'doc']

export function TaskForm({
  open,
  mode,
  task,
  defaultStatus = 'todo',
  projects = [],
  onClose,
  onSubmit,
}: TaskFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [priority, setPriority] = useState('medium')
  const [project, setProject] = useState('')
  const [assignee, setAssignee] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (mode === 'edit' && task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setStatus(task.status)
      setPriority(task.priority)
      setProject(task.project || '')
      setAssignee(task.assignee || '')
      setTagsText((task.tags || []).join(', '))
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '')
    } else {
      setTitle('')
      setDescription('')
      setStatus(defaultStatus)
      setPriority('medium')
      setProject('')
      setAssignee('')
      setTagsText('')
      setDueDate('')
    }
  }, [open, mode, task, defaultStatus])

  const handleOk = () => {
    if (!title.trim()) {
      setError('请输入任务标题')
      return
    }
    const tags = tagsText
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    const input: any = {
      title: title.trim(),
      description: description || undefined,
      status,
      priority,
      tags,
      project: project || undefined,
      assignee: assignee || undefined,
      dueDate: dueDate || undefined,
    }
    onSubmit(input)
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? '新建任务' : '编辑任务'}
      onClose={onClose}
      footer={
        <>
          <button className="kb-btn" onClick={onClose}>取消</button>
          <button className="kb-btn kb-btn-primary" onClick={handleOk}>
            {mode === 'create' ? '创建' : '保存'}
          </button>
        </>
      }
    >
      <Field label="标题">
        <input
          className="kb-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入任务标题..."
          autoFocus
        />
      </Field>

      <Field label="描述">
        <textarea
          className="kb-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="添加任务描述..."
        />
      </Field>

      <div className="kb-form-row">
        <Field label="状态">
          <select className="kb-select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {COLUMNS.map((col) => (
              <option key={col.id} value={col.id}>{col.title}</option>
            ))}
          </select>
        </Field>
        <Field label="优先级">
          <select className="kb-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="kb-form-row">
        <Field label="项目">
          <select className="kb-select" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">无</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="负责人">
          <input
            className="kb-input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="负责人"
          />
        </Field>
      </div>

      <div className="kb-form-row">
        <Field label="标签（逗号分隔）">
          <input
            className="kb-input"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={COMMON_TAGS.join(', ')}
          />
        </Field>
        <Field label="截止日期">
          <input
            className="kb-input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </div>

      {error && <div className="kb-error">{error}</div>}
    </Modal>
  )
}
