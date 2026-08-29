/**
 * @daxu8972/dsh-file-manager — 客户端 API 封装。
 */
import type { FsEntry, FileReadResult, SearchResult } from './types'

const API = '/@daxu8972/dsh-file-manager/api'

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, init)
  const j: any = await res.json().catch(() => ({}))
  if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`)
  return j as T
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export async function getWorkspace(session: string): Promise<string | null> {
  const j = await api<{ path: string | null }>(`/workspace${qs({ session })}`)
  return j.path
}

export async function listDir(root: string, dir: string, session: string): Promise<FsEntry[]> {
  const j = await api<{ entries: FsEntry[] }>(`/list${qs({ root, dir, session })}`)
  return j.entries
}

export async function readFile(root: string, file: string, session: string): Promise<FileReadResult> {
  return await api<FileReadResult>(`/file${qs({ root, file, session })}`)
}

export async function writeFile(root: string, file: string, content: string, session: string): Promise<{ bytes: number }> {
  return await api(`/file${qs({ root, session })}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, content }),
  })
}

export async function createDirectory(root: string, dir: string, session: string): Promise<void> {
  await api(`/directory${qs({ root, session })}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dir }),
  })
}

export async function renameEntry(root: string, from: string, to: string, session: string): Promise<void> {
  await api(`/rename${qs({ root, session })}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
}

export async function deleteEntry(root: string, path: string, session: string): Promise<void> {
  await api(`/delete${qs({ root, session })}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  })
}

export interface SearchParams {
  root: string
  q: string
  session?: string
  caseSensitive?: boolean
  regex?: boolean
  wholeWord?: boolean
  limit?: number
}

export async function searchFiles(params: SearchParams): Promise<SearchResult> {
  return await api<SearchResult>(`/search${qs({
    root: params.root,
    q: params.q,
    session: params.session,
    caseSensitive: params.caseSensitive ? '1' : undefined,
    regex: params.regex ? '1' : undefined,
    wholeWord: params.wholeWord ? '1' : undefined,
    limit: params.limit,
  })}`)
}