// 能力核 · 本机 HTTP 服务「起没起来、为什么没起来」的进程内记录（C-5）。
// 之前端口冲突只进后台日志，连接状态卡看不到——而宿主配置里写的就是这个端口。
// 由 mcpHttpDesktop 在起 / 停时写，由 mcpVerifyHttp（连接状态卡的实连检查）读；electron-free。
// 只记「明确起失败」这一件事（null = 起好了 / 没起过 / 隔离实例没打算起），原因是系统错误码（如 EADDRINUSE）。
let startFailure: string | null = null

export function recordMcpHttpStartFailure(error: unknown): void {
  const code = (error as { code?: unknown } | null)?.code
  startFailure = typeof code === 'string' && code ? code : 'UNKNOWN'
}

export function clearMcpHttpStartFailure(): void {
  startFailure = null
}

/** 本进程的 HTTP 服务明确没起来时返回原因码，否则 null。 */
export function mcpHttpStartFailure(): string | null {
  return startFailure
}
