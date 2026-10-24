// 「AI 助手连接」卡的使用情况通道（MCP 第 4 段）：账在 mcpUsageRegistry（主进程内存），这里只做传输。
//
// 订阅而不是轮询：助手没调用时没有任何流量；有调用时最多每秒推一次整份快照（每个助手一条、几十字节）。
// 窗口里没有这张卡也无所谓——推送本身只是一个 IPC 小消息，渲染层只在卡挂着的时候才订阅处理。
// 初次读取走 invoke，推送走 nomi:mcp:usage-changed。
import { ipcMain } from 'electron'
import { assertTrustedSender } from '../ipcSenderGuard'
import { mcpUsageRegistry, onMcpUsageChanged } from './mcpUsageRegistry'

export const MCP_USAGE_PUSH_INTERVAL_MS = 1000

/** 节流：第一次变化立刻推，之后每个窗口期内的所有变化合成一次、窗口结束时补推。纯函数式，便于单测。 */
export function createTrailingThrottle(send: () => void, intervalMs: number, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  const open = (): void => {
    timer = timers.set(() => {
      timer = null
      if (pending) { pending = false; send(); open() }
    }, intervalMs)
  }
  return {
    notify(): void {
      if (timer) { pending = true; return }
      send()
      open()
    },
    dispose(): void { if (timer) timers.clear(timer); timer = null; pending = false },
  }
}

export function registerMcpUsageIpc(): () => void {
  ipcMain.handle('nomi:capability:mcp-usage', (event) => {
    assertTrustedSender(event)
    return mcpUsageRegistry().snapshot()
  })
  const throttle = createTrailingThrottle(() => {
    void import('electron').then(({ BrowserWindow }) => {
      const snapshot = mcpUsageRegistry().snapshot()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('nomi:mcp:usage-changed', snapshot)
      }
    })
  }, MCP_USAGE_PUSH_INTERVAL_MS)
  const off = onMcpUsageChanged(() => throttle.notify())
  return () => { off(); throttle.dispose() }
}
