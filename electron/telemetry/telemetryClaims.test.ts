// 「对用户说了什么」与「实际收什么」不许各写各的：
//   · 对外文案（README、官网生成脚本）不许再出现绝对的「不上报 / no telemetry」——产品有可选匿名统计；
//   · 凡是需要告知范围 ≥2 的事件，设置页说明与同意卡里必须有对应的人话（流畅度 / smoothness）。
// 之前这两处各自手写，README 写「no telemetry」时产品已经有可选遥测，没有任何东西核对过。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { zhAgentPanelV4, enAgentPanelV4 } from '../../src/i18n/locales/agentPanelV4'
import { TELEMETRY_EVENT_MIN_SCOPE, TELEMETRY_SCOPE_VERSION } from './telemetryEvents'

const root = path.resolve(__dirname, '../..')
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8')

describe('遥测告知口径', () => {
  it('对外文案没有绝对的「不上报 / no telemetry」', () => {
    const files = ['README.md', 'README.zh-CN.md', 'scripts/marketing/content.mjs', 'scripts/marketing/features.mjs']
    for (const file of files) {
      expect(read(file), file).not.toMatch(/no telemetry|不上报数据/i)
    }
  })

  it('告知范围版本号与事件登记表对得上：最高要求版本 = 当前版本', () => {
    expect(Math.max(...Object.values(TELEMETRY_EVENT_MIN_SCOPE))).toBe(TELEMETRY_SCOPE_VERSION)
  })

  it('范围 2 的数据（流畅度分档）在设置页说明与同意卡里都有人话', () => {
    const settings = read('src/i18n/locales/settings.ts')
    expect(settings).toContain('界面流畅度')
    expect(settings).toContain('smoothness figures')
    expect(zhAgentPanelV4.consent.collects).toContain('卡不卡')
    expect(zhAgentPanelV4.consent.scopeCollects).toContain('点击多久有反应')
    expect(enAgentPanelV4.consent.collects).toContain('smooth')
    expect(enAgentPanelV4.consent.scopeTitle).toContain('smoothness')
  })
})
