/**
 * @dsh-external/dsh-file-manager — DSH 外置文件管理器插件（hybrid）。
 *
 * 服务端装配两块能力，共用同一套 files.ts：
 *  1. `ctx.tools.register` → 把 file_tree/file_read/file_write/file_mkdir/
 *     file_rename/file_delete 注册成模型可见工具；
 *  2. `ctx.webServer` → HTTP JSON API（`/@dsh-external/dsh-file-manager/api`），
 *     供浏览器端「文件」面板 fetch（树状浏览 + 编辑/新建/重命名/删除）。
 *
 * 客户端（src/client/）把面板挂进 `conversation.view` 槽，变成一个
 * 「文件」标签页，交互参照 VSCode 文件资源管理器 + 编辑器。
 */
import type { Context } from '@deepseek-ai/cordis'
import { mountFileApi } from './api.js'
import { registerFileTools } from './tools.js'

export const name = '@dsh-external/dsh-file-manager'

// 服务端依赖：
//   - tools：工具注册（@deepseek-ai/dsh-tools）
//   - webServer / workspaceRegistry：HTTP 面板 API 与默认项目根解析（DSH 自带）
export const inject = ['tools', 'webServer', 'workspaceRegistry']

export function apply(ctx: Context): void {
  // 1) 注册文件工具（模型可直接驱动）
  const toolsDispose = registerFileTools(ctx as any)

  // 2) 注册 HTTP 面板 API
  const apiDispose = mountFileApi(ctx as any)

  ctx.logger?.info?.('[dsh-file-manager] 已装配：文件工具 + 文件管理面板 API')

  // 卸载清理
  ctx.on('dispose' as any, () => {
    try { toolsDispose() } catch { /* ignore */ }
    try { apiDispose() } catch { /* ignore */ }
  })
}