/**
 * Board theme data + the stylesheet injector.
 *
 * All surface/label colors now come from the host's --dsw-alias-* tokens (see
 * kanban.css), so the board follows the host light/dark theme automatically.
 * This file keeps only the semantic palette the board owns: column status
 * colors, priority colors, and tag/avatar helpers.
 */

/** Inject the kanban stylesheet once. Call from the client apply(). */
export function injectKanbanStyle(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('kb-style')) return
  const style = document.createElement('style')
  style.id = 'kb-style'
  style.textContent = __KB_CSS__
  document.head.appendChild(style)
}

/** Column status colors (kept as the board's own accent palette). */
export const STATUS_COLORS: Record<string, string> = {
  planned: '#9ca3af',
  todo: '#60a5fa',
  'in-progress': '#a78bfa',
  review: '#fbbf24',
  done: '#34d399',
}

/** Column definitions. */
export const COLUMNS = [
  { id: 'planned' as const, title: '待规划', color: '#9ca3af' },
  { id: 'todo' as const, title: '待办', color: '#60a5fa' },
  { id: 'in-progress' as const, title: '进行中', color: '#a78bfa' },
  { id: 'review' as const, title: '评审中', color: '#fbbf24' },
  { id: 'done' as const, title: '已完成', color: '#34d399' },
]

/** Priority config. */
export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent: { label: '紧急', color: '#ef4444' },
  high: { label: '高优', color: '#f59e0b' },
  medium: { label: '中优', color: '#3b82f6' },
  low: { label: '低优', color: '#9ca3af' },
}

/** Tag color map. */
export const TAG_COLORS: Record<string, string> = {
  bug: '#f59e0b',
  feature: '#3b82f6',
  需求: '#9ca3af',
  研究: '#06b6d4',
  技术: '#8b5cf6',
  设计: '#10b981',
  后端: '#6366f1',
  优化: '#84cc16',
  test: '#10b981',
  doc: '#9ca3af',
}

/** Get a deterministic avatar background color from a name. */
export function getAvatarColor(name: string): string {
  const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#87d068', '#108ee9', '#f5222d', '#52c41a']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

/** Format a date string as "M月D日". */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
