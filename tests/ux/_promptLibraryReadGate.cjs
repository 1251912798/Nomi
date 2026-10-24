// 走查专用（tests/ux/library-layout.walk.mjs，LibraryStates 板的「读取失败」「加载」两态）：主进程「读提示词库」那一路
// 先失败；走查在主进程里调 globalThis.__nomiWalkPromptLibraryMode('hold') 后改成「挂住不回」（渲染层点「重试」就停在加载态），
// 再调 __nomiWalkPromptLibraryMode('pass') 放行——挂住的那次和之后的每一次都照常读到。
//
// 为什么在主进程入口拦：产品里内置与公开库是同一次读取，公开库离线时主进程用磁盘缓存 / 打包快照兜底，正常永远读得到；
// 只有整次 IPC 失败才会出这一屏，走查造不出真断网之外的入口，只能在 ipcMain.handle 登记那一刻把这一路换掉。
// 由启动器的 mainRequire 以 `-r` 在 App 代码之前加载；只给走查用，不进产品构建。
'use strict'
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 走查仪表：mainRequire 以 -r 在主进程入口之前按 CommonJS 加载，拿 ipcMain 只有 require 这一条路
const { ipcMain } = require('electron')

const CHANNEL = 'nomi:prompt-library:list'
let mode = 'fail'
let release = null
let held = null
globalThis.__nomiWalkPromptLibraryMode = (next) => {
  mode = next
  if (next === 'pass' && release) {
    release()
    release = null
    held = null
  }
}

const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => handle(channel, channel !== CHANNEL ? handler : async (...args) => {
  if (mode === 'fail') return { ok: false, prompts: [], error: 'walk: prompt library read failed (simulated)' }
  if (mode === 'hold') {
    held ??= new Promise((resolve) => { release = resolve })
    await held
  }
  return handler(...args)
})
