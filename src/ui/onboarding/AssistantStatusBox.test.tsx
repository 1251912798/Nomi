import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { AssistantStatusBox, type AssistantStatusBoxProps } from './AssistantStatusBox'
import type { AssistantBox } from './assistantActivationState'

const NOW = 50_000_000
const noop = (): void => undefined
const props = (over: Partial<AssistantStatusBoxProps>): AssistantStatusBoxProps => ({
  box: 'using', client: 'Claude Code', usage: { reportedName: 'claude-code', lastSeenAt: NOW - 5_000, lastCall: { tool: 'nomi_read', at: NOW - 5_000 }, callCount: 7, inFlight: 0 },
  now: NOW, test: 'idle', busy: false, confirmingRevoke: false, copied: false,
  onPrimary: noop, onTest: noop, onRewrite: noop, onRevoke: noop, onRevokeConfirm: noop, onRevokeCancel: noop, onCopy: noop, ...over,
})
const html = (over: Partial<AssistantStatusBoxProps>): string => renderToStaticMarkup(<AssistantStatusBox {...props(over)} />)
const text = (markup: string): string => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const order = (markup: string, marks: string[]): number[] => marks.map((mark) => markup.indexOf(mark))

describe('AI 助手连接 · 状态框', () => {
  beforeAll(async () => { await i18n.changeLanguage('zh-CN') })

  it('正在使用：刚刚调用了 X · 这次会话已调用 N 次工具', async () => {
    expect(text(html({}))).toContain('刚刚调用了「读取项目与制作状态」· 这次会话已调用 7 次工具')
    expect(text(html({ usage: { reportedName: null, lastSeenAt: NOW, lastCall: { tool: 'nomi_read', at: NOW }, callCount: 8, inFlight: 1 } }))).toContain('正在调用「读取项目与制作状态」')
    await i18n.changeLanguage('en')
    expect(text(html({}))).toContain('Just called “Read project and production status” · 7 tool calls this session')
    await i18n.changeLanguage('zh-CN')
  })

  it('没登记展示名的新工具：回退成内部名，不空着', () => {
    expect(text(html({ usage: { reportedName: null, lastSeenAt: NOW, lastCall: { tool: 'nomi_future_tool', at: NOW }, callCount: 1, inFlight: 0 } }))).toContain('nomi_future_tool')
  })

  it('最近连过：最近一次使用：3小时前', () => {
    const usage = { reportedName: null, lastSeenAt: NOW - 3 * 3_600_000, lastCall: { tool: 'nomi_read', at: NOW - 3 * 3_600_000 }, callCount: 12, inFlight: 0 }
    expect(text(html({ box: 'recent', usage }))).toContain('最近一次使用：3小时前')
  })

  it('已写入但还没连过来：提示重启；Cursor 那格只说在 Cursor 里打开，不再叫人重启', () => {
    expect(text(html({ box: 'written', usage: null }))).toContain('重启 Claude Code 后生效')
    const cursor = text(html({ box: 'host-approval', client: 'Cursor', usage: null, approvalHint: 'Cursor 首次调用 Nomi 时可能会再向你确认一次。' }))
    expect(cursor).toContain('等你在 Cursor 里打开')
    expect(cursor).not.toContain('重启')
  })

  it('框底一行轻量文字按钮：撤销接入在最左，重新写入、测试连接在右，测试连接最右；没有边框、不单占一行', () => {
    const markup = html({ box: 'recent' })
    const [uninstall, rewrite, test] = order(markup, ['data-assistant-uninstall', 'data-assistant-rewrite', 'data-assistant-test'])
    expect(uninstall).toBeGreaterThan(-1)
    expect(uninstall).toBeLessThan(rewrite)
    expect(rewrite).toBeLessThan(test)
    const actions = markup.slice(markup.indexOf('data-assistant-actions'))
    expect(actions).not.toMatch(/\bborder\b/)
    expect(markup.match(/data-assistant-actions/g)).toHaveLength(1)
  })

  it('配置失效 / 未接入：通栏主按钮；失效只留撤销，未接入只留复制配置', () => {
    const broken = html({ box: 'broken', usage: null, detail: '连的是旧版本', primaryLabel: '升级接入 Claude Code', brokenCode: 'legacy-launcher' })
    expect(broken).toContain('data-assistant-primary')
    expect(broken).toContain('data-assistant-broken="legacy-launcher"')
    expect(text(broken)).toContain('升级接入 Claude Code')
    expect(broken).toContain('data-assistant-uninstall')
    expect(broken).not.toContain('data-assistant-test')
    const none = html({ box: 'none', usage: null, primaryLabel: '一键接入 Claude Code' })
    expect(none).toContain('data-assistant-primary')
    expect(none).toContain('data-assistant-client-copy')
    expect(none).not.toContain('data-assistant-uninstall')
  })

  it('测试连接三态：测试中（按钮禁用）/ 成功（N 个工具可用）/ 默认', () => {
    expect(text(html({ test: 'running' }))).toContain('测试中…')
    expect(html({ test: 'running' })).toMatch(/data-assistant-test[^>]*disabled/)
    expect(text(html({ test: { toolCount: 24 } }))).toContain('刚刚测试过：连得上，24 个工具可用')
    expect(text(html({ test: 'idle' }))).toContain(i18n.t('onboardingProviders.assistant.box.test'))
  })

  it('撤销确认：就地换成「确定撤销…？取消 / 撤销」，原来的三个按钮暂时收起', () => {
    const markup = html({ confirmingRevoke: true })
    expect(text(markup)).toContain('确定撤销 Claude Code 的接入？')
    expect(markup).toContain('data-assistant-revoke-confirm')
    expect(markup).toContain('data-assistant-revoke-cancel')
    expect(markup).not.toContain('data-assistant-test')
  })

  it('助手还没来过但 Nomi 自己实连通：保留「配置能用 · N 个工具」这条证据', () => {
    expect(text(html({ box: 'written', usage: null, verifiedToolCount: 24 }))).toContain('配置能用：24 个工具可用')
  })

  it('所有状态 × 中英文：不出现价格 / 预算 / 协议名', async () => {
    const boxes: AssistantBox[] = ['using', 'recent', 'written', 'host-approval', 'broken', 'elsewhere', 'none']
    for (const language of ['zh-CN', 'en']) {
      await i18n.changeLanguage(language)
      for (const box of boxes) {
        const shown = text(html({ box, detail: '原因', primaryLabel: '主按钮', test: { toolCount: 3 }, verifiedToolCount: 3, approvalHint: '提示' }))
        expect(shown).not.toMatch(/价格|预算|口令|HTTP|MCP|握手|price|budget|handshake/i)
      }
    }
    await i18n.changeLanguage('zh-CN')
  })
})
