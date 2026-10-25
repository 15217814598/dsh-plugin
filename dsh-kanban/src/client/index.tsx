/**
 * Browser entry for dsh-kanban plugin — runs inside the DSH web GUI.
 * Mounts the kanban board button in the sidebar and renders the board.
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { KanbanBoard } from './components/KanbanBoard'
import { setClientContext } from './session-jump'
import { injectKanbanStyle } from './theme'

const PLUGIN_ID = 'dsh-kanban'
let kanbanRoot: any = null
let kanbanContainer: HTMLElement | null = null
/** Document-level capture listener that returns to the session on sidebar clicks while the board is open */
let sidebarNavCloser: ((e: MouseEvent) => void) | null = null

/** Close the kanban page */
function closeKanbanPage(): void {
  if (kanbanRoot) {
    kanbanRoot.unmount()
    kanbanRoot = null
  }
  if (kanbanContainer) {
    kanbanContainer.remove()
    kanbanContainer = null
  }
  if (sidebarNavCloser) {
    document.removeEventListener('click', sidebarNavCloser, true)
    sidebarNavCloser = null
  }
  setMenuActive(false)
}

/** Find the sidebar column element by walking up from the "新会话" button */
function findSidebarElement(): HTMLElement | null {
  const buttons = document.querySelectorAll('button')
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || ''
    if (text.includes('新会话') || text === 'New Session') {
      let el: HTMLElement | null = btn.parentElement
      while (el && el !== document.body) {
        const w = el.offsetWidth
        if (w > 150 && w < 400 && el.offsetHeight > 300) {
          return el
        }
        el = el.parentElement
      }
      return null
    }
  }
  return null
}

/** Detect sidebar width by finding the "新会话" button's parent sidebar */
function getSidebarWidth(): number {
  return findSidebarElement()?.offsetWidth ?? 260
}

/**
 * Resolve the host titlebar clearance on Windows.
 * The desktop shell sets `data-windows-titlebar` on <html> and defines
 * `--dsh-windows-titlebar-height` (see the frame's padding-top and the
 * schedule overlay's padding-top pattern). The strip is an
 * `-webkit-app-region: drag` region — anything rendered inside it is
 * unreachable for clicks, so overlays must start below it.
 */
function getTitlebarHeight(): number {
  try {
    if (!document.documentElement.hasAttribute('data-windows-titlebar')) return 0
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height')
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 40
  } catch {
    return 0
  }
}

/** Open the kanban page as an overlay covering the content area (sidebar stays visible) */
function openKanbanPage(): void {
  if (kanbanContainer) return

  console.log('[dsh-kanban] Opening kanban page...')

  const sidebarWidth = getSidebarWidth()
  const titlebarHeight = getTitlebarHeight()
  console.log('[dsh-kanban] Sidebar width:', sidebarWidth, 'titlebar:', titlebarHeight)

  kanbanContainer = document.createElement('div')
  kanbanContainer.setAttribute('data-kanban-root', '')
  // top is offset below the Windows titlebar drag strip so the toolbar row
  // sits in the content area and stays clickable.
  kanbanContainer.style.cssText = `position:fixed;top:${titlebarHeight}px;left:${sidebarWidth}px;right:0;bottom:0;z-index:9999;overflow:hidden;display:flex;flex-direction:column;`
  document.body.appendChild(kanbanContainer)

  try {
    kanbanRoot = createRoot(kanbanContainer)
    kanbanRoot.render(createElement(KanbanBoard, { onClose: closeKanbanPage }))
    console.log('[dsh-kanban] React render initiated')
  } catch (err) {
    console.error('[dsh-kanban] Failed to render kanban:', err)
    kanbanContainer.innerHTML = '<div style="padding:40px;color:#ff4d4f;font-size:16px;"><h3>看板加载失败</h3><pre>' + String(err) + '</pre></div>'
    return
  }

  setMenuActive(true)

  // While the board covers the content area, any navigation click in the
  // sidebar (session/project rows, 新会话, panel entries…) must return to the
  // conversation instead of looking dead behind the overlay. Capture phase so
  // it runs before the sidebar's own handlers; we never stop the click, so
  // DSH still performs the navigation.
  sidebarNavCloser = (e: MouseEvent) => {
    if (!kanbanContainer) return
    const target = e.target as HTMLElement | null
    if (!target || typeof target.closest !== 'function') return
    // clicks on the board itself, or on the kanban menu toggle, are ours
    if (kanbanContainer.contains(target)) return
    if (target.closest(`[${PLUGIN_ID}-menu]`)) return
    const sidebar = findSidebarElement()
    const inSidebar = (sidebar !== null && sidebar.contains(target))
      || target.closest('[role="treeitem"]') !== null
      || target.closest('nav[aria-label]') !== null
    if (inSidebar) {
      console.log('[dsh-kanban] Sidebar navigation while open — returning to session')
      closeKanbanPage()
    }
  }
  document.addEventListener('click', sidebarNavCloser, true)
}

/** 「自动化任务」面板条目的中英文标签（dsh-client-ui-schedule 的 sidebar.panellist 行） */
const AUTOMATION_PANEL_LABELS = ['自动化任务', 'Automation tasks']

/** 在侧栏容器内查找「自动化任务」面板按钮（aria-label 优先，可见文本兜底） */
function findAutomationPanelButton(sidebar: Element): HTMLElement | null {
  for (const label of AUTOMATION_PANEL_LABELS) {
    const btn = sidebar.querySelector<HTMLElement>(`button[aria-label="${label}"]`)
    if (btn) return btn
  }
  for (const btn of sidebar.querySelectorAll<HTMLElement>('button')) {
    const text = btn.textContent?.trim() || ''
    if (AUTOMATION_PANEL_LABELS.includes(text)) return btn
  }
  return null
}

/**
 * Thin-stroke kanban glyph in the host panel-icon style (currentColor line
 * art, 16px) so the entry matches 插件 / 自动化任务 instead of an emoji.
 */
function createMenuGlyph(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  const attrs: Record<string, string> = {
    width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'aria-hidden': 'true',
  }
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v)
  svg.style.flexShrink = '0'
  // three kanban columns of decreasing height
  const cols: Array<[number, number, number, number]> = [
    [3.5, 5, 5, 14],
    [10.5, 5, 4, 10],
    [16.5, 5, 4, 7],
  ]
  for (const [x, y, w, h] of cols) {
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('x', String(x))
    rect.setAttribute('y', String(y))
    rect.setAttribute('width', String(w))
    rect.setAttribute('height', String(h))
    rect.setAttribute('rx', '1')
    svg.appendChild(rect)
  }
  return svg
}

/** Toggle the entry's active (board-open) highlight, host panel style. */
function setMenuActive(active: boolean): void {
  const menuItem = document.querySelector(`[${PLUGIN_ID}-menu]`) as HTMLElement | null
  if (!menuItem) return
  if (active) {
    menuItem.dataset.active = '1'
    menuItem.style.background = 'var(--dsw-alias-interactive-bg-hover)'
  } else {
    delete menuItem.dataset.active
    menuItem.style.background = 'transparent'
  }
}

/** Mount the kanban menu item in the DSH sidebar, below the 自动化任务 entry */
function mountMenuItem(): void {
  const tryMount = (): boolean => {
    const buttons = document.querySelectorAll('button')
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || ''
      if (text.includes('新会话') || text === 'New Session') {
        if (document.querySelector(`[${PLUGIN_ID}-menu]`)) return true

        // Mirror the host PanelRow metrics exactly (dsh-client-ui-sidebar):
        // box-sizing:border-box + min-height:36px + padding:7px 8px +
        // line-height:22px + gap:8px + margin:0 2px + radius --dsw-radius-md.
        // Without border-box the min-height becomes a content height and the
        // row grows to ~50px; the host row is 36px.
        const menuItem = document.createElement('div')
        menuItem.setAttribute(`${PLUGIN_ID}-menu`, '')
        menuItem.tabIndex = 0
        menuItem.role = 'button'
        menuItem.style.cssText = [
          'display:flex', 'align-items:center', 'gap:8px',
          'box-sizing:border-box',
          'min-height:36px', 'margin:0 2px', 'padding:7px 8px',
          'border-radius:var(--dsw-radius-md, 6px)',
          'cursor:pointer', 'background:transparent', 'border:none',
          'font:inherit', 'font-size:14px', 'line-height:22px', 'text-align:left',
          'color:var(--dsw-alias-label-primary)',
          'transition:background 0.15s', 'user-select:none',
        ].join(';')
        const icon = createMenuGlyph()
        const label = document.createElement('span')
        label.textContent = '任务看板'
        label.style.cssText = 'text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden'
        menuItem.append(icon, label)

        menuItem.addEventListener('click', () => {
          console.log('[dsh-kanban] Menu clicked')
          // toggle: close the board when it is already open
          if (kanbanContainer) closeKanbanPage()
          else openKanbanPage()
        })
        menuItem.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (kanbanContainer) closeKanbanPage()
            else openKanbanPage()
          }
        })
        menuItem.addEventListener('mouseenter', () => {
          menuItem.style.background = 'var(--dsw-alias-interactive-bg-hover)'
        })
        menuItem.addEventListener('mouseleave', () => {
          // keep the highlight while the board is open (host active-panel style)
          menuItem.style.background = menuItem.dataset.active === '1'
            ? 'var(--dsw-alias-interactive-bg-hover)'
            : 'transparent'
        })

        // 定位侧栏容器（复用宽度启发式）
        let sidebar: Element | null = btn.parentElement
        while (sidebar && sidebar !== document.body) {
          const w = (sidebar as HTMLElement).offsetWidth
          if (w > 150 && w < 400 && (sidebar as HTMLElement).offsetHeight > 300) break
          sidebar = sidebar.parentElement
        }
        if (sidebar === document.body) sidebar = null

        // 优先插到「自动化任务」面板条目正下方；找不到时回退到「新会话」按钮上方（原行为）
        const panelBtn = sidebar ? findAutomationPanelButton(sidebar) : null
        if (panelBtn?.parentElement) {
          panelBtn.parentElement.insertBefore(menuItem, panelBtn.nextSibling)
          console.log('[dsh-kanban] Menu item mounted below automation panel entry')
        } else {
          btn.parentElement?.insertBefore(menuItem, btn)
          console.log('[dsh-kanban] Menu item mounted (fallback: above new-session button)')
        }
        return true
      }
    }
    return false
  }

  if (tryMount()) return

  const observer = new MutationObserver(() => {
    if (tryMount()) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  const delays = [300, 800, 1500, 3000]
  delays.forEach((ms) => {
    setTimeout(() => { if (tryMount()) observer.disconnect() }, ms)
  })

  setTimeout(() => observer.disconnect(), 10000)
}

/**
 * Plugin client-side entry point. The host passes the client cordis context,
 * which the session-jump helper uses to reach the GUI's uiWorkspace service.
 */
export function apply(ctx: any): void {
  setClientContext(ctx)
  // The session-jump helper closes the board after revealing a conversation
  window.addEventListener('dsh-kanban:close', closeKanbanPage)
  injectKanbanStyle()
  console.log('[dsh-kanban] Client plugin loading...')
  mountMenuItem()
}
