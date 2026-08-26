/**
 * @dsh-external/dsh-file-manager — client 文件管理面板（React 组件）。
 *
 * 挂到 `conversation.view` 槽（会话标签页环，Chat 之外多一个「文件」页）。
 * 交互参照 VSCode：
 * - 左侧项目文件树（懒加载展开/折叠）
 * - 右侧多标签编辑器：单击斜体预览、双击固定、编辑后自动固定
 * - 支持左右分栏（两个编辑器组）
 * - 关闭未保存标签前二次确认
 * - 记忆上次打开的标签页：再次进入「文件」页时自动恢复已打开文件
 * 数据来自 host 的 `@dsh-external/dsh-file-manager/api` 端点。
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'
import {
  createDirectory,
  deleteEntry,
  getWorkspace,
  listDir,
  readFile,
  renameEntry,
  writeFile,
} from './api'
import {
  consumePendingOpen,
  OPEN_EVENT,
  PANEL_ID,
  requestOpenInFileManager,
} from './bridge'
import {
  createEditorPane,
  EditorArea,
  type EditorPaneState,
  type OpenFileTab,
} from './editor-pane'
import type { FileReadResult, FsEntry } from './types'
import { TreeView, type RenamingState } from './tree-view'
import { CSS } from './styles'

type ClientContext = {
  slots: SlotsService
  effect(fn: () => (() => void) | void, label?: string): void
}

export const inject = ['slots', 'workspaces']

function parentRel(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i <= 0 ? '' : rel.slice(0, i)
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i === -1 ? rel : rel.slice(i + 1)
}

function joinRel(dir: string, name: string): string {
  if (!dir) return name
  return `${dir}/${name}`
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** 把绝对路径转成相对 root 的 `/` 分隔路径；不在 root 内返回 null。 */
function relativeToRoot(root: string, absPath: string): string | null {
  const r = toPosix(root).replace(/\/+$/, '')
  const a = toPosix(absPath).replace(/\/+$/, '')
  if (a.toLowerCase() === r.toLowerCase()) return ''
  if (a.toLowerCase().startsWith(r.toLowerCase() + '/')) return a.slice(r.length + 1)
  return null
}

const STORAGE_PREFIX = 'dsh-file-manager:tabs:v1'

interface PersistedTab {
  rel: string
  pin: boolean
}

interface PersistedPane {
  id: string
  tabs: PersistedTab[]
  activeRel: string | null
}

interface PersistedState {
  activePaneId: string
  panes: PersistedPane[]
}

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId || 'default'}`
}

function loadPersistedState(sessionId: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed || !Array.isArray(parsed.panes)) return null
    return parsed
  } catch {
    return null
  }
}

function serializePersisted(panes: EditorPaneState[], activePaneId: string): PersistedState {
  return {
    activePaneId,
    panes: panes.map((p) => ({
      id: p.id,
      activeRel: p.activeRel,
      tabs: p.tabs.map((t) => ({ rel: t.rel, pin: t.pin })),
    })),
  }
}

export function FileManagerPanel(props: { sessionId?: string }): ReactNode {
  const sessionId = props.sessionId ?? ''
  const sessionRef = useRef(sessionId)
  const rootRef = useRef<string | null>(null)
  const childrenMapRef = useRef<Record<string, FsEntry[]>>({})
  const expandedRef = useRef<Set<string>>(new Set())
  const pendingExternalRef = useRef<string | null>(null)
  const openExternalRef = useRef<(path: string) => Promise<void>>(async () => {})
  const panesRef = useRef<EditorPaneState[]>([createEditorPane('a')])
  const activePaneIdRef = useRef('a')

  const [root, setRoot] = useState<string | null>(null)
  const [childrenMap, setChildrenMap] = useState<Record<string, FsEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingDir, setLoadingDir] = useState<string | null>(null)
  const [activeDir, setActiveDir] = useState('')
  const [panes, setPanes] = useState<EditorPaneState[]>([createEditorPane('a')])
  const [activePaneId, setActivePaneId] = useState('a')
  const [renaming, setRenaming] = useState<RenamingState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { sessionRef.current = sessionId }, [sessionId])
  useEffect(() => { rootRef.current = root }, [root])
  useEffect(() => { childrenMapRef.current = childrenMap }, [childrenMap])
  useEffect(() => { expandedRef.current = expanded }, [expanded])
  useEffect(() => { panesRef.current = panes }, [panes])
  useEffect(() => { activePaneIdRef.current = activePaneId }, [activePaneId])

  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0]
  const selectedFile = activePane?.activeRel ?? null

  const showToast = (kind: 'ok' | 'err', text: string): void => {
    setToast({ kind, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const loadDir = async (dir: string): Promise<FsEntry[] | null> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return null
    setLoadingDir(dir)
    try {
      const entries = await listDir(currentRoot, dir, sessionRef.current)
      setChildrenMap((prev) => ({ ...prev, [dir]: entries }))
      return entries
    } catch (e) {
      setError(String((e as Error).message || e))
      return null
    } finally {
      setLoadingDir((prev) => (prev === dir ? null : prev))
    }
  }

  const updatePane = (paneId: string, updater: (p: EditorPaneState) => EditorPaneState): void => {
    setPanes((prev) => prev.map((p) => (p.id === paneId ? updater(p) : p)))
  }

  const restorePersisted = async (): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return
    const saved = loadPersistedState(sessionRef.current)
    if (!saved || saved.panes.length === 0) return

    const restoredPanes: EditorPaneState[] = saved.panes.map((p) => ({
      id: p.id,
      activeRel: p.activeRel,
      tabs: p.tabs.map((t) => ({
        rel: t.rel,
        pin: t.pin,
        content: '',
        binary: false,
        tooLarge: false,
        size: 0,
        dirty: false,
        saving: false,
      })),
    }))

    const restoredActiveId = saved.panes.some((p) => p.id === saved.activePaneId)
      ? saved.activePaneId
      : restoredPanes[0]?.id ?? 'a'

    panesRef.current = restoredPanes
    activePaneIdRef.current = restoredActiveId
    setPanes(restoredPanes)
    setActivePaneId(restoredActiveId)

    for (const pane of restoredPanes) {
      for (const tab of pane.tabs) {
        try {
          const r: FileReadResult = await readFile(currentRoot, tab.rel, sessionRef.current)
          updatePane(pane.id, (p) => ({
            ...p,
            tabs: p.tabs.map((t) => (t.rel === tab.rel ? {
              ...t,
              content: r.content ?? '',
              binary: r.binary,
              tooLarge: r.tooLarge,
              size: r.size,
            } : t)),
          }))
        } catch {
          updatePane(pane.id, (p) => {
            const tabs = p.tabs.filter((t) => t.rel !== tab.rel)
            const activeRel = p.activeRel === tab.rel ? (tabs[tabs.length - 1]?.rel ?? null) : p.activeRel
            return { ...p, tabs, activeRel }
          })
        }
      }
    }
  }

  const openFileInPane = async (paneId: string, rel: string, pin: boolean): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return
    setActivePaneId(paneId)
    setActiveDir(parentRel(rel))
    setError(null)

    const pane = panesRef.current.find((p) => p.id === paneId)
    if (!pane) return
    const existing = pane.tabs.find((t) => t.rel === rel)
    if (existing) {
      updatePane(paneId, (p) => ({
        ...p,
        activeRel: rel,
        tabs: p.tabs.map((t) => (t.rel === rel && pin ? { ...t, pin: true } : t)),
      }))
      return
    }

    // 单击非固定文件：如果没有可替换的预览位，则新建一个预览标签
    if (!pin) {
      const idx = pane.tabs.findIndex((t) => !t.pin && !t.dirty)
      if (idx !== -1) {
        setBusy('read')
        try {
          const r: FileReadResult = await readFile(currentRoot, rel, sessionRef.current)
          const tab: OpenFileTab = {
            rel,
            pin: false,
            content: r.content ?? '',
            binary: r.binary,
            tooLarge: r.tooLarge,
            size: r.size,
            dirty: false,
            saving: false,
          }
          updatePane(paneId, (p) => {
            const tabs = [...p.tabs]
            tabs[idx] = tab
            return { ...p, tabs, activeRel: rel }
          })
        } catch (e) {
          setError(String((e as Error).message || e))
        } finally {
          setBusy(null)
        }
        return
      }
    }

    setBusy('read')
    try {
      const r: FileReadResult = await readFile(currentRoot, rel, sessionRef.current)
      const tab: OpenFileTab = {
        rel,
        pin,
        content: r.content ?? '',
        binary: r.binary,
        tooLarge: r.tooLarge,
        size: r.size,
        dirty: false,
        saving: false,
      }
      updatePane(paneId, (p) => ({ ...p, tabs: [...p.tabs, tab], activeRel: rel }))
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  const openExternalPath = async (absPath: string): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) {
      pendingExternalRef.current = absPath
      return
    }
    const rel = relativeToRoot(currentRoot, absPath)
    if (rel === null) {
      showToast('err', `路径不在当前工作区：${absPath}`)
      return
    }
    if (rel === '') {
      setActiveDir('')
      return
    }

    // 逐个展开父目录（缺失的目录先懒加载）
    const parts = rel.split('/').filter(Boolean)
    const dirs: string[] = []
    let acc = ''
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      dirs.push(acc)
    }
    for (const dir of ['', ...dirs]) {
      if (!Object.prototype.hasOwnProperty.call(childrenMapRef.current, dir)) {
        await loadDir(dir)
      }
    }
    setExpanded((prev) => new Set([...prev, ...dirs]))
    await openFileInPane(activePaneIdRef.current, rel, true)
  }
  openExternalRef.current = openExternalPath

  useEffect(() => {
    void (async () => {
      try {
        const p = await getWorkspace(sessionId)
        rootRef.current = p
        setRoot(p)
        if (p) {
          await loadDir('')
          // 记忆恢复：把上次打开的标签页还原到编辑器
          await restorePersisted()
        }
        const pending = pendingExternalRef.current
        if (pending) {
          pendingExternalRef.current = null
          await openExternalPath(pending)
        }
      } catch (e) {
        setError(String((e as Error).message || e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // 记忆持久化：标签结构（文件名/固定状态/活动标签/分栏）保存到 localStorage
  useEffect(() => {
    if (!root) return
    try {
      localStorage.setItem(storageKey(sessionId), JSON.stringify(serializePersisted(panes, activePaneId)))
    } catch {
      // localStorage 不可用时静默降级
    }
  }, [panes, activePaneId, root, sessionId])

  useEffect(() => {
    const consume = (): void => {
      const path = consumePendingOpen()
      if (!path) return
      pendingExternalRef.current = path
      void openExternalRef.current(path)
    }
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { path?: string } | undefined
      const path = detail?.path ?? consumePendingOpen()
      if (detail?.path) consumePendingOpen()
      if (!path) return
      pendingExternalRef.current = path
      void openExternalRef.current(path)
    }
    consume()
    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [])

  const activateTab = (paneId: string, rel: string): void => {
    setActivePaneId(paneId)
    updatePane(paneId, (p) => ({ ...p, activeRel: rel }))
    setActiveDir(parentRel(rel))
  }

  const pinTab = (paneId: string, rel: string): void => {
    setActivePaneId(paneId)
    updatePane(paneId, (p) => ({
      ...p,
      activeRel: rel,
      tabs: p.tabs.map((t) => (t.rel === rel ? { ...t, pin: true } : t)),
    }))
  }

  const closeTab = (paneId: string, rel: string): void => {
    const pane = panesRef.current.find((p) => p.id === paneId)
    const tab = pane?.tabs.find((t) => t.rel === rel)
    if (!tab) return
    if (tab.dirty && !window.confirm(`「${basename(rel)}」有未保存修改，确定关闭？`)) return
    updatePane(paneId, (p) => {
      const tabs = p.tabs.filter((t) => t.rel !== rel)
      const activeRel = p.activeRel === rel ? (tabs[tabs.length - 1]?.rel ?? null) : p.activeRel
      return { ...p, tabs, activeRel }
    })
  }

  const changeTab = (paneId: string, rel: string, content: string): void => {
    // VSCode 行为：编辑后预览自动固定，避免被其他文件替换
    updatePane(paneId, (p) => ({
      ...p,
      activeRel: rel,
      tabs: p.tabs.map((t) => (t.rel === rel ? { ...t, content, dirty: true, pin: true } : t)),
    }))
  }

  const saveTab = async (paneId: string, rel: string): Promise<void> => {
    const currentRoot = rootRef.current
    const pane = panesRef.current.find((p) => p.id === paneId)
    const tab = pane?.tabs.find((t) => t.rel === rel)
    if (!currentRoot || !tab || !tab.dirty) return
    updatePane(paneId, (p) => ({
      ...p,
      tabs: p.tabs.map((t) => (t.rel === rel ? { ...t, saving: true } : t)),
    }))
    try {
      await writeFile(currentRoot, rel, tab.content, sessionRef.current)
      updatePane(paneId, (p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.rel === rel ? { ...t, dirty: false, saving: false } : t)),
      }))
      showToast('ok', `已保存 ${rel}`)
    } catch (e) {
      updatePane(paneId, (p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.rel === rel ? { ...t, saving: false } : t)),
      }))
      showToast('err', String((e as Error).message || e))
    }
  }

  const refreshAll = async (): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return
    setBusy('refresh')
    setError(null)
    try {
      await Promise.all(['', ...Array.from(expanded)].map((d) => loadDir(d).then(() => undefined)))
      const pane = panesRef.current.find((p) => p.id === activePaneIdRef.current)
      const tab = pane?.tabs.find((t) => t.rel === pane?.activeRel)
      if (pane && tab && !tab.dirty) {
        try {
          const r = await readFile(currentRoot, tab.rel, sessionRef.current)
          updatePane(pane.id, (p) => ({
            ...p,
            tabs: p.tabs.map((t) => (t.rel === tab.rel ? {
              ...t,
              content: r.content ?? '',
              binary: r.binary,
              tooLarge: r.tooLarge,
              size: r.size,
            } : t)),
          }))
        } catch {
          // 文件可能已被外部删除，保留现场
        }
      }
    } finally {
      setBusy(null)
    }
  }

  const toggleDir = async (rel: string): Promise<void> => {
    const next = new Set(expanded)
    if (next.has(rel)) {
      next.delete(rel)
      setExpanded(next)
      return
    }
    next.add(rel)
    setExpanded(next)
    if (!Object.prototype.hasOwnProperty.call(childrenMap, rel)) {
      await loadDir(rel)
    }
  }

  const splitEditor = (): void => {
    if (panes.length >= 2) return
    const id = `pane-${Date.now()}`
    setPanes((prev) => [...prev, createEditorPane(id)])
    setActivePaneId(id)
  }

  const closeSplitEditor = (): void => {
    const right = panes[1]
    if (!right) return
    if (right.tabs.some((t) => t.dirty) && !window.confirm('右侧分栏有未保存修改，确定关闭？')) return
    setPanes((prev) => [prev[0]])
    setActivePaneId(panes[0].id)
  }

  const createFile = async (): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return
    const input = window.prompt('新建文件（相对当前目录；可用 / 包含子目录）', activeDir ? `${activeDir}/` : '')
    if (input === null) return
    const rel = input.trim().replace(/\\/g, '/')
    if (!rel) return
    setBusy('create')
    setError(null)
    try {
      await writeFile(currentRoot, rel, '', sessionRef.current)
      const parent = parentRel(rel)
      await loadDir(parent)
      setExpanded((prev) => new Set(prev).add(parent))
      await openFileInPane(activePaneIdRef.current, rel, true)
      showToast('ok', `已创建 ${rel}`)
    } catch (e) {
      showToast('err', String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  const createDir = async (): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return
    const input = window.prompt('新建文件夹（相对当前目录；可用 / 包含子目录）', activeDir ? `${activeDir}/` : '')
    if (input === null) return
    const rel = input.trim().replace(/\\/g, '/')
    if (!rel) return
    setBusy('createDir')
    setError(null)
    try {
      await createDirectory(currentRoot, rel, sessionRef.current)
      const parent = parentRel(rel)
      await loadDir(parent)
      setExpanded((prev) => new Set(prev).add(parent))
      showToast('ok', `已创建目录 ${rel}`)
    } catch (e) {
      showToast('err', String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  const removeEntry = async (entry: FsEntry): Promise<void> => {
    const currentRoot = rootRef.current
    if (!currentRoot) return
    const what = entry.type === 'dir' ? '目录' : '文件'
    if (!window.confirm(`确定删除${what}「${entry.rel}」？此操作不可逆。`)) return
    setBusy('delete')
    setError(null)
    try {
      await deleteEntry(currentRoot, entry.rel, sessionRef.current)
      // 从所有编辑器分栏中移除已删除文件
      setPanes((prev) => prev.map((p) => {
        const tabs = p.tabs.filter((t) => t.rel !== entry.rel)
        const activeRel = p.activeRel === entry.rel ? (tabs[tabs.length - 1]?.rel ?? null) : p.activeRel
        return { ...p, tabs, activeRel }
      }))
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(entry.rel)
        return next
      })
      await loadDir(parentRel(entry.rel))
      showToast('ok', `已删除 ${entry.rel}`)
    } catch (e) {
      showToast('err', String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  const submitRename = async (rel: string, newNameRaw: string): Promise<void> => {
    if (!renaming || renaming.rel !== rel) return
    const newName = newNameRaw.trim()
    setRenaming(null)
    if (!newName || newName === basename(rel)) return
    const currentRoot = rootRef.current
    if (!currentRoot) return
    const to = joinRel(parentRel(rel), newName)
    setBusy('rename')
    setError(null)
    try {
      await renameEntry(currentRoot, rel, to, sessionRef.current)
      // 同步所有分栏里的标签路径
      setPanes((prev) => prev.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.rel === rel ? { ...t, rel: to } : t)),
        activeRel: p.activeRel === rel ? to : p.activeRel,
      })))
      await refreshAll()
      showToast('ok', `已重命名 ${basename(rel)} → ${newName}`)
    } catch (e) {
      showToast('err', String((e as Error).message || e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="dfm">
        <h2>🗂 文件</h2>
        {error && <div className="err">{error}</div>}
        {toast && (
          <div className={'toast ' + (toast.kind === 'ok' ? 'ok' : 'err')}>
            {toast.kind === 'ok' ? '✓ ' : '✕ '}{toast.text}
          </div>
        )}

        <div className="row">
          <button disabled={!root || busy === 'create'} onClick={() => void createFile()}>
            {busy === 'create' ? '创建中…' : '＋ 新建文件'}
          </button>
          <button disabled={!root || busy === 'createDir'} onClick={() => void createDir()}>
            {busy === 'createDir' ? '创建中…' : '＋ 新建文件夹'}
          </button>
          <button disabled={!root} onClick={() => void refreshAll()}>
            {busy === 'refresh' ? '刷新中…' : '↻ 刷新'}
          </button>
        </div>
        {root ? (
          <div className="cwd" title={root + (activeDir ? `/${activeDir}` : '')}>
            {root}{activeDir ? ` / ${activeDir}` : ''}
          </div>
        ) : (
          <div className="err">尚未解析到工作区。请先在 DSH 中打开一个项目目录，或通过 HTTP API 显式传 root。</div>
        )}

        {root && (
          <div className="split">
            <div className="tree-pane">
              <TreeView
                childrenMap={childrenMap}
                expanded={expanded}
                selected={selectedFile}
                renaming={renaming}
                loadingDir={loadingDir}
                onToggleDir={(rel) => void toggleDir(rel)}
                onSelectFile={(rel) => void openFileInPane(activePaneIdRef.current, rel, false)}
                onPinFile={(rel) => void openFileInPane(activePaneIdRef.current, rel, true)}
                onSelectDir={(rel) => setActiveDir(rel)}
                onRenameStart={(rel, name) => setRenaming({ rel, name })}
                onRenameCancel={() => setRenaming(null)}
                onRenameSubmit={(rel, newName) => void submitRename(rel, newName)}
                onDelete={(entry) => void removeEntry(entry)}
              />
            </div>
            <EditorArea
              panes={panes}
              activePaneId={activePaneId}
              onFocusPane={(id) => setActivePaneId(id)}
              onActivateTab={(paneId, rel) => activateTab(paneId, rel)}
              onPinTab={(paneId, rel) => pinTab(paneId, rel)}
              onCloseTab={(paneId, rel) => closeTab(paneId, rel)}
              onChange={(paneId, rel, content) => changeTab(paneId, rel, content)}
              onSave={(paneId, rel) => void saveTab(paneId, rel)}
              onSplit={splitEditor}
              onCloseSplit={closeSplitEditor}
            />
          </div>
        )}
      </div>
    </>
  )
}

/* ── 插件装配 ──────────────────────────────────────────────── */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({ name: 'conversation.view', id: PANEL_ID, label: () => '文件' }, FileManagerPanel),
  ), 'dsh-file-manager: conversation view panel')

  // 让 DSH 对话区的“打开文件”（产物 chips / 行内文件提及）优先进入文件管理器
  ctx.effect(() => {
    const workspaces = (ctx as any).workspaces as
      | { openPath?: (path: string) => Promise<void> }
      | undefined
    if (!workspaces?.openPath) return undefined
    const tagged = workspaces as any
    const TAG = '__dshFileManagerOpenPatched'
    if (tagged[TAG]) return undefined
    const original = workspaces.openPath
    try {
      tagged[TAG] = true
      tagged.openPath = (path: string) => {
        requestOpenInFileManager(String(path))
        return Promise.resolve()
      }
      return () => {
        try {
          tagged.openPath = original
        } catch {
          // 恢复失败时保持当前行为，插件卸载后不再强制干预
        }
        try {
          delete tagged[TAG]
        } catch {
          // ignore
        }
      }
    } catch {
      return undefined
    }
  }, 'dsh-file-manager: route chat file opens to file manager')
}