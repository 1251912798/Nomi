import {
  BUILTIN_MCP_CLIENTS,
  MCP_CLIENT_REGISTRY,
  type BuiltinMcpClient,
} from '../../../electron/shared/mcpClientRegistry'
import type { McpVerifyReason } from '../../../electron/shared/mcpConnectionContract'

/** 内置客户端 key。唯一 owner 是 electron/shared/mcpClientRegistry.ts；渲染层只 derive。 */
export type AssistantClientKey = BuiltinMcpClient

/**
 * 宿主的显示名与排序——从注册表 derive。「用 AI 帮我接入」卡与「接入 AI 编程助手」卡两处都念这一份，
 * 各抄一份的后果是同一个宿主在两屏上叫不同的名字。这些是产品专名（Claude Code / Codex / …），不进 i18n。
 */
export const ASSISTANT_CLIENT_LABEL: Record<AssistantClientKey, string> = Object.fromEntries(
  BUILTIN_MCP_CLIENTS.map((key) => [key, MCP_CLIENT_REGISTRY[key].label]),
) as Record<AssistantClientKey, string>
export const ASSISTANT_CLIENT_ORDER: readonly AssistantClientKey[] = BUILTIN_MCP_CLIENTS

/** 宿主自己还有一道 MCP server 审批门（如 Cursor）：Nomi 握手成功不等于宿主已放行，徽章不判绿。 */
export function assistantRequiresHostApproval(key: AssistantClientKey): boolean {
  return MCP_CLIENT_REGISTRY[key].requiresHostApproval
}

export type AssistantVerifyPhase = 'checking' | 'ok' | 'broken' | null

export function resolveAssistantActivationState(input: {
  target: AssistantClientKey
  installed: boolean
  verifyPhase: AssistantVerifyPhase
  trustedHosts: readonly string[]
}): {
  broken: boolean
  /** 配置在、握手没断，但宿主那边还要自己批准一次——只说「已写入配置」，不说「已连通」。 */
  hostApprovalPending: boolean
  /** 该客户端是否是可信发起方（连上后允许自动发起制作）。 */
  trusted: boolean
  headerStatus: 'ok' | 'todo'
} {
  const broken = input.installed && input.verifyPhase === 'broken'
  const verified = input.installed && input.verifyPhase === 'ok'
  const hostApproval = assistantRequiresHostApproval(input.target)
  return {
    broken,
    hostApprovalPending: hostApproval && input.installed && !broken,
    trusted: input.trustedHosts.includes(input.target),
    headerStatus: verified && !hostApproval ? 'ok' : 'todo',
  }
}

// ── 连接状态（MCP 第 4 段，画布 v5）：卡头徽章五种 + 状态框六种 + 客户端小圆点 ─────────────────────────
// 上面 resolveAssistantActivationState 管「配置坏没坏 / 宿主要不要自己批准 / 可信发起方」；
// 下面在它之上再加一层「助手有没有真的来过」——数据来自主进程按连接记的使用情况（McpClientUsage）。
// 徽章 / 状态框 / 圆点三者从同一次推导里出，不各自再判一遍。

export type AssistantBadge = 'using' | 'connected' | 'pending' | 'broken' | 'none' | 'checking'
export type AssistantBox = 'using' | 'recent' | 'written' | 'host-approval' | 'broken' | 'elsewhere' | 'none'
export type AssistantDot = 'green' | 'yellow' | null

/** 「刚刚」与「正在使用」共用的窗口：一分钟内调用过、或还有调用没跑完，都算正在用。 */
export const ASSISTANT_ACTIVE_WINDOW_MS = 60_000

export type AssistantUsageSnapshot = {
  lastSeenAt: number | null
  lastCall: { at: number } | null
  inFlight: number
}

export function resolveAssistantConnection(input: {
  target: AssistantClientKey
  installed: boolean
  /** 读回配置就能判死的过时形状。 */
  staleShape: boolean
  /** 配置有效但指向另一份 Nomi。 */
  elsewhere: boolean
  verifyPhase: AssistantVerifyPhase
  trustedHosts: readonly string[]
  usage: AssistantUsageSnapshot | null
  now: number
}): ReturnType<typeof resolveAssistantActivationState> & { badge: AssistantBadge; box: AssistantBox; dot: AssistantDot } {
  const base = resolveAssistantActivationState({
    target: input.target,
    installed: input.installed,
    verifyPhase: input.staleShape ? 'broken' : input.verifyPhase,
    trustedHosts: input.trustedHosts,
  })
  const done = (box: AssistantBox, badge: AssistantBadge, dot: AssistantDot) => ({
    ...base,
    headerStatus: badge === 'using' || badge === 'connected' ? ('ok' as const) : ('todo' as const),
    badge,
    box,
    dot,
  })
  if (!input.installed) return done('none', 'none', null)
  if (input.elsewhere) return done('elsewhere', 'pending', 'yellow')
  if (base.broken) return done('broken', 'broken', 'yellow')
  const usage = input.usage
  if (usage && (usage.inFlight > 0 || (usage.lastCall && input.now - usage.lastCall.at < ASSISTANT_ACTIVE_WINDOW_MS))) {
    return done('using', 'using', 'green')
  }
  // 来过 = 证明宿主已经放行、配置真的被它读到了；比 Nomi 自己握手一次更接近「接上了」。
  if (usage && usage.lastSeenAt !== null) return done('recent', 'connected', 'green')
  const box: AssistantBox = base.hostApprovalPending ? 'host-approval' : 'written'
  return done(box, input.verifyPhase === 'checking' ? 'checking' : 'pending', 'yellow')
}

/** 「刚刚 / 3 分钟前 / 3 小时前 / 2 天前」——按界面语言，不自己拼单位。 */
export function formatUsageAgo(at: number, now: number, locale: string, justNow: string): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return justNow
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute')
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3600), 'hour')
  return rtf.format(-Math.round(seconds / 86_400), 'day')
}

/**
 * 失效框「原因 → 卡头徽章 + 标题 + 主按钮 + 真正能做的动作」（唯一 owner；卡片只按它分流，标题与按钮都不再各写一份）：
 * - upgrade / repair：配置本身有问题，重写 nomi 条目能修，标题说「配置需要更新」；
 * - retest：配置和身份都对、是本机服务没起来（端口被占）——重写配置释放不了端口，能做的只有处理完再测一次；
 *   标题说服务没启动，不再说配置要更新。
 * 以 Record 穷举 McpVerifyReason：新增原因不归类就过不了类型检查。
 */
export type AssistantBrokenAction = 'upgrade' | 'repair' | 'retest'
export type AssistantBrokenPlan = { action: AssistantBrokenAction; labelKey: string; titleKey: string; badgeKey: string }

const CONFIG_TITLE = 'onboardingProviders.assistant.brokenTitle'
const CONFIG_BADGE = 'onboardingProviders.assistant.status.broken'
const BROKEN_BY_REASON: Record<McpVerifyReason, { action: Exclude<AssistantBrokenAction, 'upgrade'>; titleKey: string; badgeKey: string }> = {
  ok: { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'not-installed': { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'command-missing': { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'argument-missing': { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'spawn-failed': { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  timeout: { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'handshake-failed': { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'client-auth-missing': { action: 'repair', titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE },
  'http-not-listening': { action: 'retest', titleKey: 'onboardingProviders.assistant.portBusyTitle', badgeKey: 'onboardingProviders.assistant.status.portBusy' },
}

const BROKEN_LABEL_KEY: Record<AssistantBrokenAction, string> = {
  upgrade: 'onboardingProviders.assistant.upgrade',
  repair: 'onboardingProviders.assistant.repair',
  retest: 'onboardingProviders.assistant.box.test',
}

export function resolveAssistantBrokenAction(input: { staleShape: boolean; reason: McpVerifyReason }): AssistantBrokenPlan {
  if (input.staleShape) return { action: 'upgrade', labelKey: BROKEN_LABEL_KEY.upgrade, titleKey: CONFIG_TITLE, badgeKey: CONFIG_BADGE }
  const row = BROKEN_BY_REASON[input.reason]
  return { action: row.action, labelKey: BROKEN_LABEL_KEY[row.action], titleKey: row.titleKey, badgeKey: row.badgeKey }
}
