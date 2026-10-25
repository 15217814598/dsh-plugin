/**
 * Auto-task configuration dialog — native controls, host-themed via kanban.css.
 */
import { useState, useEffect } from 'react'
import type { AutoTaskConfig, AutoTaskDeliveryMode, AutoTaskStatus } from '../api'
import { kanbanApi } from '../api'
import { Modal, Field, Switch } from './ui'
import { IconBolt } from './icons'
import { toast } from './ui'

interface AutoTaskDialogProps {
  open: boolean
  onClose: () => void
  onConfigChanged: (config: AutoTaskConfig) => void
}

export function AutoTaskDialog({ open, onClose, onConfigChanged }: AutoTaskDialogProps) {
  const [enabled, setEnabled] = useState(false)
  const [interval, setInterval] = useState(30)
  const [deliveryMode, setDeliveryMode] = useState<AutoTaskDeliveryMode>('new-session')
  const [status, setStatus] = useState<AutoTaskStatus>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    Promise.all([
      kanbanApi.getAutoTaskConfig().catch(() => ({ enabled: false, intervalMinutes: 30 })),
      kanbanApi.getAutoTaskStatus().catch(() => ({})),
    ])
      .then(([config, statusData]) => {
        setEnabled(!!config.enabled)
        setInterval(config.intervalMinutes || 30)
        setDeliveryMode(config.deliveryMode === 'existing' ? 'existing' : 'new-session')
        setStatus(statusData)
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleSave = async () => {
    if (interval < 1 || interval > 1440) {
      setError('间隔范围 1-1440 分钟')
      return
    }
    setSaving(true)
    try {
      const config: AutoTaskConfig = { enabled, intervalMinutes: interval, deliveryMode }
      await kanbanApi.saveAutoTaskConfig(config)
      onConfigChanged(config)
      toast('自动任务配置已保存')
      onClose()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="自动任务配置"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="kb-btn" onClick={onClose}>取消</button>
          <button className="kb-btn kb-btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="kb-switch-row">
        <span className="kb-label">启用自动任务</span>
        <Switch checked={enabled} onChange={setEnabled} label="启用自动任务" />
      </div>

      <Field label="执行间隔（分钟）">
        <input
          className="kb-input"
          type="number"
          min={1}
          max={1440}
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
        />
      </Field>

      <Field label="执行方式">
        <select
          className="kb-input"
          value={deliveryMode}
          onChange={(e) => setDeliveryMode(e.target.value as AutoTaskDeliveryMode)}
        >
          <option value="new-session">每个任务新建独立会话</option>
          <option value="existing">投递到现有会话（追加轮次）</option>
        </select>
      </Field>

      {status.lastRunAt && (
        <div
          className="kb-list-row"
          style={{ alignItems: 'flex-start' }}
        >
          <span style={{ color: '#a78bfa', marginTop: 2 }}><IconBolt size={14} /></span>
          <div className="kb-list-main">
            <div className="kb-list-title">上次执行：{status.lastRunAt}</div>
            {status.lastTaskTitle && (
              <div className="kb-list-sub">任务：{status.lastTaskTitle}</div>
            )}
          </div>
        </div>
      )}

      {error && <div className="kb-error">{error}</div>}

      <div className="kb-hint">
        启用后，系统会按设定间隔自动将待办任务交给 DSH AI 执行。
        「新建独立会话」为每个任务开一条新对话，执行完自动关闭（历史可回看）；
        「投递到现有会话」把任务作为下一条消息追加到当前空闲的会话中。
      </div>
    </Modal>
  )
}
