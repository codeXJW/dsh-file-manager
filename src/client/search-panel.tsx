/**
 * @daxu8972/dsh-file-manager — VSCode 风格全局搜索面板。
 *
 * 替换左侧文件树：输入关键字 → 调用服务端 `/search` → 按文件分组展示命中，
 * 点击命中行/文件会打开对应文件到右侧编辑器。
 */
import type { ReactNode } from 'react'
import type { SearchMatch, SearchResult } from './types'

export interface SearchPanelProps {
  query: string
  searching: boolean
  result: SearchResult | null
  onQueryChange(q: string): void
  onSearch(): void
  onOpenFile(file: string): void
  onBack(): void
}

export function SearchPanel(props: SearchPanelProps): ReactNode {
  const groups = groupMatches(props.result?.matches ?? [])

  return (
    <div className="dfm-search">
      <div className="dfm-search-input-row">
        <input
          type="text"
          placeholder="搜索关键字…"
          value={props.query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onSearch()
          }}
        />
        <button
          className="primary"
          disabled={props.searching || !props.query.trim()}
          onClick={props.onSearch}
        >
          {props.searching ? '搜索中…' : '搜索'}
        </button>
        <button onClick={props.onBack}>返回树</button>
      </div>

      {props.result && (
        <div className="dfm-search-summary">
          共 {props.result.total} 处{props.result.truncated ? '（已截断）' : ''}
        </div>
      )}

      {props.result && groups.length === 0 && (
        <div className="dfm-search-empty">未找到匹配内容</div>
      )}

      {groups.map(([file, matches]) => (
        <div key={file} className="dfm-search-file-group">
          <button
            className="dfm-search-file"
            title={file}
            onClick={() => props.onOpenFile(file)}
          >
            {file}
          </button>
          <div className="dfm-search-lines">
            {matches.map((m, i) => (
              <button
                key={`${m.line}-${m.column}-${i}`}
                className="dfm-search-line"
                title={`${m.file}:${m.line}:${m.column}`}
                onClick={() => props.onOpenFile(m.file)}
              >
                <span className="dfm-search-line-no">{m.line}:{m.column}</span>
                <span className="dfm-search-line-text">{m.text}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function groupMatches(matches: SearchMatch[]): Array<[string, SearchMatch[]]> {
  const map = new Map<string, SearchMatch[]>()
  for (const m of matches) {
    const list = map.get(m.file)
    if (list) list.push(m)
    else map.set(m.file, [m])
  }
  return Array.from(map.entries())
}