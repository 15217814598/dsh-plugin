/**
 * Small shared UI primitives for the kanban board: imperative toast, a generic
 * modal, and a switch. All styling comes from kanban.css theme tokens, so they
 * follow the host light/dark theme with no antd dependency.
 */
import { useEffect, type ReactNode, type ReactElement } from 'react'
import { IconClose } from './icons'

/* ---- toast ------------------------------------------------------------ */
let toastTimer: ReturnType<typeof setTimeout> | null = null

/** Show a transient toast at the top-center of the kanban overlay. */
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const host = document.querySelector('[data-kanban-root]') || document.body
  let el = document.getElementById('kb-toast') as HTMLElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = 'kb-toast'
    document.body.appendChild(el)
  }
  el.className = `kb-toast${kind === 'error' ? ' error' : ''}`
  el.textContent = message
  el.style.display = 'block'
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (el) el.style.display = 'none'
  }, 2400)
}

/* ---- modal ------------------------------------------------------------ */
interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  splitFooter?: boolean
  width?: number
}

export function Modal({ open, title, onClose, children, footer, splitFooter, width = 480 }: ModalProps): ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="kb-overlay" onClick={onClose}>
      <div
        className="kb-modal"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="kb-modal-head">
          <h2 className="kb-modal-title">{title}</h2>
          <button className="kb-icon-btn" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="kb-modal-body">{children}</div>
        {footer && (
          <div className={`kb-modal-foot${splitFooter ? ' split' : ''}`}>{footer}</div>
        )}
      </div>
    </div>
  )
}

/* ---- switch ----------------------------------------------------------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }): ReactElement {
  return (
    <button
      type="button"
      className="kb-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

/* ---- field ------------------------------------------------------------ */
export function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="kb-field">
      <span className="kb-label">{label}</span>
      {children}
    </label>
  )
}
