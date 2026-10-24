// MCP 接入状态的中立契约层 —— 主进程（mcpConfig / mcpVerify）、preload、渲染层（mcpBridgeTypes）
// 三边此前各抄一份字面量联合，check:vocabularies 把它们登记成 4 条 debt，收敛办法写在 debt 自己的
// reason 里：「在中立模块导出 as const tuple，再让各侧 derive」。2026-09-14 收敛于此。
// 本文件不引 node 内置、不引 electron。
//
// 损坏的启动器可自愈；仍然有效的另一份 Nomi / profile 只显示归属，由用户主动切换。

/** 客户端配置里那条 nomi 条目相对当前 Nomi 的兼容性判定（mcpConfig.classifyMcpEntry 的唯一产出）。 */
export const MCP_CONFIG_STATES = [
  'absent',
  'current',
  'development',
  'legacy-launcher',
  'stale-development',
  'auth-stale',
  'launcher-broken',
  'launcher-elsewhere',
  'migrated-http',
  'migrated-forwarder',
  'custom',
] as const
export type McpConfigState = (typeof MCP_CONFIG_STATES)[number]

/** 实连验证（mcpVerify.verifyMcp）的诊断结论；UI 文案按它走 i18n，主进程不回中文（R15）。 */
export const MCP_VERIFY_REASONS = [
  'ok',
  'not-installed',
  'command-missing',
  'argument-missing',
  'spawn-failed',
  'timeout',
  'handshake-failed',
  'client-auth-missing',
  // 本机 HTTP 服务没起来（多为端口被占）：配置和身份都对，但没有服务可连。C-5。
  'http-not-listening',
] as const
export type McpVerifyReason = (typeof MCP_VERIFY_REASONS)[number]

/**
 * 一个助手这一次 Nomi 运行里的使用情况（第 4 段）。只存在主进程内存里，Nomi 重启即清零；
 * 自报名只作展示，身份以签名口令认出的 key 为准。账本在 capabilityCore/mcpUsageRegistry.ts。
 */
export type McpClientUsage = {
  /** 助手自报的名字（initialize 里的 clientInfo.name），只作展示；只有握手能看到它的那条传输才有。 */
  reportedName: string | null
  /** 最近一次连上或调用的时间。 */
  lastSeenAt: number | null
  /** 最近一次调用的工具（内部名，界面按语言取展示名）与时间。 */
  lastCall: { tool: string; at: number } | null
  /** 这次 Nomi 运行里它调用工具的次数（一次调用只算一次）。 */
  callCount: number
  /** 此刻还没跑完的调用数。 */
  inFlight: number
}
