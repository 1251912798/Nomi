import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MCP_VERIFY_REASONS } from '../../../electron/shared/mcpConnectionContract'
import { enOnboardingProviders, zhOnboardingProviders } from '../../i18n/locales/onboardingProviders'
import { resolveAssistantBrokenAction, type AssistantBrokenAction } from './assistantActivationState'

const dir = path.dirname(fileURLToPath(import.meta.url))

// 「原因 → 真正能做的动作」对照表（D2）：失效框的主按钮必须做得到它承诺的事。
// 端口被占时，改写配置释放不了端口——主按钮只能是「再测一次连接」，不能写「修复接入」。
const TABLE: Record<(typeof MCP_VERIFY_REASONS)[number], AssistantBrokenAction> = {
  ok: 'repair',
  'not-installed': 'repair',
  'command-missing': 'repair',
  'argument-missing': 'repair',
  'spawn-failed': 'repair',
  timeout: 'repair',
  'handshake-failed': 'repair',
  'client-auth-missing': 'repair',
  'http-not-listening': 'retest',
}

describe('助手失效框主按钮：原因 → 动作', () => {
  it.each(MCP_VERIFY_REASONS)('实连原因 %s 对应的主按钮动作', (reason) => {
    expect(resolveAssistantBrokenAction({ staleShape: false, reason }).action).toBe(TABLE[reason])
  })

  it('读配置就判死的过时形状：只有重写配置能修，一律「升级接入」', () => {
    for (const reason of MCP_VERIFY_REASONS) {
      expect(resolveAssistantBrokenAction({ staleShape: true, reason })).toEqual({ action: 'upgrade', labelKey: 'onboardingProviders.assistant.upgrade', titleKey: 'onboardingProviders.assistant.brokenTitle', badgeKey: 'onboardingProviders.assistant.status.broken' })
    }
  })

  it('端口被占：主按钮文案是「测试连接」，不是「修复接入」，且两种语言都不再承诺修复', () => {
    const plan = resolveAssistantBrokenAction({ staleShape: false, reason: 'http-not-listening' })
    expect(plan.labelKey).toBe('onboardingProviders.assistant.box.test')
    expect(zhOnboardingProviders.assistant.box.test).not.toContain('修复')
    expect(enOnboardingProviders.assistant.box.test).not.toMatch(/repair|fix/i)
  })

  it('标题也出自同一个投影：端口被占不再写「接入配置需要更新」（配置本身没问题）；其余原因仍是配置要更新', () => {
    for (const reason of MCP_VERIFY_REASONS) {
      const { titleKey } = resolveAssistantBrokenAction({ staleShape: false, reason })
      expect(titleKey, reason).toBe(reason === 'http-not-listening' ? 'onboardingProviders.assistant.portBusyTitle' : 'onboardingProviders.assistant.brokenTitle')
    }
    expect(zhOnboardingProviders.assistant.portBusyTitle).not.toContain('配置需要更新')
    expect(enOnboardingProviders.assistant.portBusyTitle).not.toMatch(/needs an update/i)
    expect(zhOnboardingProviders.assistant.portBusyTitle.length).toBeGreaterThan(0)
    expect(enOnboardingProviders.assistant.portBusyTitle.length).toBeGreaterThan(0)
  })

  it('卡头徽章也出自同一个投影：端口被占不再写「配置已失效」，其余原因仍是配置失效', () => {
    for (const reason of MCP_VERIFY_REASONS) {
      const { badgeKey } = resolveAssistantBrokenAction({ staleShape: false, reason })
      expect(badgeKey, reason).toBe(reason === 'http-not-listening' ? 'onboardingProviders.assistant.status.portBusy' : 'onboardingProviders.assistant.status.broken')
    }
    expect(zhOnboardingProviders.assistant.status.portBusy).not.toContain('配置')
    expect(enOnboardingProviders.assistant.status.portBusy).not.toMatch(/configuration/i)
    expect(zhOnboardingProviders.assistant.status.portBusy.length).toBeGreaterThan(0)
    expect(enOnboardingProviders.assistant.status.portBusy.length).toBeGreaterThan(0)
  })

  it('卡头 statusLabel 在失效分支从投影取值', () => {
    const card = fs.readFileSync(path.join(dir, 'ConnectAssistantCard.tsx'), 'utf8')
    expect(card).toContain('brokenPlan.badgeKey')
  })

  it('状态框的标题由调用方按投影传入，不在框里写死', () => {
    const box = fs.readFileSync(path.join(dir, 'AssistantStatusBox.tsx'), 'utf8')
    expect(box).toContain('props.brokenTitle')
    const card = fs.readFileSync(path.join(dir, 'ConnectAssistantCard.tsx'), 'utf8')
    expect(card).toContain('brokenTitle={brokenPlan')
  })

  it('卡片按动作分流：retest 走已有的测试连接动作，rewrite 才写配置，主按钮不再无条件接 handleInstall', () => {
    const card = fs.readFileSync(path.join(dir, 'ConnectAssistantCard.tsx'), 'utf8')
    expect(card).not.toContain('onPrimary={handleInstall}')
    expect(card).toContain("brokenPlan?.action === 'retest' ? handleTest : handleInstall")
  })
})
