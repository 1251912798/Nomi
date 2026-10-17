import React from 'react'
import { getDesktopBridge } from '../../desktop/bridge'
import type { McpClientUsage } from '../../desktop/mcpBridgeTypes'

/**
 * 助手的使用情况（主进程内存里的账）：挂上时读一次，之后订阅主进程的推送（每秒最多一次）。
 * 订阅而不是轮询的理由和成本见 electron/capabilityCore/mcpUsageIpc.ts；老 preload 没有这个口就一直是空。
 */
export function useMcpUsage(): Record<string, McpClientUsage> {
  const [usage, setUsage] = React.useState<Record<string, McpClientUsage>>({})
  const capability = getDesktopBridge()?.capability
  const read = capability?.mcpUsage
  const subscribe = capability?.onMcpUsage
  React.useEffect(() => {
    let alive = true
    void read?.().then((snapshot) => { if (alive) setUsage(snapshot) }).catch(() => {})
    const off = subscribe?.((snapshot) => { if (alive) setUsage(snapshot) })
    return () => { alive = false; off?.() }
  }, [read, subscribe])
  return usage
}
