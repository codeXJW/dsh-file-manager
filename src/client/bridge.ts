/**
 * @daxu8972/dsh-file-manager — 对话区文件地址 → 文件管理器桥接。
 *
 * DSH 的对话区打开文件默认走 `workspaces.openPath`（用系统默认程序打开）。
 * 本桥接把那条路径改为：切到「文件」标签页，并让文件管理面板打开对应文件。
 *
 * 由于面板可能尚未挂载，先写入 `pendingPath` 再切标签；面板挂载时消费。
 */

export const PANEL_ID = '@daxu8972/dsh-file-manager-panel'
export const PANEL_LABEL = '文件'
export const OPEN_EVENT = 'dsh-file-manager:open'

/** 等待文件管理面板消费的绝对路径。 */
let pendingPath: string | null = null

/** 从对话区请求用文件管理器打开一个绝对路径。 */
export function requestOpenInFileManager(path: string): void {
  pendingPath = path
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { path } }))
  activateFileManagerTab()
}

/** 点击会话头部的「文件」标签页，切换到文件管理视图。 */
function activateFileManagerTab(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLElement>('button[role="tab"]'))
  const tab = tabs.find((el) => el.textContent?.trim() === PANEL_LABEL && el.offsetParent !== null)
  tab?.click()
}

/** 消费挂载前收到的待打开路径（面板挂载时调用）。 */
export function consumePendingOpen(): string | null {
  const path = pendingPath
  pendingPath = null
  return path
}