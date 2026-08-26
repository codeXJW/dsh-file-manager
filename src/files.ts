/**
 * @dsh-external/dsh-file-manager — 文件系统操作封装（server 侧公共层）。
 *
 * 所有文件操作统一走这里，供 HTTP 面板 API 与模型工具共用：
 *  - 默认以「项目根目录（root）」为边界，任何相对/绝对路径都会被解析到 root 内；
 *  - 词法路径（`..`）与符号链接逃逸都会被拒绝；
 *  - 文本文件按 UTF-8 读写，常见二进制扩展名/含 NUL 字节自动按 binary 处理。
 */
import { promises as fs } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

export class FileManagerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileManagerError'
  }
}

/** 文本读取/编辑的上限（超过不返回内容，避免把超大文件拉进浏览器）。 */
export const MAX_TEXT_BYTES = 4 * 1024 * 1024

/** 常见二进制扩展名（小写，不含点）。 */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svgz',
  'pdf', 'zip', 'tar', 'gz', '7z', 'rar', 'exe', 'dll', 'so', 'dylib',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'ogg', 'webm',
  'db', 'sqlite', 'class', 'pyc', 'o', 'a', 'obj', 'bin', 'dat',
])

export interface FsEntry {
  /** 文件名/目录名（basename）。 */
  name: string
  /** 相对 root 的路径，统一 `/` 分隔；root 自身为 `''`。 */
  rel: string
  /** 条目类型。 */
  type: 'file' | 'dir'
  /** 文件大小（字节）；目录为 null。 */
  size: number | null
  /** 最后修改时间（ms epoch）。 */
  mtimeMs: number
}

export interface TreeNode extends FsEntry {
  /** 仅当 `type === 'dir'` 且递归深度允许时存在。 */
  children?: TreeNode[]
}

export interface ReadFileResult {
  path: string
  /** 文本内容；binary / tooLarge 时为 null。 */
  content: string | null
  binary: boolean
  /** 文件超过 MAX_TEXT_BYTES 且不是二进制时返回 true（内容不返回）。 */
  tooLarge: boolean
  size: number
  mtimeMs: number
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * 把 root + rel 解析为 root 内的绝对路径。
 *  - 词法上禁止 `..`/绝对路径越界；
 *  - 对已存在路径做 realpath 校验，防止符号链接把操作带出 root。
 */
async function resolveInside(root: string, rel?: string, opts: { follow?: boolean } = {}): Promise<string> {
  const rootAbs = resolve(root)
  const target = rel ? resolve(rootAbs, rel) : rootAbs
  if (!pathEqual(target, rootAbs) && !pathStartsInside(target, rootAbs)) {
    throw new FileManagerError(`路径越界：${rel} 不在项目根目录 ${root} 内`)
  }

  // 删除/重命名自身时应允许操作符号链接本身（不会跟随到外部目标）；
  // 其余读写操作要跟随 realpath，防止符号链接逃逸。
  if (opts.follow === false) return target

  // root 自身可能是符号链接/junction，以它的真实路径作为安全边界
  let rootReal = rootAbs
  try {
    rootReal = await fs.realpath(rootAbs)
  } catch {
    // root 不存在时后续操作会自然报错，这里保留词法边界
  }

  // 找最近的已存在祖先做 realpath 检查（新建文件时父目录仍会被校验）
  let existing = target
  while (true) {
    try {
      await fs.access(existing)
      break
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e
      const parent = dirname(existing)
      if (parent === existing) break
      existing = parent
    }
  }
  const real = await fs.realpath(existing)
  if (!pathEqual(real, rootReal) && !pathStartsInside(real, rootReal)) {
    throw new FileManagerError(`路径通过符号链接指向项目目录之外：${rel}`)
  }
  return target
}

/** Windows 路径大小写不敏感，统一小写比较。 */
function pathEqual(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function pathStartsInside(a: string, b: string): boolean {
  const sepCh = sep
  if (process.platform === 'win32') {
    const la = a.toLowerCase()
    const lb = b.toLowerCase()
    return pathEqual(la, lb) || la.startsWith(lb.endsWith(sepCh) ? lb : lb + sepCh)
  }
  return pathEqual(a, b) || a.startsWith(b.endsWith(sep) ? b : b + sep)
}

function looksBinary(buf: Buffer): boolean {
  if (buf.length === 0) return false
  return buf.subarray(0, Math.min(buf.length, 8000)).includes(0)
}

function isBinaryName(name: string): boolean {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return BINARY_EXTENSIONS.has(ext)
}

/** 列出 root 下某个目录的直接子项（dirs 优先，文件按名称排序）。目录不可读时返回空数组。 */
export async function listDirectory(root: string, dir = ''): Promise<FsEntry[]> {
  const abs = await resolveInside(root, dir)
  let dirents
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true })
  } catch (e: any) {
    if (e?.code === 'ENOENT') throw new FileManagerError(`目录不存在：${dir || root}`)
    if (e?.code === 'ENOTDIR') throw new FileManagerError(`不是目录：${dir || root}`)
    throw e
  }

  const entries = await Promise.all(
    dirents
      .filter((d) => d.name !== '.git')
      .map(async (d) => {
        const rel = toPosix(dir ? `${dir.replace(/\\/g, '/')}/${d.name}` : d.name)
        const target = resolve(abs, d.name)
        const type: FsEntry['type'] = d.isDirectory() ? 'dir' : 'file'
        let size: number | null = null
        let mtimeMs = 0
        try {
          const st = await fs.stat(target)
          size = type === 'file' ? st.size : null
          mtimeMs = st.mtimeMs
        } catch {
          // 无权限/瞬时消失时保留空元数据，列表不因此整体失败
        }
        return { name: d.name, rel, type, size, mtimeMs }
      }),
  )

  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

/** 递归列出 root 下目录树（depth=1 只返回直接子项，depth>=2 逐层展开）。 */
export async function listTree(root: string, dir = '', depth = 2): Promise<TreeNode[]> {
  const entries = await listDirectory(root, dir)
  if (depth <= 1) return entries
  const withChildren = await Promise.all(
    entries.map(async (e): Promise<TreeNode> => {
      if (e.type !== 'dir') return e
      try {
        const children = await listTree(root, e.rel, depth - 1)
        return { ...e, children }
      } catch {
        return e
      }
    }),
  )
  return withChildren
}

/** 读取文本文件；二进制/超大文件只返回元数据。 */
export async function readTextFile(root: string, file: string): Promise<ReadFileResult> {
  if (!file) throw new FileManagerError('需要 file（相对项目根目录的文件路径）')
  const abs = await resolveInside(root, file)
  const buf = await fs.readFile(abs)
  const st = await fs.stat(abs)
  const binary = isBinaryName(file) || looksBinary(buf)
  const tooLarge = !binary && buf.length > MAX_TEXT_BYTES
  return {
    path: toPosix(file),
    content: binary || tooLarge ? null : buf.toString('utf8'),
    binary,
    tooLarge,
    size: buf.length,
    mtimeMs: st.mtimeMs,
  }
}

/** 创建或覆盖文本文件。 */
export async function writeTextFile(root: string, file: string, content: string): Promise<{ path: string; bytes: number }> {
  if (!file) throw new FileManagerError('需要 file（相对项目根目录的文件路径）')
  const abs = await resolveInside(root, file)
  try {
    const st = await fs.stat(abs)
    if (st.isDirectory()) throw new FileManagerError(`是目录，不能写入文件：${file}`)
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e
  }
  await fs.mkdir(dirname(abs), { recursive: true })
  const data = Buffer.from(content ?? '', 'utf8')
  await fs.writeFile(abs, data, 'utf8')
  return { path: toPosix(file), bytes: data.length }
}

/** 创建目录（不存在才创建；父目录不自动递归创建，避免手滑）。 */
export async function createDirectory(root: string, dir: string): Promise<{ path: string }> {
  if (!dir) throw new FileManagerError('需要 dir（相对项目根目录的目录路径）')
  const abs = await resolveInside(root, dir)
  try {
    await fs.mkdir(abs, { recursive: false })
  } catch (e: any) {
    if (e?.code === 'EEXIST') throw new FileManagerError(`已存在：${dir}`)
    if (e?.code === 'ENOENT') throw new FileManagerError(`父目录不存在：${dir}`)
    throw e
  }
  return { path: toPosix(dir) }
}

/** 删除文件或目录（目录递归删除）。此操作不可逆。 */
export async function deletePath(root: string, rel: string): Promise<{ path: string }> {
  if (!rel || rel === '.') throw new FileManagerError('不能删除项目根目录')
  const abs = await resolveInside(root, rel, { follow: false })
  await fs.rm(abs, { recursive: true, force: false })
  return { path: toPosix(rel) }
}

/** 重命名/移动。目标已存在时拒绝覆盖。 */
export async function renamePath(root: string, from: string, to: string): Promise<{ from: string; to: string }> {
  if (!from || !to) throw new FileManagerError('需要 from 和 to（相对项目根目录）')
  const fromAbs = await resolveInside(root, from, { follow: false })
  const toAbs = await resolveInside(root, to)
  try {
    await fs.access(toAbs)
    throw new FileManagerError(`目标已存在：${to}`)
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e
  }
  await fs.mkdir(dirname(toAbs), { recursive: true })
  await fs.rename(fromAbs, toAbs)
  return { from: toPosix(from), to: toPosix(to) }
}

/** 判断 dir 是否为目录且存在。 */
export async function isDirectory(root: string, dir: string): Promise<boolean> {
  try {
    const abs = await resolveInside(root, dir)
    const st = await fs.stat(abs)
    return st.isDirectory()
  } catch {
    return false
  }
}