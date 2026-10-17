import React, { type JSX } from 'react'
import { ConnectAssistantCard } from '../../../ui/onboarding/ConnectAssistantCard'
import type { McpClientInfo, McpClientUsage, McpInfo } from '../../../desktop/mcpBridgeTypes'
import { holdDesignLabReady } from '../labReadyHold'
import { SETTINGS_CELL_WIDTH } from '../settings/settingsLabKit'
import { useLabLocale } from './useLabLocale'

/**
 * 「AI 助手连接」卡的连接状态格（MCP 第 4 段，画布 v5）。生产 ConnectAssistantCard + 主进程会给的 McpInfo 形状：
 * 使用情况（info.usage）用夹具喂，「测试连接 / 撤销接入」由舞台真点（走真实交互路径），不手摆结果。
 */
type Plan = { target: 'claude' | 'codex' | 'cursor'; click?: 'test' | 'revoke'; verify: 'ok' | 'never' | 'ok-then-never'; ready: string; noVerify?: true }

const PLAN = {
  using: { target: 'claude', verify: 'ok', ready: '[data-assistant-status="using"]' },
  'using-running': { target: 'claude', verify: 'ok', ready: '[data-assistant-status="using"]' },
  recent: { target: 'claude', verify: 'ok', ready: '[data-assistant-status="recent"]' },
  written: { target: 'codex', verify: 'ok', ready: '[data-assistant-verified]' },
  'host-approval': { target: 'cursor', verify: 'ok', ready: '[data-assistant-verified]' },
  // 过时形状读配置就判死、没安装的不实连：这两格没有验证要等。
  broken: { target: 'claude', verify: 'ok', ready: '[data-assistant-status="broken"]', noVerify: true },
  none: { target: 'codex', verify: 'ok', ready: '[data-assistant-status="none"]', noVerify: true },
  checking: { target: 'codex', verify: 'never', ready: '[data-assistant-status="written"]' },
  'test-running': { target: 'claude', click: 'test', verify: 'ok-then-never', ready: '[data-assistant-test][disabled]' },
  'test-ok': { target: 'codex', click: 'test', verify: 'ok', ready: '[data-assistant-test-result]' },
  'revoke-confirm': { target: 'claude', click: 'revoke', verify: 'ok', ready: '[data-assistant-revoke-confirm]' },
} satisfies Record<string, Plan>

export type StatusScenario = keyof typeof PLAN

const TOOL_READ = { tool: 'nomi_read' }

function clientInfo(configPath: string, over: Partial<McpClientInfo> = {}): McpClientInfo {
  return {
    installed: true, appInstalled: true, configPath, snippet: '{}', configState: 'current', launcherKind: 'packaged',
    configuredCommand: 'http://127.0.0.1:47173/mcp', configuredSettingsDir: null, ...over,
  }
}

function usageFor(scenario: StatusScenario, now: number): Record<string, McpClientUsage> {
  const claude = (over: Partial<McpClientUsage>): McpClientUsage => ({
    reportedName: 'claude-code', lastSeenAt: now - 5_000, lastCall: { ...TOOL_READ, at: now - 5_000 }, callCount: 7, inFlight: 0, ...over,
  })
  if (scenario === 'using' || scenario === 'test-running' || scenario === 'revoke-confirm') return { claude: claude({}) }
  if (scenario === 'using-running') return { claude: claude({ inFlight: 1, callCount: 8 }) }
  if (scenario === 'recent') {
    const at = now - 3 * 3_600_000
    return { claude: claude({ lastSeenAt: at, lastCall: { ...TOOL_READ, at }, callCount: 12 }) }
  }
  // 其它格：只有 Claude Code 来过（让标签上同时有绿点和黄点）。
  const at = now - 12 * 60_000
  return { claude: claude({ lastSeenAt: at, lastCall: { ...TOOL_READ, at }, callCount: 3 }) }
}

export function ConnectionStatusStage({ scenario, locale }: { scenario: StatusScenario; locale: 'zh-CN' | 'en' }): JSX.Element {
  const localeReady = useLabLocale(locale, 'host-config-status')
  const plan: Plan = PLAN[scenario]
  const [settled, setSettled] = React.useState(false)
  // 「测试中」那一格：点测试之前的实连照常返回，点之后的一次永远不返回（测试停在进行中）。
  const armed = React.useRef(false)
  const info: McpInfo = React.useMemo(() => {
    return {
      tokenReady: true,
      rpcRunning: true,
      server: { command: '/Applications/Nomi.app/Contents/MacOS/Nomi Helper', args: [] },
      trustedHosts: ['claude'],
      clients: {
        claude: scenario === 'broken'
          ? clientInfo('~/.claude.json', { configState: 'legacy-launcher', configuredCommand: 'node scripts/nomi-mcp.mjs' })
          : clientInfo('~/.claude.json'),
        'claude-desktop': clientInfo('~/Library/Application Support/Claude/claude_desktop_config.json', { installed: false }),
        codex: scenario === 'none' ? clientInfo('~/.codex/config.toml', { installed: false }) : clientInfo('~/.codex/config.toml'),
        cursor: clientInfo('~/.cursor/mcp.json'),
      },
    }
  }, [scenario])
  React.useMemo(() => {
    const verifyMcp = (): Promise<unknown> => {
      if (plan.verify === 'never' || (plan.verify === 'ok-then-never' && armed.current)) return new Promise(() => {})
      const result = { ok: true, reason: 'ok', latencyMs: 120, toolCount: 24, stale: false, detail: '' }
      return Promise.resolve(result).then((value) => { Promise.resolve().then(() => setSettled(true)); return value })
    }
    ;(window as unknown as { nomiDesktop: unknown }).nomiDesktop = {
      capability: { mcpInfo: () => info, mcpUsage: () => Promise.resolve(usageFor(scenario, Date.now())), verifyMcp, installMcp: () => ({ ok: true }), uninstallMcp: () => ({ ok: true }) },
    }
  }, [info, plan.verify, scenario])

  const stageRef = React.useRef<HTMLDivElement>(null)
  // 选中该格要看的助手 → （第一次验证落定后）真点一下按钮 → 等目标状态出现才放行就绪旗。
  React.useEffect(() => {
    const root = stageRef.current
    if (!localeReady || !root) return undefined
    const release = holdDesignLabReady(`host-config:status:${scenario}`)
    let selected = false
    let clicked = !plan.click
    const step = (): void => {
      const radio = root.querySelector<HTMLInputElement>(`input[type="radio"][value="${plan.target}"]`)
      if (!radio) return
      if (!selected && !radio.checked) {
        selected = true
        radio.click()
      }
      if (!radio.checked) return
      if (!clicked) {
        if (!settled) return
        const button = root.querySelector<HTMLButtonElement>(plan.click === 'test' ? '[data-assistant-test]' : '[data-assistant-uninstall]')
        if (!button) return
        clicked = true
        armed.current = true
        button.click()
        return
      }
      if (root.querySelector(plan.ready) && (plan.click || plan.verify === 'never' || plan.noVerify || settled)) {
        observer.disconnect()
        window.requestAnimationFrame(() => window.requestAnimationFrame(release))
      }
    }
    const observer = new MutationObserver(step)
    observer.observe(root, { childList: true, subtree: true, attributes: true })
    step()
    return () => { observer.disconnect(); release() }
  }, [localeReady, scenario, plan, settled])

  return (
    <div ref={stageRef} style={{ width: SETTINGS_CELL_WIDTH }} data-design-lab-stage="host-config-status">
      {localeReady ? <ConnectAssistantCard info={info} detailMode onChanged={() => {}} onTrustChange={() => {}} /> : null}
    </div>
  )
}
