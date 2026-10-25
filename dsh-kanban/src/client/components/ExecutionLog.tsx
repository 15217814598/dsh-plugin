/**
 * Execution log panel — real-time task execution events via SSE.
 * Pure CSS + inline SVG, host-themed via kanban.css.
 */
import { useEffect, useRef, useState } from 'react'
import type { ExecutionEvent } from '../api'
import { subscribeExecutionEvents } from '../api'
import { IconBolt, IconCheck, IconFail, IconComment } from './icons'

interface ExecutionLogProps {
  maxEvents?: number
}

const EVENT_COLORS: Record<string, string> = {
  'task:claimed': '#a78bfa',
  'task:executing': '#60a5fa',
  'task:completed': '#34d399',
  'task:failed': '#ef4444',
  'task:comment': '#fbbf24',
}

function EventIcon({ type }: { type: string }) {
  const color = EVENT_COLORS[type] || 'var(--dsw-alias-label-tertiary, #999)'
  const style = { color }
  switch (type) {
    case 'task:claimed':
      return <span style={style}><IconBolt size={13} /></span>
    case 'task:completed':
      return <span style={style}><IconCheck size={13} /></span>
    case 'task:failed':
      return <span style={style}><IconFail size={13} /></span>
    default:
      return <span style={style}><IconComment size={13} /></span>
  }
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function ExecutionLog({ maxEvents = 50 }: ExecutionLogProps) {
  const [events, setEvents] = useState<ExecutionEvent[]>([])
  const [connected, setConnected] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sub = subscribeExecutionEvents(
      (event) => {
        setEvents((prev) => {
          const next = [...prev, event]
          return next.length > maxEvents ? next.slice(-maxEvents) : next
        })
      },
      (history) => {
        setEvents(history)
        setConnected(true)
      },
      () => {
        setConnected(false)
      },
    )
    return () => sub.unsubscribe()
  }, [maxEvents])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  return (
    <div className="kb-log">
      <div className="kb-log-head">
        <span style={{ color: '#a78bfa' }}><IconBolt size={14} /></span>
        执行日志
        <span className="kb-log-status">
          <span
            className="kb-exec-dot"
            style={{ background: connected ? '#34d399' : 'var(--dsw-alias-label-tertiary, #999)', marginRight: 4 }}
          />
          {connected ? '已连接' : '未连接'}
        </span>
      </div>

      <div className="kb-log-body" ref={scrollRef}>
        {events.length === 0 ? (
          <div className="kb-empty" style={{ margin: '8px 12px' }}>
            暂无执行事件
          </div>
        ) : (
          events.map((event) => (
            <div className="kb-log-row" key={event.id}>
              <EventIcon type={event.type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="kb-log-title" style={{ color: EVENT_COLORS[event.type] }}>
                  {event.taskTitle}
                </div>
                <div className="kb-log-msg">{event.message}</div>
              </div>
              <span className="kb-log-time">{formatTime(event.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
