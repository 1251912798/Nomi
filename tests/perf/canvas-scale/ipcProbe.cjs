// 性能诊断仪表（mainRequire 注入，主进程入口之前加载）：给 ipcMain 的每个处理函数计时，按频道记次数和耗时。
// 用途：canvas-scale-bench --diag-out 时回答「点一下卡，主进程被叫了几次、同步 IPC 堵了渲染线程多久」。
// 只包处理函数、不改返回值和异常；不进产品构建（只有量具经 launchNomiApp({ mainRequire }) 挂上）。
// ipcMain.on 的处理函数记成 on：其中 registerSyncIpc 注册的（electron/main.ts）是 sendSync，渲染线程在这段时间里停着等。
'use strict'
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- 量具经 mainRequire 注入、在主进程入口之前以 CommonJS 加载，只能用 require */
const { ipcMain } = require('electron')
const { performance } = require('node:perf_hooks')

const stats = new Map()
let armed = false

function record(channel, kind, ms) {
  if (!armed) return
  const key = `${kind} ${channel}`
  const entry = stats.get(key) || { channel, kind, count: 0, totalMs: 0, maxMs: 0 }
  entry.count += 1
  entry.totalMs += ms
  entry.maxMs = Math.max(entry.maxMs, ms)
  stats.set(key, entry)
}

const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => originalHandle(channel, async (event, ...args) => {
  const startedAt = performance.now()
  try {
    return await listener(event, ...args)
  } finally {
    record(channel, 'invoke', performance.now() - startedAt)
  }
})

// on / off 成对：包过的监听器记在表里，产品代码拿原函数 removeListener 时照样摘得掉。
const wrapped = new WeakMap()
const originalOn = ipcMain.on.bind(ipcMain)
const originalRemove = ipcMain.removeListener.bind(ipcMain)
ipcMain.on = (channel, listener) => {
  const timed = (event, ...args) => {
    const startedAt = performance.now()
    try {
      return listener(event, ...args)
    } finally {
      record(channel, 'on', performance.now() - startedAt)
    }
  }
  wrapped.set(listener, timed)
  return originalOn(channel, timed)
}
ipcMain.addListener = ipcMain.on
ipcMain.removeListener = (channel, listener) => originalRemove(channel, wrapped.get(listener) || listener)
ipcMain.off = ipcMain.removeListener

globalThis.__nomiIpcProbe = {
  arm() {
    stats.clear()
    armed = true
  },
  take() {
    armed = false
    return [...stats.values()]
      .map((entry) => ({ ...entry, totalMs: Math.round(entry.totalMs * 10) / 10, maxMs: Math.round(entry.maxMs * 10) / 10 }))
      .sort((a, b) => b.totalMs - a.totalMs)
  },
}
