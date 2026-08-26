/**
 * @dsh-external/dsh-file-manager — 客户端共用类型。
 */

export interface FsEntry {
  name: string
  rel: string
  type: 'file' | 'dir'
  size: number | null
  mtimeMs: number
}

export interface FileReadResult {
  root: string
  path: string
  content: string | null
  binary: boolean
  tooLarge: boolean
  size: number
  mtimeMs: number
}