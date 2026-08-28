/**
 * @dsh-external/dsh-file-manager — VSCode 风格文件树视图。
 *
 * 纯展示/交互组件：目录懒加载由父组件维护 `childrenMap`，这里只负责渲染
 * 展开态、选中态、行内重命名与 hover 操作（重命名 / 删除）。
 */
import type { KeyboardEvent, ReactNode } from 'react'
import type { FsEntry } from './types'

export interface RenamingState {
  rel: string
  name: string
}

export interface TreeViewProps {
  childrenMap: Record<string, FsEntry[]>
  expanded: ReadonlySet<string>
  selected: string | null
  renaming: RenamingState | null
  loadingDir: string | null
  onToggleDir(rel: string): void
  onSelectFile(rel: string): void
  onPinFile(rel: string): void
  onSelectDir(rel: string): void
  onRenameStart(rel: string, name: string): void
  onRenameCancel(): void
  onRenameSubmit(rel: string, newName: string): void
  onDelete(entry: FsEntry): void
}

function formatSize(size: number | null): string {
  if (size == null) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) return '🟨'
  if (['md', 'markdown'].includes(ext)) return '📘'
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '📄'
  if (['html', 'css', 'scss', 'less'].includes(ext)) return '🎨'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return '🖼'
  return '📄'
}

function TreeItem({ entry, depth, ...props }: {
  entry: FsEntry
  depth: number
} & TreeViewProps): ReactNode {
  const isDir = entry.type === 'dir'
  const isExpanded = props.expanded.has(entry.rel)
  const isRenaming = props.renaming?.rel === entry.rel
  const children = isDir ? props.childrenMap[entry.rel] : undefined
  const loaded = isDir ? Object.prototype.hasOwnProperty.call(props.childrenMap, entry.rel) : false
  const spinner = isDir && isExpanded && !loaded && props.loadingDir === entry.rel

  const handleRowClick = (): void => {
    if (isDir) {
      props.onToggleDir(entry.rel)
      props.onSelectDir(entry.rel)
    } else {
      props.onSelectFile(entry.rel)
    }
  }

  const handleRowDoubleClick = (): void => {
    if (!isDir) props.onPinFile(entry.rel)
  }

  const handleRenameKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') props.onRenameSubmit(entry.rel, e.currentTarget.value)
    if (e.key === 'Escape') props.onRenameCancel()
  }

  return (
    <div>
      <div
        className={'tree-row' + (entry.rel === props.selected ? ' selected' : '') + (isRenaming ? ' renaming' : '')}
        data-rel={entry.rel}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        title={entry.rel}
      >
        <span className="chevron">
          {isDir ? (isExpanded ? '▾' : '▸') : ''}
        </span>
        <span className="icon">{isDir ? '📁' : fileIcon(entry.name)}</span>
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={props.renaming?.name}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={handleRenameKey}
            onBlur={(e) => props.onRenameSubmit(entry.rel, e.currentTarget.value)}
          />
        ) : (
          <>
            <span className="name">{entry.name}</span>
            {entry.type === 'file' && <span className="size">{formatSize(entry.size)}</span>}
          </>
        )}
        {!isRenaming && (
          <span className="actions" onClick={(e) => e.stopPropagation()}>
            <button title="重命名" onClick={() => props.onRenameStart(entry.rel, entry.name)}>✎</button>
            <button className="danger" title="删除" onClick={() => props.onDelete(entry)}>🗑</button>
          </span>
        )}
        {spinner && <span className="spinner" style={{ width: 10, height: 10 }} />}
      </div>
      {isDir && isExpanded && (
        <div>
          {loaded
            ? (children && children.length ? <TreeList entries={children} depth={depth + 1} {...props} /> : <div className="empty" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>（空）</div>)
            : <div className="empty" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>加载中…</div>}
        </div>
      )}
    </div>
  )
}

function TreeList({ entries, depth, ...props }: { entries: FsEntry[]; depth: number } & TreeViewProps): ReactNode {
  return (
    <>
      {entries.map((entry) => (
        <TreeItem key={entry.rel} entry={entry} depth={depth} {...props} />
      ))}
    </>
  )
}

export function TreeView(props: TreeViewProps): ReactNode {
  const entries = props.childrenMap[''] ?? []
  if (!entries.length) return <div className="empty">（空目录 / 尚未加载）</div>
  return (
    <div className="tree">
      <TreeList entries={entries} depth={0} {...props} />
    </div>
  )
}