/**
 * @dsh-external/dsh-file-manager — 客户端局部样式。
 * 使用 DSH 设计 token（--dsw-*），带浅色兜底值，避免依赖具体主题。
 */
export const CSS = `
.dfm{font:13px/1.6 system-ui,sans-serif;color:var(--dsw-alias-label-primary,#1f2328);padding:6px;max-width:1200px;margin:0 auto;width:100%;box-sizing:border-box}
.dfm h2{font-size:15px;margin:0 0 8px;font-weight:600}
.dfm .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.dfm button{font:inherit;padding:4px 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,#d8dee4);background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;cursor:pointer}
.dfm button:hover{border-color:var(--dsw-alias-brand-primary,#2b5fdc)}
.dfm button.primary{background:var(--dsw-alias-brand-primary,#2b5fdc);color:#fff;border-color:transparent}
.dfm button:disabled{opacity:.5;cursor:default}
.dfm .err{color:#cf222e;background:rgba(207,34,46,.08);padding:6px 9px;border-radius:7px;margin:6px 0}
.dfm .meta{color:var(--dsw-alias-label-tertiary,#6e7781);font-size:12px}
.dfm .cwd{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--dsw-alias-bg-layer-1,#f6f8fa);border:1px solid var(--dsw-alias-border-l2,#d8dee4);border-radius:6px;padding:6px 10px;margin:6px 0;word-break:break-all}
.dfm .split{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:10px;align-items:stretch;margin:8px 0}
.dfm .tree-pane{min-height:300px;height:calc(100vh - 320px);overflow:auto;border:1px solid var(--dsw-alias-border-l2,#d8dee4);border-radius:9px;background:var(--dsw-alias-bg-layer-2,#fff)}
.dfm .editor-pane{min-height:300px;height:calc(100vh - 320px);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,#d8dee4);border-radius:9px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#fff)}
.dfm .tree{min-width:max-content;padding:6px 4px}
.dfm .tree-row{display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px;cursor:pointer;white-space:nowrap}
.dfm .tree-row:hover{background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.dfm .tree-row.selected{background:var(--dsw-alias-bg-layer-3,#eaeef2)}
.dfm .tree-row .chevron{width:16px;flex:none;text-align:center;color:var(--dsw-alias-label-tertiary,#6e7781)}
.dfm .tree-row .icon{width:20px;flex:none;text-align:center}
.dfm .tree-row .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dfm .tree-row .size{color:var(--dsw-alias-label-tertiary,#6e7781);font-size:11px;margin-left:8px}
.dfm .tree-row .actions{display:flex;gap:2px;opacity:0;transition:opacity .12s}
.dfm .tree-row:hover .actions,.dfm .tree-row.renaming .actions{opacity:1}
.dfm .tree-row .actions button{border:none;background:transparent;padding:0 3px;font-size:12px;color:var(--dsw-alias-label-tertiary,#6e7781);cursor:pointer}
.dfm .tree-row .actions button:hover{color:var(--dsw-alias-brand-primary,#2b5fdc);background:var(--dsw-alias-bg-layer-3,#eaeef2)}
.dfm .tree-row .actions button.danger:hover{color:#cf222e}
.dfm .tree-row input{font:inherit;width:160px;padding:2px 6px;border-radius:5px;border:1px solid var(--dsw-alias-brand-primary,#2b5fdc);outline:none;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit}
.dfm .empty{padding:10px;color:var(--dsw-alias-label-tertiary,#6e7781);font-size:12px}
.dfm .empty.center{margin:auto;text-align:center}
.dfm .editor-head{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#d8dee4);background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.dfm .editor-head .file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dfm .editor-head .dirty{color:#9a6700;font-size:12px}
.dfm .dfm-codemirror{flex:1;min-height:0;height:100%;overflow:hidden}
.dfm .dfm-codemirror .cm-editor{height:100%;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
.dfm .dfm-codemirror .cm-scroller{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6}
.dfm .dfm-codemirror .cm-gutters{font-size:11px}
.dfm .dfm-editor-area{min-height:300px;height:calc(100vh - 320px);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,#d8dee4);border-radius:9px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#fff)}
.dfm .dfm-editor-toolbar{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,#d8dee4);background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.dfm .dfm-split-editor{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 6px 6px}
.dfm .dfm-editor-pane{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,#d8dee4);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#fff)}
.dfm .dfm-editor-pane.active{border-color:var(--dsw-alias-brand-primary,#2b5fdc)}
.dfm .dfm-tabs{display:flex;gap:2px;align-items:center;flex-wrap:nowrap;overflow-x:auto;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l2,#d8dee4);background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.dfm .dfm-tab{display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;border:1px solid transparent;cursor:pointer;white-space:nowrap;color:var(--dsw-alias-label-secondary,#57606a);max-width:190px;flex:none}
.dfm .dfm-tab:hover{background:var(--dsw-alias-bg-layer-3,#eaeef2)}
.dfm .dfm-tab.active{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-border-l2,#d8dee4);color:var(--dsw-alias-label-primary,#1f2328)}
.dfm .dfm-tab.preview{font-style:italic;color:var(--dsw-alias-label-tertiary,#6e7781)}
.dfm .dfm-tab-name{overflow:hidden;text-overflow:ellipsis}
.dfm .dfm-tab-dirty{color:#9a6700;font-size:11px}
.dfm .dfm-tab-close{border:none;background:transparent;padding:0 3px;font-size:13px;line-height:1;cursor:pointer;color:var(--dsw-alias-label-tertiary,#6e7781)}
.dfm .dfm-tab-close:hover{color:#cf222e}
.dfm .dfm-tab-placeholder{padding:3px 8px;color:var(--dsw-alias-label-tertiary,#6e7781);font-size:12px}
.dfm .dfm-editor-body{flex:1;min-height:0;display:flex;flex-direction:column}
.dfm .dfm-editor-meta{display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#d8dee4);background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.dfm .dfm-editor-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary,#57606a)}
.dfm .dfm-dirty-text{color:#9a6700;font-size:12px}
.dfm .notice{padding:24px;color:var(--dsw-alias-label-tertiary,#6e7781);text-align:center;font-size:13px}
.dfm .spinner{width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;vertical-align:-2px;margin-right:6px;animation:dfmSpin .7s linear infinite}
@keyframes dfmSpin{to{transform:rotate(360deg)}}
.dfm button.loading{opacity:.65;cursor:progress}
.dfm .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18);animation:dfmToastIn .2s ease}
.dfm .toast.ok{background:#1a7f37;color:#fff}
.dfm .toast.err{background:#cf222e;color:#fff}
@keyframes dfmToastIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@media (max-width:760px){.dfm .split{grid-template-columns:1fr}.dfm .tree-pane{height:40vh}.dfm .editor-pane,.dfm .dfm-editor-area{height:50vh}.dfm .dfm-split-editor{grid-template-columns:1fr}}
`.trim()