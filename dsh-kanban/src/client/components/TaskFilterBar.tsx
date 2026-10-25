/**
 * Task filter bar — filter by priority, tag, assignee.
 * Pure CSS dropdown menus, no antd.
 */
import { useState, useRef, useEffect } from 'react'
import type { Task } from '../api'
import { PRIORITY_CONFIG, TAG_COLORS } from '../theme'
import { IconFilter, IconClose } from './icons'

export interface TaskFilters {
  priorities: string[]
  tags: string[]
  assignees: string[]
}

interface TaskFilterBarProps {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  tasks: Record<string, Task[]>
}

function extractOptions(tasks: Record<string, Task[]>) {
  const priorities = new Set<string>()
  const tags = new Set<string>()
  const assignees = new Set<string>()
  for (const taskList of Object.values(tasks)) {
    for (const task of taskList) {
      priorities.add(task.priority)
      task.tags?.forEach((t) => tags.add(t))
      if (task.assignee) assignees.add(task.assignee)
    }
  }
  return {
    priorities: [...priorities].sort(),
    tags: [...tags].sort(),
    assignees: [...assignees].sort(),
  }
}

function toggleFilter(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  colorMap,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  colorMap?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (options.length === 0) return null

  return (
    <div className="kb-filter" ref={ref}>
      <button
        className="kb-btn"
        aria-pressed={selected.length > 0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {selected.length > 0 && <span className="kb-badge-count">{selected.length}</span>}
      </button>
      {open && (
        <div className="kb-menu" role="menu">
          {options.map((opt) => {
            const isActive = selected.includes(opt)
            return (
              <div
                key={opt}
                className={`kb-menu-item${isActive ? ' active' : ''}`}
                role="menuitem"
                onClick={() => onToggle(opt)}
              >
                {colorMap?.[opt] && (
                  <span className="kb-menu-dot" style={{ background: colorMap[opt] }} />
                )}
                <span>{opt}</span>
                {isActive && <span className="kb-menu-check">✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function TaskFilterBar({ filters, onFiltersChange, tasks }: TaskFilterBarProps) {
  const options = extractOptions(tasks)
  const totalFilters = filters.priorities.length + filters.tags.length + filters.assignees.length

  return (
    <div className="kb-filters">
      <IconFilter size={13} />

      <FilterDropdown
        label="优先级"
        options={options.priorities}
        selected={filters.priorities}
        onToggle={(v) => onFiltersChange({ ...filters, priorities: toggleFilter(filters.priorities, v) })}
        colorMap={Object.fromEntries(Object.entries(PRIORITY_CONFIG).map(([k, v]) => [k, v.color]))}
      />
      <FilterDropdown
        label="标签"
        options={options.tags}
        selected={filters.tags}
        onToggle={(v) => onFiltersChange({ ...filters, tags: toggleFilter(filters.tags, v) })}
        colorMap={TAG_COLORS}
      />
      <FilterDropdown
        label="负责人"
        options={options.assignees}
        selected={filters.assignees}
        onToggle={(v) => onFiltersChange({ ...filters, assignees: toggleFilter(filters.assignees, v) })}
      />

      {totalFilters > 0 && (
        <button
          className="kb-btn"
          onClick={() => onFiltersChange({ priorities: [], tags: [], assignees: [] })}
        >
          <IconClose size={12} />
          清除
        </button>
      )}
    </div>
  )
}

export function applyFilters(
  tasks: Record<string, Task[]>,
  filters: TaskFilters,
): Record<string, Task[]> {
  const hasFilters = filters.priorities.length + filters.tags.length + filters.assignees.length > 0
  if (!hasFilters) return tasks

  const result: Record<string, Task[]> = {} as Record<string, Task[]>
  for (const [status, taskList] of Object.entries(tasks)) {
    result[status as keyof typeof tasks] = taskList.filter((task) => {
      if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
      if (filters.tags.length > 0 && !task.tags?.some((t) => filters.tags.includes(t))) return false
      if (filters.assignees.length > 0 && (!task.assignee || !filters.assignees.includes(task.assignee))) return false
      return true
    })
  }
  return result
}
