# @dsh-external/dsh-file-manager

> DSH 外置文件管理器插件 —— 在 DSH Web 界面里像 VSCode 一样浏览、创建、编辑、重命名、删除项目文件，同时给模型提供 `file_*` 工具。

`hybrid` 形态：服务端注册文件工具（tree/read/write/mkdir/rename/delete）+ 客户端「文件」标签页。右侧编辑器基于 **CodeMirror 6**，提供行号、语法高亮、代码折叠、查找替换等轻量编辑体验。

---

## 特性

| 能力 | 服务端工具 | 可视化面板 |
|------|:---:|:---:|
| 树状显示项目文件 | `file_tree` | ✅ 懒加载树 |
| 查看文件内容 | `file_read` | ✅ CodeMirror 6 编辑器（行号/语法高亮） |
| 新建文件 | `file_write`（创建或覆盖） | ✅ 「＋ 新建文件」 |
| 编辑保存 | `file_write` | ✅ CodeMirror 6 + Ctrl/Cmd+S |
| 新建文件夹 | `file_mkdir` | ✅ 「＋ 新建文件夹」 |
| 重命名 / 移动 | `file_rename` | ✅ 行内重命名 |
| 删除 | `file_delete` | ✅ hover 删除 + 二次确认 |
| 全局搜索 | \ile_search\ | ✅ 搜索面板：按文件分组显示命中，点击可打开文件 |\n| 对话区文件跳转 | — | ✅ 点击模型回复/产物中的文件路径，优先切到「文件」页打开 |

**默认项目根目录**：取 DSH 当前打开的**工作区**目录（`ctx.workspaceRegistry`）。HTTP API 也可用 `?root=/abs/dir` 显式指定任意目录。

**安全边界**：
- 所有路径都解析到 root 内，`..` 越界和符号链接逃逸会被拒绝；
- 不能删除项目根目录；
- 二进制/超大文本文件（>4MB）不返回正文，避免浏览器被大文件拖垮；
- 写操作（`file_write` / `file_mkdir` / `file_rename` / `file_delete`）是真实磁盘操作，请谨慎使用；模型工具的写操作可配合 DSH 的 `approval` / `permission` 策略做审批。

---

## 安装使用（快速上手）

### 1. 安装插件

注入器是最快的装配方式（免重启）：

```
dev_install_package {"dir": "<本插件目录绝对路径>"}
```

重启后由 profile 的 `bundles` 列表正常装配。详见下方「安装」小节。

### 2. 打开文件面板

1. 打开 DSH Web 界面（默认 `http://127.0.0.1:3080`）
2. 进入一个会话，会话区域顶部会有一个**标签页环**（默认是「Chat」）
3. 点旁边的 **「文件」** 标签页 —— 就是可视化面板了
   > 若装完看不到文件标签，**刷新一下页面（F5）** 让浏览器加载最新 client bundle。

### 3. 使用面板

- **树状浏览**：左侧是项目文件树；点击目录箭头展开/折叠，目录内容按需懒加载（不预先扫全项目，`node_modules` 也不会拖慢首屏）
- **编辑**：点击文件 → 右侧打开文本编辑器；修改后按 `Ctrl+S`（Mac 为 `Cmd+S`）或点「保存」
- **新建文件/文件夹**：右上角按钮，输入相对当前目录的路径（如 `src/utils/helper.ts`）
- **重命名**：hover 文件/目录行 → 点 ✎ → 输入新名称 → 回车提交（也可点树外取消）
- **删除**：hover → 点 🗑 → 确认后删除（目录递归删除，不可逆）
- **刷新**：重新拉取当前展开的目录和正在编辑的文件

> 💡 对话区里模型回复或“产物”中的文件路径，点击后会**优先切到「文件」标签页**并在文件中展开/打开，不再走系统默认程序打开。

### 4. 在对话里让模型用文件工具（可选）

同一插件还注册了模型工具，你直接说：

> “看看当前项目有哪些文件”　“读取 src/index.ts”　“新建一个 README.md 并写内容”　“把 a.txt 改名为 b.txt”　“删除 temp.txt”

DSH 会用 `file_tree` / `file_read` / `file_write` / `file_mkdir` / `file_rename` / `file_delete` 执行。

---

## 安装

### 方式 A：注入器（推荐，免重启）

在 DSH 注入器环境里：

```
dev_install_package {"dir": "<本插件目录绝对路径>"}
```

`dev_install_package` 会：改 profile `package.json`（dependencies + bundles）→ 建 `node_modules` junction → `loader.create` 动态加载。重启后由 `bundles` 列表正常装配。

### 方式 B：本地 tgz 安装

```bash
npm pack
# 得到 @dsh-external-dsh-file-manager-0.1.0.tgz
```

然后作为普通依赖塞进你的 DSH profile：

```
dev_install_package {"dir": "<解压后的包目录>"}
# 或手动：把 tarball 里的 lib/ + package.json 放进 node_modules/@dsh-external/dsh-file-manager
```

### 方式 C：直接装配（重启常驻）

```powershell
dsh plugin --profile web add <本插件目录>
```

> 无论哪种方式，要求宿主 DSH 已装配 `dsh-tools`（工具）、`dsh-host-webserver` + `dsh-workspace`（面板 HTTP API）。这些是 DSH 自带插件，缺任意面板能力会优雅降级为「仅工具」。

---

## 开发 / 构建

使用已安装的 `@deepseek-ai/dsh` 作为类型依赖来源（无需 DSH 源码 checkout）：

```bash
npm install --legacy-peer-deps
npm run build          # server src/ → lib/
npm run build:client   # browser client → lib/client.js
```

> `scripts/build.cjs` 会从常见全局安装位置探测 `@deepseek-ai/dsh`，并把 `@deepseek-ai/dsh-tools`、`@deepseek-ai/cordis` 等以 junction 链到本地 `node_modules` 供编译。也可用 `--pkg <dsh-install-dir>` 或 `DSH_PKG` 显式指定。

构建产物：

```
lib/index.js       # 插件入口（apply）
lib/api.js         # HTTP /@dsh-external/dsh-file-manager/api
lib/tools.js       # ctx.tools.register 文件工具
lib/files.js       # 文件系统封装（CRUD + 树）
lib/client.js      # 浏览器「文件」面板
```

---

## 体系结构

```
浏览器（client.js）
  └─ 文件标签页（conversation.view 槽）──fetch──▶ HTTP JSON API
                                                    │
DSH host（apply）
  ├─ ctx.webServer.register('/@dsh-external/dsh-file-manager/api')
  │     ├─ GET  /workspace   当前会话工作区
  │     ├─ GET  /list        目录直系子项（?depth=N 可递归）
  │     ├─ GET  /file        读取文件
  │     └─ POST /file|directory|rename|delete
  └─ ctx.tools.register(...) file_tree/file_read/file_write/file_mkdir/file_rename/file_delete
```

---

## License

MIT © 2026 @dsh-external