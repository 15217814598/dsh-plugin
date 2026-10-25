/**
 * Board toolbar: back button, stats, search, filters, and primary actions.
 * Pure CSS + inline SVG so it follows the host theme with no antd.
 */
import { IconBack, IconArchive, IconCloud, IconBolt, IconPlus, IconList } from './icons'

interface TaskStats {
  total: number
  active: number
  done: number
}

interface NavHeaderProps {
  onBack: () => void
  searchValue: string
  onSearchChange: (value: string) => void
  onArchive: () => void
  onFeishu: () => void
  onAutoTask: () => void
  onNewTask: () => void
  taskStats?: TaskStats
  executingCount?: number
  onToggleLog?: () => void
}

export function NavHeader({
  onBack,
  searchValue,
  onSearchChange,
  onArchive,
  onFeishu,
  onAutoTask,
  onNewTask,
  taskStats,
  executingCount = 0,
  onToggleLog,
}: NavHeaderProps) {
  return (
    <div className="kb-toolbar">
      <button className="kb-btn" onClick={onBack}>
        <IconBack />
        返回会话
      </button>

      <h1 className="kb-title">📋 任务看板</h1>

      <span className="kb-spacer" />

      {taskStats ? (
        <>
          <span className="kb-stat">共 <b>{taskStats.total}</b> 项</span>
          <span className="kb-stat">已完成 <b>{taskStats.done}</b></span>
        </>
      ) : null}
      {executingCount > 0 && (
        <span className="kb-stat" style={{ color: 'var(--dsw-alias-accent-primary, #2f7cf6)' }}>
          {executingCount} 个执行中
        </span>
      )}

      <input
        className="kb-search"
        type="search"
        placeholder="搜索任务..."
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="搜索任务"
      />

      <button className="kb-btn" onClick={onArchive}>
        <IconArchive />
        归档
      </button>
      <button className="kb-btn" onClick={onFeishu}>
        <IconCloud />
        飞书
      </button>
      <button className="kb-btn" onClick={onAutoTask}>
        <IconBolt />
        自动任务
      </button>
      {onToggleLog && (
        <button className="kb-btn" onClick={onToggleLog} title="执行日志">
          <IconList />
          日志
        </button>
      )}
      <button
        className="kb-btn kb-btn-primary"
        onClick={onNewTask}
        title="Ctrl+N"
      >
        <IconPlus />
        新建任务
      </button>
    </div>
  )
}
