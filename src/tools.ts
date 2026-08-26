/**
 * @dsh-external/dsh-file-manager — 把常用文件操作注册成 DSH 工具。
 *
 * 与 HTTP 面板 API 共用同一套 files.ts 实现，模型可直接驱动：
 * file_tree / file_read / file_write / file_mkdir / file_rename / file_delete。
 * 工具默认以会话工作区为根，也可用 `path` 显式指定任意项目目录。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  createDirectory,
  deletePath,
  listTree,
  readTextFile,
  renamePath,
  writeTextFile,
} from './files.js'

type AppContext = Context & {
  logger?: { info?(...a: any[]): void; warn?(...a: any[]): void }
}

/** 工具输出：文本 → model 文本块。 */
function text(s: string): any {
  return [{ type: 'text', text: s }]
}

/** 解析项目根目录：显式 path/root 优先，否则取会话工作区 cwd。 */
function rootOf(args: any, exec: any): string {
  const explicit = typeof args.path === 'string' && args.path
    ? args.path
    : typeof args.root === 'string' && args.root
      ? args.root
      : ''
  if (explicit) return explicit
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd === 'string' && cwd) return cwd
  throw new Error('需要 path（项目目录绝对路径），或让当前会话位于某个工作区')
}

function requireRel(value: unknown, label = 'file'): string {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) throw new Error(`需要 ${label}（相对项目根目录的路径）`)
  return v
}

export function registerFileTools(ctx: AppContext): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'file_tree',
    description: '查看项目文件树：列出目录下的文件/子目录。默认只列当前目录（depth=1）；设深度可递归多层。隐藏 .git。',
    parameters: {
      path: { type: 'string', description: '可选：项目根目录绝对路径；不填默认取当前会话工作区' },
      dir: { type: 'string', description: '可选：相对项目根目录的子目录，默认根目录' },
      depth: { type: 'integer', description: '递归深度，默认 1（只列直接子项），上限 6' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { tree: { type: 'string' } },
      },
      render(_a, value: any) { return text(value.tree || '（空目录）') },
    },
    async execute(args, exec) {
      const root = rootOf(args, exec)
      const dir = typeof args.dir === 'string' ? args.dir : ''
      const depth = Number(args.depth ?? 1)
      const d = Number.isFinite(depth) ? Math.max(1, Math.min(6, Math.trunc(depth))) : 1
      const entries = await listTree(root, dir, d)
      return { tree: renderTree(entries, dir) }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'file_read',
    description: '读取项目中的文本文件内容（相对项目根目录）。二进制或超大文件不返回正文。',
    parameters: {
      path: { type: 'string', description: '可选：项目根目录绝对路径；不填默认取当前会话工作区' },
      file: { type: 'string', required: true, description: '相对项目根目录的文件路径' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          content: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          binary: { type: 'boolean' },
          tooLarge: { type: 'boolean' },
          size: { type: 'integer' },
        },
      },
      render(_a, value: any) {
        if (value.binary) return text(`[二进制文件 ${value.size} 字节，不返回正文] ${value.path}`)
        if (value.tooLarge) return text(`[文件过大 ${value.size} 字节，不返回正文] ${value.path}`)
        return text(value.content ?? '')
      },
    },
    async execute(args, exec) {
      const root = rootOf(args, exec)
      const file = requireRel(args.file, 'file')
      const r = await readTextFile(root, file)
      return {
        path: r.path,
        content: r.content,
        binary: r.binary,
        tooLarge: r.tooLarge,
        size: r.size,
      }
    },
    presentCall(args: any) {
      return { card: 'generic' as const, title: `读取 ${args.file ?? ''}` }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'file_write',
    description: '创建或覆盖项目中的文本文件（UTF-8）。父目录不存在会自动创建。',
    parameters: {
      path: { type: 'string', description: '可选：项目根目录绝对路径；不填默认取当前会话工作区' },
      file: { type: 'string', required: true, description: '相对项目根目录的文件路径' },
      content: { type: 'string', required: true, description: '完整文件内容（覆盖写入）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' }, bytes: { type: 'integer' } },
      },
      render(_a, value: any) { return text(`已写入 ${value.path}（${value.bytes} 字节）`) },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const root = rootOf(args, exec)
      const file = requireRel(args.file, 'file')
      const content = typeof args.content === 'string' ? args.content : ''
      const r = await writeTextFile(root, file, content)
      return r
    },
    presentCall(args: any) {
      return { card: 'generic' as const, title: `写入 ${args.file ?? ''}` }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'file_mkdir',
    description: '在项目中新建一个目录（父目录必须已存在）。',
    parameters: {
      path: { type: 'string', description: '可选：项目根目录绝对路径；不填默认取当前会话工作区' },
      dir: { type: 'string', required: true, description: '相对项目根目录的目录路径' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' } },
      },
      render(_a, value: any) { return text(`已创建目录 ${value.path}`) },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const root = rootOf(args, exec)
      const dir = requireRel(args.dir, 'dir')
      const r = await createDirectory(root, dir)
      return r
    },
    presentCall(args: any) {
      return { card: 'generic' as const, title: `新建目录 ${args.dir ?? ''}` }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'file_rename',
    description: '重命名或移动项目中的文件/目录（目标不存在；覆盖会被拒绝）。',
    parameters: {
      path: { type: 'string', description: '可选：项目根目录绝对路径；不填默认取当前会话工作区' },
      from: { type: 'string', required: true, description: '原相对路径' },
      to: { type: 'string', required: true, description: '新相对路径，可含子目录' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { from: { type: 'string' }, to: { type: 'string' } },
      },
      render(_a, value: any) { return text(`已重命名 ${value.from} → ${value.to}`) },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const root = rootOf(args, exec)
      const from = requireRel(args.from, 'from')
      const to = requireRel(args.to, 'to')
      const r = await renamePath(root, from, to)
      return r
    },
    presentCall(args: any) {
      return { card: 'generic' as const, title: `重命名 ${args.from ?? ''} → ${args.to ?? ''}` }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'file_delete',
    description: '删除项目中的文件或目录（目录会递归删除）。此操作不可逆，请谨慎使用。',
    parameters: {
      path: { type: 'string', description: '可选：项目根目录绝对路径；不填默认取当前会话工作区' },
      target: { type: 'string', required: true, description: '相对项目根目录的文件/目录路径' },
      file: { type: 'string', description: '兼容参数：要删除的文件路径（同 target）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' } },
      },
      render(_a, value: any) { return text(`已删除 ${value.path}`) },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const root = rootOf(args, exec)
      const target = requireRel(args.target ?? args.file, 'target')
      const r = await deletePath(root, target)
      return r
    },
    presentCall(args: any) {
      return { card: 'generic' as const, title: `删除 ${args.target ?? ''}` }
    },
  })))

  return () => disposers.forEach((d) => d())
}

function renderTree(entries: Array<{ name: string; rel: string; type: 'file' | 'dir'; children?: any[] }>, dir: string): string {
  const lines: string[] = []
  const walk = (list: Array<{ name: string; rel: string; type: 'file' | 'dir'; children?: any[] }>, prefix: string): void => {
    for (const e of list) {
      lines.push(`${prefix}${e.type === 'dir' ? '📁 ' : '📄 '}${e.name}`)
      if (e.children) walk(e.children, prefix + '  ')
    }
  }
  walk(entries, '')
  const header = dir ? `目录 ${dir}` : '项目根目录'
  return [header, ...lines].join('\n')
}