/**
 * @daxu8972/dsh-file-manager — 多标签 / 可分栏文件编辑器区域。
 *
 * 对齐 VSCode 行为：
 * - 单击左侧文件以“预览标签”打开（斜体），可被下一次单击替换；
 * - 双击文件/标签可固定标签（pin）；
 * - 开始编辑后预览自动固定，避免未保存内容被替换；
 * - 支持多标签页与左右双栏；
 * - 关闭脏标签前二次确认。
 */
import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'

export interface OpenFileTab {
  rel: string
  pin: boolean
  content: string
  binary: boolean
  tooLarge: boolean
  size: number
  dirty: boolean
  saving: boolean
}

export interface EditorPaneState {
  id: string
  tabs: OpenFileTab[]
  activeRel: string | null
}

export interface EditorAreaProps {
  panes: EditorPaneState[]
  activePaneId: string
  onFocusPane(paneId: string): void
  onActivateTab(paneId: string, rel: string): void
  onPinTab(paneId: string, rel: string): void
  onCloseTab(paneId: string, rel: string): void
  onChange(paneId: string, rel: string, content: string): void
  onSave(paneId: string, rel: string): void
  onSplit(): void
  onCloseSplit(): void
}

export function createEditorPane(id: string): EditorPaneState {
  return { id, tabs: [], activeRel: null }
}

function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

function languageExtensions(file: string): Extension[] {
  const ext = file.includes('.') ? file.slice(file.lastIndexOf('.') + 1).toLowerCase() : ''
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return [javascript({ jsx: ext === 'jsx', typescript: false })]
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return [javascript({ jsx: ext === 'tsx', typescript: true })]
    case 'json':
      return [json()]
    case 'md':
    case 'markdown':
      return [markdown()]
    case 'html':
    case 'htm':
      return [html()]
    case 'css':
    case 'scss':
    case 'less':
      return [css()]
    case 'py':
    case 'python':
      return [python()]
    default:
      return []
  }
}

function EditorBody({ tab, onChange, onSave }: {
  tab: OpenFileTab
  onChange(text: string): void
  onSave(): void
}): ReactNode {
  const dirtyRef = useRef(tab.dirty)
  const onSaveRef = useRef(onSave)
  dirtyRef.current = tab.dirty
  onSaveRef.current = onSave

  const saveKeymap = useMemo(
    () => keymap.of([{
      key: 'Mod-s',
      run: () => {
        if (dirtyRef.current) onSaveRef.current()
        return true
      },
    }]),
    [],
  )
  const extensions = useMemo(
    () => [...languageExtensions(tab.rel), saveKeymap],
    [tab.rel, saveKeymap],
  )
  const isDark = typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
    : false

  return (
    <div className="dfm-editor-body">
      <div className="dfm-editor-meta">
        <span className="dfm-editor-path" title={tab.rel}>{tab.rel}</span>
        {tab.dirty && <span className="dfm-dirty-text">● 未保存</span>}
        <span className="meta">{tab.size} B</span>
        {!tab.binary && !tab.tooLarge && (
          <button className="primary" disabled={!tab.dirty || tab.saving} onClick={onSave}>
            {tab.saving ? '保存中…' : '保存'}
          </button>
        )}
      </div>
      {tab.binary ? (
        <div className="notice">二进制文件不支持文本编辑</div>
      ) : tab.tooLarge ? (
        <div className="notice">文件过大（{tab.size} 字节），暂不支持在浏览器中编辑</div>
      ) : (
        <CodeMirror
          value={tab.content}
          height="100%"
          className="dfm-codemirror"
          theme={isDark ? oneDark : undefined}
          extensions={extensions}
          onChange={(val) => onChange(val)}
          style={{ height: '100%' }}
        />
      )}
    </div>
  )
}

function PaneView({ pane, isActive, ...props }: {
  pane: EditorPaneState
  isActive: boolean
  onFocusPane(paneId: string): void
  onActivateTab(paneId: string, rel: string): void
  onPinTab(paneId: string, rel: string): void
  onCloseTab(paneId: string, rel: string): void
  onChange(paneId: string, rel: string, content: string): void
  onSave(paneId: string, rel: string): void
}): ReactNode {
  const activeTab = pane.tabs.find((t) => t.rel === pane.activeRel) ?? null
  return (
    <div
      className={'dfm-editor-pane' + (isActive ? ' active' : '')}
      onClick={() => props.onFocusPane(pane.id)}
    >
      <div className="dfm-tabs">
        {pane.tabs.length === 0 && <div className="dfm-tab-placeholder">未打开文件</div>}
        {pane.tabs.map((tab) => (
          <div
            key={tab.rel}
            className={
              'dfm-tab' +
              (tab.rel === pane.activeRel ? ' active' : '') +
              (tab.pin ? '' : ' preview')
            }
            title={tab.rel}
            onClick={(e) => { e.stopPropagation(); props.onActivateTab(pane.id, tab.rel) }}
            onDoubleClick={(e) => { e.stopPropagation(); props.onPinTab(pane.id, tab.rel) }}
          >
            <span className="dfm-tab-name">{basename(tab.rel)}</span>
            {tab.dirty && <span className="dfm-tab-dirty">●</span>}
            <button
              className="dfm-tab-close"
              onClick={(e) => { e.stopPropagation(); props.onCloseTab(pane.id, tab.rel) }}
            >×</button>
          </div>
        ))}
      </div>
      {activeTab ? (
        <EditorBody
          tab={activeTab}
          onChange={(text) => props.onChange(pane.id, activeTab.rel, text)}
          onSave={() => props.onSave(pane.id, activeTab.rel)}
        />
      ) : (
        <div className="empty center" style={{ margin: 'auto' }}>← 点击左侧文件查看 / 编辑</div>
      )}
    </div>
  )
}

export function EditorArea(props: EditorAreaProps): ReactNode {
  const hasSplit = props.panes.length > 1
  return (
    <div className="dfm-editor-area">
      <div className="dfm-editor-toolbar">
        <span className="meta">编辑器</span>
        {hasSplit ? (
          <button onClick={props.onCloseSplit}>取消分栏</button>
        ) : (
          <button onClick={props.onSplit}>分栏</button>
        )}
      </div>
      {hasSplit ? (
        <div className="dfm-split-editor">
          {props.panes.map((pane) => (
            <PaneView
              key={pane.id}
              pane={pane}
              isActive={pane.id === props.activePaneId}
              onFocusPane={props.onFocusPane}
              onActivateTab={props.onActivateTab}
              onPinTab={props.onPinTab}
              onCloseTab={props.onCloseTab}
              onChange={props.onChange}
              onSave={props.onSave}
            />
          ))}
        </div>
      ) : (
        <PaneView
          pane={props.panes[0]}
          isActive
          onFocusPane={props.onFocusPane}
          onActivateTab={props.onActivateTab}
          onPinTab={props.onPinTab}
          onCloseTab={props.onCloseTab}
          onChange={props.onChange}
          onSave={props.onSave}
        />
      )}
    </div>
  )
}