/**
 * GridCraft spreadsheet panel — the `sidebar.right.pane.tab` keyed slot body
 * (right-sidebar tab for the `gridcraft` kind).
 *
 * Composition: a slim toolbar (session scope, file picker, dirty state,
 * reveal) above a same-origin iframe running the official GridCraft web
 * build with `?chrome=none&host=parent`. All workbook traffic flows through
 * the postMessage bridge: the panel sends `gridcraft:open` with bytes read
 * via remote.workspaceFiles; GridCraft's own Save/Save As/Export PDF arrive
 * back as `gridcraft:save` and are written into the session workspace
 * through the plugin's host route. The tab's `keepMounted` keeps the iframe
 * (and its workbook state) alive across tab switches and sidebar collapse.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { basename as basenameOf, dirname, extname, formatBytes } from './api.ts'
import { parseSessionFileAddress } from './address.ts'
import { isInbound, sendOpen } from './bridge.ts'
import type { SessionFileTarget } from './address.ts'
import type { WorkspaceFileEntry } from './api.ts'
import type { GridcraftInbound, PendingOpen } from './bridge.ts'

/** Localized keys (shape of the zh dictionary). */
export type LocaleKey = keyof import('./locales.ts').zh

/** The slice of the seat's per-tab hook context the body reads. */
export interface TabInfoLike {
  tab: {
    /** Resource address for file tabs; an opaque id (or empty) for the guide-opened page tab. */
    contentId?: string
    /** Bumped when the same tab is navigated again (file re-opened after regeneration). */
    navigation?: { revision?: number }
    /** Tab occurrence lifetime; aborts in-flight reads when the tab closes. */
    signal?: AbortSignal
  }
}

/** Injected face + framework props the panel receives. */
export interface SpreadsheetPanelProps {
  t: (key: LocaleKey) => string
  /** Bound `hooks.sessionList` source → selector hook over SessionListState. */
  useSessionList: (selector: (state: any) => any) => any
  /** Standard kit hook from the `sidebar.right.pane.tab` seat (per-tab context). */
  useTabInfo: () => TabInfoLike
  listSpreadsheets: (sessionId: string, signal?: AbortSignal) => Promise<{ files: WorkspaceFileEntry[], truncated: boolean }>
  readFileBytes: (sessionId: string, path: string, signal?: AbortSignal) => Promise<Uint8Array>
  saveFile: (sessionId: string, path: string, bytes: Uint8Array) => Promise<{ path: string, bytes: number }>
  revealFile: (sessionId: string, path: string) => Promise<void>
  staticUrl: string
}

interface SessionRow {
  id: string
  displayTitle: string
  cwd?: string
  retainedBy?: { mainView?: number }
}

interface CurrentFile {
  sessionId: string
  path: string
  name: string
}

function hostBasename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** Keep the caller-supplied save-as name a harmless workspace-relative path. */
function sanitizeRelative(input: string): string {
  const posix = input.replace(/\\/g, '/').trim()
  const parts = posix.split('/').filter(part => part !== '' && part !== '.' && part !== '..')
  return parts.join('/')
}

/** Where a posted `gridcraft:save` name lands, given the open file. */
function resolveTargetPath(current: CurrentFile, postedName: string): string {
  const postedExt = extname(postedName)
  const currentExt = extname(current.path)
  if (postedExt === currentExt || postedExt === '') return current.path
  // Different extension (e.g. Export PDF from an .xlsx): land beside it.
  const dir = dirname(current.path)
  const clean = sanitizeRelative(postedName)
  return dir === '' ? clean : `${dir}/${clean}`
}

const SPREADSHEET_DOT_EXTS = ['.xlsx', '.xls', '.csv', '.tsv', '.ods']
function isSpreadsheetPath(path: string): boolean {
  return SPREADSHEET_DOT_EXTS.includes(extname(path))
}

export function SpreadsheetPanel(props: SpreadsheetPanelProps) {
  const { t, useSessionList, useTabInfo, listSpreadsheets, readFileBytes, saveFile, revealFile, staticUrl } = props

  // Per-tab context from the seat. Presence is fixed per mounted instance
  // (the seat always provides it), so the conditional call keeps hook order
  // stable even where the component is rendered outside the seat.
  const tabInfo = useTabInfo !== undefined ? useTabInfo() : undefined
  const tabContentId = tabInfo?.tab?.contentId
  const tabRevision = tabInfo?.tab?.navigation?.revision
  const tabSignal = tabInfo?.tab?.signal

  const sessions = (useSessionList((state: any) => state) ?? { ids: [], byId: {} }) as {
    ids: string[]
    byId: Record<string, SessionRow | undefined>
  }

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const [ready, setReady] = useState(false)
  const [staticOk, setStaticOk] = useState<boolean | null>(null)

  const [scopeChoice, setScopeChoice] = useState<string | null>(null)
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([])
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [scanHint, setScanHint] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [current, setCurrent] = useState<CurrentFile | null>(null)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveAs, setSaveAs] = useState<{ bytes: Uint8Array, name: string } | null>(null)
  const [saveAsPath, setSaveAsPath] = useState('')

  // Latest-current ref so the message listener never holds a stale closure.
  const currentRef = useRef<CurrentFile | null>(null)
  currentRef.current = current
  const saveFileRef = useRef(saveFile)
  saveFileRef.current = saveFile
  // Open requests that arrived before the app's ready message: flushed on ready.
  const pendingOpenRef = useRef<PendingOpen | null>(null)
  const readyRef = useRef(ready)
  readyRef.current = ready
  const tabSignalRef = useRef<AbortSignal | undefined>(undefined)
  tabSignalRef.current = tabSignal
  // Monotonic load sequence: stale reads (superseded or tab closed) drop out.
  const loadSeqRef = useRef(0)

  const candidateRows: SessionRow[] = useMemo(() => {
    const rows: SessionRow[] = []
    for (const id of sessions.ids ?? []) {
      const row = sessions.byId?.[id]
      if (row?.cwd) rows.push(row)
    }
    return rows
  }, [sessions])

  const mainViewId = useMemo(
    () => candidateRows.find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id,
    [candidateRows],
  )
  const scopeId = scopeChoice ?? mainViewId ?? candidateRows[0]?.id

  // The file this tab was opened for (a clicked card / mention / @file /
  // Files row); undefined on the guide-opened blank page tab.
  const target = useMemo(() => parseSessionFileAddress(tabContentId), [tabContentId])

  // True when a newer load superseded this one or the tab's lifetime ended.
  const signalGone = (seq: number) =>
    seq !== loadSeqRef.current || (tabSignalRef.current?.aborted ?? false)

  // Load the tab's file straight into the grid, through the address's own
  // session (independent of the scope selector, which is pinned to match).
  const loadTarget = useCallback(async (file: SessionFileTarget) => {
    const seq = ++loadSeqRef.current
    try {
      setScopeChoice(file.sessionId)
      const bytes = await readFileBytes(file.sessionId, file.path, tabSignalRef.current)
      if (signalGone(seq)) return
      const win = iframeRef.current?.contentWindow ?? null
      if (readyRef.current && win !== null) {
        sendOpen(win, file.name, bytes)
      } else {
        // The app's bridge drops opens that arrive before its ready message.
        pendingOpenRef.current = { name: file.name, bytes }
      }
      setCurrent({ sessionId: file.sessionId, path: file.path, name: file.name })
      setDirty(false)
      setError(null)
      setNotice(null)
    } catch (openError) {
      if (signalGone(seq)) return
      const code = String((openError as Error & { code?: string })?.code ?? '')
      setError(code.includes('too-large')
        ? t('fileTooLarge')
        : `${t('openFailed')}: ${(openError as Error)?.message ?? String(openError)}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readFileBytes])
  const loadTargetRef = useRef(loadTarget)
  loadTargetRef.current = loadTarget

  // Reload on re-navigation (revision bump): the same file re-opened after
  // regeneration refreshes in place instead of showing stale bytes.
  useEffect(() => {
    if (target === undefined || target.path === '') return
    void loadTargetRef.current(target)
  }, [target, tabRevision])

  // One static-build availability probe: drives the setup hint vs the iframe.
  useEffect(() => {
    const controller = new AbortController()
    fetch(staticUrl, { signal: controller.signal })
      .then(response => setStaticOk(response.ok))
      .catch(() => { if (!controller.signal.aborted) setStaticOk(false) })
    return () => controller.abort()
  }, [staticUrl])

  const scan = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    setScanState('scanning')
    setScanHint(null)
    try {
      const result = await listSpreadsheets(sessionId, signal)
      if (signal?.aborted) return
      setFiles(result.files)
      setScanState('done')
      if (result.truncated) setScanHint(t('listTruncated'))
    } catch (scanError) {
      if (signal?.aborted) return
      setFiles([])
      setScanState('done')
      setScanHint(`${t('scanFailed')}: ${(scanError as Error)?.message ?? String(scanError)}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSpreadsheets, t])

  // Open the picker → scan; rescan when the scope changes while open.
  useEffect(() => {
    if (!pickerOpen || !scopeId) return
    const controller = new AbortController()
    void scan(scopeId, controller.signal)
    return () => controller.abort()
  }, [pickerOpen, scopeId, scan])

  // Status notices settle on their own.
  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const handleSave = useCallback(async (postedName: string, bytes: ArrayBuffer) => {
    const u8 = new Uint8Array(bytes)
    const active = currentRef.current
    if (active !== null) {
      const target = resolveTargetPath(active, postedName)
      try {
        await saveFileRef.current(active.sessionId, target, u8)
        setDirty(false)
        setError(null)
        setNotice(`${t('saved')} · ${target} · ${formatBytes(u8.length)}`)
      } catch (saveError) {
        setError(`${t('saveFailed')}: ${(saveError as Error)?.message ?? String(saveError)}`)
      }
      return
    }
    setSaveAs({ bytes: u8, name: postedName })
    setSaveAsPath(postedName)
  }, [t])

  // The bridge: only messages from our iframe, only gridcraft: types.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!isInbound(event.data)) return
      const message = event.data as GridcraftInbound
      switch (message.type) {
        case 'gridcraft:ready':
          setReady(true)
          setError(null)
          if (pendingOpenRef.current !== null) {
            const pending = pendingOpenRef.current
            pendingOpenRef.current = null
            sendOpen(iframeRef.current?.contentWindow ?? null, pending.name, pending.bytes)
          }
          break
        case 'gridcraft:dirty':
          setDirty(message.dirty === true)
          break
        case 'gridcraft:save':
          void handleSave(message.name ?? '', message.bytes)
          break
        case 'gridcraft:failed':
          setReady(false)
          setError(`${t('loadFailed')}: ${message.error ?? ''}`)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [handleSave, t])

  const openFile = useCallback(async (entry: WorkspaceFileEntry) => {
    if (!scopeId) return
    try {
      const bytes = await readFileBytes(scopeId, entry.path)
      const win = iframeRef.current?.contentWindow ?? null
      if (ready && win !== null) {
        sendOpen(win, entry.name, bytes)
      } else {
        // The app's bridge drops opens that arrive before its ready message.
        pendingOpenRef.current = { name: entry.name, bytes }
      }
      setCurrent({ sessionId: scopeId, path: entry.path, name: entry.name })
      setDirty(false)
      setPickerOpen(false)
      setError(null)
      setNotice(null)
    } catch (openError) {
      const code = String((openError as Error & { code?: string })?.code ?? '')
      const detail = code.includes('too-large')
        ? t('fileTooLarge')
        : `${t('openFailed')}: ${(openError as Error)?.message ?? String(openError)}`
      setError(detail)
    }
  }, [scopeId, readFileBytes, ready, t])

  const confirmSaveAs = useCallback(async () => {
    if (saveAs === null || !scopeId) return
    const target = sanitizeRelative(saveAsPath)
    if (target === '' || !isSpreadsheetPath(target)) {
      setError(`${t('saveFailed')}: ${target === '' ? t('saveAsPrompt') : target}`)
      return
    }
    try {
      await saveFileRef.current(scopeId, target, saveAs.bytes)
      setCurrent({ sessionId: scopeId, path: target, name: basenameOf(target) })
      setDirty(false)
      setSaveAs(null)
      setError(null)
      setNotice(`${t('saved')} · ${target} · ${formatBytes(saveAs.bytes.length)}`)
    } catch (saveError) {
      setError(`${t('saveFailed')}: ${(saveError as Error)?.message ?? String(saveError)}`)
    }
  }, [saveAs, saveAsPath, scopeId, t])

  const startNewWorkbook = useCallback(() => {
    setCurrent(null)
    currentRef.current = null
    setDirty(false)
    setReady(false)
    setIframeKey(key => key + 1)
  }, [])

  const revealCurrent = useCallback(async () => {
    const active = currentRef.current
    if (active === null) return
    try {
      await revealFile(active.sessionId, active.path)
    } catch (revealError) {
      setError(`${t('revealFailed')}: ${(revealError as Error)?.message ?? String(revealError)}`)
    }
  }, [revealFile, t])

  const statusLine = error ?? notice
  const statusKind = error !== null ? 'error' : 'ok'

  if (staticOk === false) {
    return <div className="dsh-gc-root"><div className="dsh-gc-setup">{t('setupMissing')}</div></div>
  }

  return (
    <div className="dsh-gc-root">
      <div className="dsh-gc-toolbar">
        <label className="dsh-gc-field">
          <span className="dsh-gc-field-label">{t('sessionScope')}</span>
          <select
            className="dsh-gc-select"
            value={scopeId ?? ''}
            onChange={event => { setScopeChoice(event.target.value === '' ? null : event.target.value) }}
          >
            {candidateRows.length === 0 && <option value="">{t('noSession')}</option>}
            {candidateRows.map(row => (
              <option key={row.id} value={row.id}>
                {row.displayTitle} · {hostBasename(row.cwd ?? '')}
              </option>
            ))}
          </select>
        </label>

        <div className="dsh-gc-picker-wrap">
          <button
            type="button"
            className="dsh-gc-btn"
            disabled={scopeId === undefined}
            onClick={() => setPickerOpen(open => !open)}
            title={t('openTitle')}
          >
            {t('open')} {pickerOpen ? '▾' : '▸'}
          </button>
          {pickerOpen && (
            <div className="dsh-gc-picker" role="menu">
              <div className="dsh-gc-picker-head">
                <span>{scanState === 'scanning' ? t('scanning') : `${files.length}`}</span>
                <button type="button" className="dsh-gc-btn dsh-gc-btn-small" onClick={() => scopeId && void scan(scopeId, undefined)}>
                  {t('refresh')}
                </button>
              </div>
              {scanHint !== null && <div className="dsh-gc-picker-hint">{scanHint}</div>}
              {scanState === 'done' && files.length === 0 && (
                <div className="dsh-gc-picker-empty">{t('noFiles')}</div>
              )}
              <div className="dsh-gc-picker-list">
                {files.map(entry => (
                  <button
                    key={entry.path}
                    type="button"
                    className={`dsh-gc-picker-item${current?.path === entry.path && current?.sessionId === scopeId ? ' is-active' : ''}`}
                    onClick={() => void openFile(entry)}
                    title={entry.path}
                  >
                    <span className="dsh-gc-picker-name">{entry.name}</span>
                    <span className="dsh-gc-picker-path">{entry.path}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button type="button" className="dsh-gc-btn" onClick={startNewWorkbook} title={t('newWorkbook')}>
          {t('newWorkbook')}
        </button>

        <span className="dsh-gc-file" title={current !== null ? current.path : undefined}>
          {current !== null
            ? (
              <>
                <span className={`dsh-gc-dot${dirty ? ' is-dirty' : ''}`} />
                {current.name}
                <span className="dsh-gc-dirty-label">{dirty ? t('dirty') : ''}</span>
              </>
            )
            : <span className="dsh-gc-file-none">—</span>}
        </span>

        <span className="dsh-gc-spacer" />

        <span className="dsh-gc-hint">{t('saveHint')}</span>

        {current !== null && (
          <button type="button" className="dsh-gc-btn" onClick={() => void revealCurrent()} title={t('reveal')}>
            {t('reveal')}
          </button>
        )}
      </div>

      {saveAs !== null && (
        <div className="dsh-gc-saveas">
          <span>{t('saveAsPrompt')}</span>
          <input
            className="dsh-gc-input"
            value={saveAsPath}
            autoFocus
            onChange={event => setSaveAsPath(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void confirmSaveAs()
              if (event.key === 'Escape') setSaveAs(null)
            }}
            placeholder="book.xlsx"
          />
          <button type="button" className="dsh-gc-btn dsh-gc-btn-primary" onClick={() => void confirmSaveAs()}>
            {t('saveAsConfirm')}
          </button>
          <button type="button" className="dsh-gc-btn" onClick={() => setSaveAs(null)}>{t('saveAsCancel')}</button>
        </div>
      )}

      {statusLine !== null && (
        <button
          type="button"
          className={`dsh-gc-status dsh-gc-status-${statusKind}`}
          onClick={() => { setError(null); setNotice(null) }}
        >
          {statusLine}
        </button>
      )}

      <div className="dsh-gc-frame-wrap">
        {staticOk !== false && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            className="dsh-gc-frame"
            src={staticUrl}
            title={t('panelTitle')}
            allow="clipboard-read; clipboard-write"
          />
        )}
        {!ready && staticOk !== false && (
          <div className="dsh-gc-loading">{t('loading')}</div>
        )}
      </div>
    </div>
  )
}
