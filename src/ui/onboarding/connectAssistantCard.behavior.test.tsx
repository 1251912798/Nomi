/**
 * 「AI 助手连接」卡的行为级测试：真卡 + 记账的桌面桥，数 installMcp / verifyMcp 被调了几次。
 *
 * 为什么要有：此前卡片的断言都是读源码字符串，「测试连接」里偷偷调一次 handleInstall（顺带写配置）全仓测试仍绿。
 * 端口被占时主按钮只许重验、不许写配置——这条防线现在由「数调用次数」守。
 * 测试宿主没有 DOM：用仓库已有的 react-reconciler 测试渲染器；状态框本体另有测试，这里换成记 props 的桩，
 * 卡片算出来的主按钮、标题、正文、动作回调照常流过去。
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReactTestRenderer } from '../../workbench/ai/v4/testReactRenderer'
import { MCP_VERIFY_REASONS, type McpConfigState, type McpVerifyReason } from '../../../electron/shared/mcpConnectionContract'

const seen = vi.hoisted(() => ({ box: null as null | Record<string, unknown> & { detail: unknown; onPrimary: () => void; onTest: () => void; primaryLabel: unknown }, verify: vi.fn(), install: vi.fn() }))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' } }) }))
vi.mock('../../desktop/bridge', () => ({
  getDesktopBridge: () => ({ capability: { mcpInfo: () => null, verifyMcp: seen.verify, installMcp: seen.install } }),
}))
vi.mock('./FoldableModelCard', () => ({ FoldableModelCard: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('../../design', () => ({ DesignSegmentedControl: () => null, DesignSwitch: () => null }))
vi.mock('./AssistantStatusBox', () => ({ AssistantStatusBox: (props: NonNullable<typeof seen.box>) => { seen.box = props; return null } }))

import { ConnectAssistantCard } from './ConnectAssistantCard'

type Reason = McpVerifyReason
const STALE_SHAPES: McpConfigState[] = ['legacy-launcher', 'stale-development', 'auth-stale', 'launcher-broken']

const info = (configState: McpConfigState) => ({
  tokenReady: true, rpcRunning: true, server: { command: 'node', args: [] }, trustedHosts: [],
  clients: {
    claude: { installed: true, appInstalled: true, configPath: '', snippet: '', configState, configuredCommand: null, configuredSettingsDir: null, launcherKind: 'http' },
  },
}) as never

const verifyFailing = (reason: Reason) => ({ ok: false, reason, latencyMs: null, toolCount: null, stale: false, detail: '' })
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('ConnectAssistantCard: which button writes the config, and how often', () => {
  let renderer: ReturnType<typeof createReactTestRenderer>
  const settle = async () => { for (let i = 0; i < 4; i += 1) { await tick(); renderer.flushPassiveEffects() } }
  const mount = async (configState: McpConfigState, reason: Reason) => {
    seen.verify.mockResolvedValue(verifyFailing(reason))
    renderer.render(<ConnectAssistantCard info={info(configState)} onChanged={() => undefined} onTrustChange={() => undefined} />)
    await settle()
  }
  const remount = () => { renderer.close(); renderer = createReactTestRenderer() }
  const text = (node: unknown) => renderToStaticMarkup(<>{node as React.ReactNode}</>)

  beforeEach(() => {
    seen.box = null
    seen.verify.mockReset()
    seen.install.mockReset().mockReturnValue({ ok: true })
    vi.stubGlobal('window', { setInterval, clearInterval, addEventListener: () => undefined, removeEventListener: () => undefined, localStorage: { getItem: () => null, setItem: () => undefined }, setTimeout, clearTimeout })
    renderer = createReactTestRenderer()
  })
  afterEach(() => { renderer.close(); vi.unstubAllGlobals() })

  it('port busy (http-not-listening): the primary button is test-connection: installMcp 0 times, verifyMcp +1', async () => {
    await mount('current', 'http-not-listening')
    expect(seen.box).toMatchObject({ box: 'broken', primaryLabel: 'onboardingProviders.assistant.box.test', brokenTitle: 'onboardingProviders.assistant.portBusyTitle' })
    expect(text(seen.box!.detail)).toContain('httpNotListening')
    const verifiedBefore = seen.verify.mock.calls.length
    expect(verifiedBefore).toBe(1)

    seen.box!.onPrimary()
    await settle()

    expect(seen.install).toHaveBeenCalledTimes(0)
    expect(seen.verify).toHaveBeenCalledTimes(verifiedBefore + 1)
  })

  it('test-connection itself (the status box secondary action) never writes the config, whatever the broken reason', async () => {
    for (const reason of MCP_VERIFY_REASONS.filter((r) => r !== 'ok')) {
      seen.install.mockClear()
      await mount('current', reason)
      const before = seen.verify.mock.calls.length
      seen.box!.onTest()
      await settle()
      expect(seen.install, `reason ${reason}`).toHaveBeenCalledTimes(0)
      expect(seen.verify.mock.calls.length, `reason ${reason}`).toBe(before + 1)
      remount()
    }
  })

  it('repair reasons: the primary button writes the config exactly once (installMcp +1), then re-verifies', async () => {
    const repairReasons = MCP_VERIFY_REASONS.filter((r) => r !== 'ok' && r !== 'not-installed' && r !== 'http-not-listening')
    expect(repairReasons.length).toBeGreaterThan(0)
    for (const reason of repairReasons) {
      seen.install.mockClear()
      await mount('current', reason)
      expect(seen.box!.primaryLabel, `reason ${reason}`).toBe('onboardingProviders.assistant.repair')
      const before = seen.verify.mock.calls.length
      seen.box!.onPrimary()
      await settle()
      expect(seen.install, `reason ${reason}`).toHaveBeenCalledTimes(1)
      expect(seen.install).toHaveBeenCalledWith('claude')
      expect(seen.verify.mock.calls.length, `reason ${reason}`).toBe(before + 1)
      remount()
    }
  })

  it('stale config shapes: the primary button is upgrade and writes once', async () => {
    for (const shape of STALE_SHAPES) {
      seen.install.mockClear()
      await mount(shape, 'ok')
      expect(seen.box, `shape ${shape}`).toMatchObject({ box: 'broken', primaryLabel: 'onboardingProviders.assistant.upgrade' })
      seen.box!.onPrimary()
      await settle()
      expect(seen.install, `shape ${shape}`).toHaveBeenCalledTimes(1)
      remount()
    }
  })

  it('every reason has its own body text; only handshake-failed may show the generic one', async () => {
    // 守 REASON_I18N 不漏归类：新增原因若没有自己的正文，会静默回落到 handshakeFailed 的文案。
    // satisfies Record<…> 让新增原因不补进这张表就过不了类型检查，补进来后下面的断言再核卡里真的有对应正文。
    const bodyKey = {
      ok: 'handshakeFailed', 'not-installed': 'handshakeFailed', 'command-missing': 'commandMissing', 'argument-missing': 'argumentMissing',
      'spawn-failed': 'spawnFailed', timeout: 'timeout', 'handshake-failed': 'handshakeFailed', 'client-auth-missing': 'clientAuthMissing',
      'http-not-listening': 'httpNotListening',
    } satisfies Record<Reason, string>
    for (const reason of MCP_VERIFY_REASONS.filter((r) => r !== 'ok' && r !== 'not-installed')) {
      await mount('current', reason)
      expect(text(seen.box!.detail), `reason ${reason}`).toContain(`onboardingProviders.assistant.reason.${bodyKey[reason]}`)
      remount()
    }
  })
})
