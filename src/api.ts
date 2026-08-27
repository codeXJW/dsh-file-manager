/**
 * @dsh-external/dsh-file-manager — host HTTP API 装配。
 *
 * 通过 `ctx.webServer` 注册 `/@dsh-external/dsh-file-manager/api` JSON 端点，
 * 浏览器端「文件」面板直接 fetch：
 *  - GET  /workspace  当前会话工作区（默认项目根）
 *  - GET  /list       某目录直系子项（树状视图懒加载）
 *  - GET  /file       读取文本/二进制元数据
 *  - POST /file       新建/覆盖文本文件
 *  - POST /directory  新建目录
 *  - POST /rename     重命名/移动
 *  - POST /delete     删除文件/目录（递归，不可逆）
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  createDirectory,
  deletePath,
  FileManagerError,
  listDirectory,
  listTree,
  readTextFile,
  renamePath,
  searchText,
  writeTextFile,
} from './files.js'

const PREFIX = '/@dsh-external/dsh-file-manager/api'

/** host webserver 服务的最小可用面（运行期存在才挂载；编译期不依赖其包）。 */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: any, res: any) => void | Promise<void>
  }): () => void
}

/** host workspace 注册表最小面：拿全部工作区（含 session→workspace 映射）。 */
interface WorkspaceLike {
  list(): Array<{ path: string; sessionIds: readonly string[] }>
}

export type ApiContext = Context & {
  webServer: WebServerLike
  workspaceRegistry: WorkspaceLike
}

function json(res: any, body: unknown, status = 200): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

function badJson(res: any, message: string, status = 400): void {
  json(res, { ok: false, error: message }, status)
}

function ok(res: any, data: unknown): void {
  json(res, { ok: true, ...(data as Record<string, unknown>) })
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let acc = ''
    req.on('data', (c: Buffer) => {
      acc += c.toString('utf8')
      if (acc.length > 8 * 1024 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(acc))
    req.on('error', reject)
  })
}

function param(url: URL, key: string): string | undefined {
  const v = url.searchParams.get(key)
  return v == null || v === '' ? undefined : v
}

export function mountFileApi(ctx: ApiContext): () => void {
  const ws = ctx.webServer

  /** 当前会话所属工作区目录；无 session 参数则取第一个工作区。 */
  function workspaceOf(session?: string): string | undefined {
    const list = ctx.workspaceRegistry.list()
    if (session) {
      const hit = list.find((w) => w.sessionIds.includes(session as any))
      if (hit) return hit.path
    }
    return list.length > 0 ? list[0].path : undefined
  }

  /** root 解析：query `root` → body `root` → 默认当前会话工作区。 */
  function readRoot(url: URL, body: Record<string, unknown> | null, session?: string): string {
    if (body && typeof body.root === 'string' && body.root) return body.root
    const q = param(url, 'root')
    if (q) return q
    const workspace = workspaceOf(session)
    if (!workspace) throw new FileManagerError('未找到可用项目根目录（?root=/abs/dir 显式指定，或让当前会话位于某工作区）')
    return workspace
  }

  const handler = async (req: any, res: any): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://x')
    const pathname = url.pathname
    const method = (req.method ?? 'GET').toUpperCase()
    const rest = pathname.slice(PREFIX.length).replace(/^\/+/, '')
    const session = param(url, 'session')

    try {
      // GET /workspace —— 当前会话工作区（默认项目根）
      if (method === 'GET' && rest === 'workspace') {
        ok(res, { path: workspaceOf(session) ?? null })
        return
      }

      // GET /list?root=&dir=&depth= —— 直系子项；depth>1 时返回递归树
      if (method === 'GET' && rest === 'list') {
        const root = readRoot(url, null, session)
        const dir = param(url, 'dir') ?? ''
        const depthRaw = Number(param(url, 'depth') ?? '1')
        const depth = Number.isFinite(depthRaw) ? Math.max(1, Math.min(6, Math.trunc(depthRaw))) : 1
        const entries = depth > 1 ? await listTree(root, dir, depth) : await listDirectory(root, dir)
        ok(res, { root, dir, entries })
        return
      }

      // GET /file?root=&file= —— 读取文件
      if (method === 'GET' && rest === 'file') {
        const root = readRoot(url, null, session)
        const file = param(url, 'file')
        if (!file) {
          badJson(res, '需要 file（相对项目根目录的文件路径）')
          return
        }
        const r = await readTextFile(root, file)
        ok(res, { root, ...r })
        return
      }

      // GET /search?root=&q=&caseSensitive=&regex=&wholeWord=&limit= —— 全局搜索
      if (method === 'GET' && rest === 'search') {
        const root = readRoot(url, null, session)
        const q = param(url, 'q') ?? ''
        const limitRaw = Number(param(url, 'limit') ?? '200')
        const r = await searchText(root, q, {
          caseSensitive: param(url, 'caseSensitive') === '1',
          regex: param(url, 'regex') === '1',
          wholeWord: param(url, 'wholeWord') === '1',
          limit: Number.isFinite(limitRaw) ? limitRaw : 200,
        })
        ok(res, { root, ...r })
        return
      }

      // 以下均为写操作，统一读 JSON body
      if (method !== 'POST') {
        badJson(res, `未知 GET 路由：${rest}`, 404)
        return
      }

      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
      } catch {
        badJson(res, '请求体需为 JSON')
        return
      }
      const root = readRoot(url, body, session)

      // POST /file —— 新建/覆盖文本文件
      if (rest === 'file') {
        const file = typeof body.file === 'string' ? body.file : ''
        const content = typeof body.content === 'string' ? body.content : ''
        if (!file) {
          badJson(res, '需要 file（相对项目根目录的文件路径）')
          return
        }
        const r = await writeTextFile(root, file, content)
        ok(res, { root, ...r })
        return
      }

      // POST /directory —— 新建目录
      if (rest === 'directory') {
        const dir = typeof body.dir === 'string' ? body.dir : ''
        if (!dir) {
          badJson(res, '需要 dir（相对项目根目录的目录路径）')
          return
        }
        const r = await createDirectory(root, dir)
        ok(res, { root, ...r })
        return
      }

      // POST /rename —— 重命名/移动
      if (rest === 'rename') {
        const from = typeof body.from === 'string' ? body.from : ''
        const to = typeof body.to === 'string' ? body.to : ''
        if (!from || !to) {
          badJson(res, '需要 from 和 to（相对项目根目录）')
          return
        }
        const r = await renamePath(root, from, to)
        ok(res, { root, ...r })
        return
      }

      // POST /delete —— 删除（目录递归，不可逆）
      if (rest === 'delete') {
        const path = typeof body.path === 'string' ? body.path : ''
        if (!path) {
          badJson(res, '需要 path（相对项目根目录的文件/目录路径）')
          return
        }
        const r = await deletePath(root, path)
        ok(res, { root, ...r })
        return
      }

      badJson(res, `unknown endpoint: /${rest}`, 404)
    } catch (e) {
      if (e instanceof FileManagerError) badJson(res, e.message, 422)
      else badJson(res, e instanceof Error ? e.message : String(e), 500)
    }
  }

  return ws.register({ kind: 'prefix', path: PREFIX, handler })
}