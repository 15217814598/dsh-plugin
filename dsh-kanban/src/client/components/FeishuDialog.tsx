/**
 * Feishu sync configuration dialog — native controls, host-themed via kanban.css.
 */
import { useState, useEffect } from 'react'
import type { FeishuConfig } from '../api'
import { kanbanApi } from '../api'
import { Modal, Field } from './ui'
import { IconCloud } from './icons'

interface FeishuDialogProps {
  open: boolean
  onClose: () => void
  onSyncComplete: () => void
}

const STORAGE_KEY = 'dsh-kanban-feishu-config'

export function FeishuDialog({ open, onClose, onSyncComplete }: FeishuDialogProps) {
  const [cfg, setCfg] = useState<FeishuConfig>({
    appId: '',
    appSecret: '',
    bitableAppToken: '',
    tableId: '',
  } as FeishuConfig)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // Prefer the server-side config (SQLite); fall back to the local copy.
    const loadLocal = () => {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try { setCfg(JSON.parse(saved)) } catch { /* ignore */ }
      }
    }
    kanbanApi
      .feishuGetConfig()
      .then((cfg) => {
        if (cancelled) return
        if (cfg) setCfg(cfg)
        else loadLocal()
      })
      .catch(() => { if (!cancelled) loadLocal() })
    return () => { cancelled = true }
  }, [open])

  const set = (key: keyof FeishuConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSaveConfig = async () => {
    try {
      // feishuSaveConfig posts to the server (SQLite) and mirrors to localStorage
      await kanbanApi.feishuSaveConfig(cfg)
      setNotice({ type: 'success', text: '配置已保存（已写入服务端，重启后仍有效）' })
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '保存失败' })
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setNotice(null)
    try {
      const result = await kanbanApi.feishuSyncFrom()
      setNotice({ type: 'success', text: result.message || '导入成功' })
      onSyncComplete()
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '导入失败' })
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setNotice(null)
    try {
      const result = await kanbanApi.feishuSyncTo()
      setNotice({ type: 'success', text: result.message || '导出成功' })
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '导出失败' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="飞书多维表格同步"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="kb-btn" onClick={handleSaveConfig}>
            保存配置
          </button>
          <span className="kb-spacer" />
          <button className="kb-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中…' : '导出到飞书'}
          </button>
          <button
            className="kb-btn kb-btn-primary"
            onClick={handleImport}
            disabled={importing}
          >
            <IconCloud size={13} />
            {importing ? '导入中…' : '从飞书导入'}
          </button>
        </>
      }
    >
      <Field label="App ID">
        <input
          className="kb-input"
          value={cfg.appId}
          onChange={set('appId')}
          placeholder="飞书应用 App ID"
        />
      </Field>
      <Field label="App Secret">
        <input
          className="kb-input"
          type="password"
          value={cfg.appSecret}
          onChange={set('appSecret')}
          placeholder="飞书应用 App Secret"
        />
      </Field>
      <Field label="Bitable App Token">
        <input
          className="kb-input"
          value={cfg.bitableAppToken}
          onChange={set('bitableAppToken')}
          placeholder="多维表格 App Token"
        />
      </Field>
      <Field label="Table ID">
        <input
          className="kb-input"
          value={cfg.tableId}
          onChange={set('tableId')}
          placeholder="数据表 ID"
        />
      </Field>
      <Field label="自动拉取间隔（分钟）">
        <input
          className="kb-input"
          type="number"
          min={0}
          max={1440}
          value={cfg.autoSyncMinutes ?? 0}
          onChange={(e) => setCfg((prev) => ({ ...prev, autoSyncMinutes: Number(e.target.value) || 0 }))}
          placeholder="0 表示关闭"
        />
      </Field>

      {notice && (
        <div
          className={notice.type === 'error' ? 'kb-error' : 'kb-hint'}
          style={notice.type === 'success' ? { color: 'var(--dsw-alias-state-success-primary, #10b981)' } : undefined}
        >
          {notice.text}
        </div>
      )}

      <div className="kb-hint">
        配置保存后会同时存入本地和服务端。导入会覆盖看板中的任务，导出会将看板任务同步到飞书表格。
        设置自动拉取间隔后（大于 0），插件会定时从飞书拉取新任务和更新（不覆盖看板侧的状态流转）；
        AI 完成任务工作时也会自动把结果推回飞书表格。
      </div>
    </Modal>
  )
}
