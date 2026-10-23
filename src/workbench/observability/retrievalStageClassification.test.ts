// C4（⑬，用户 10-22 拍板 A）：取回阶段的码（retrieval-*）是「任务已提交、这次没取回」——
// 分类器以前不认它们，retrieval-query 落进 unknown，提示「可以重试一次，或换一个模型」，主动作 retry（= 再生成、再扣一次）。
import { afterAll, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { tagNomiError } from '../../../electron/shared/nomiErrorCodes'
import { classifyGenerationError } from './classifyError'
import { narrateGenerationErrorActions, narrateIsVendorSideFailure } from './narrate'

const RETRIEVAL_CODES = ['retrieval-query', 'retrieval-parse', 'retrieval-download', 'retrieval-timeout'] as const
/** 提交前那一族的口径 + 「再来一次」的口径：两种语言都不许出现在取回阶段的说明里。 */
const FORBIDDEN = /重试|没发到|没被请求到|没有发出去|重新生成吧|retry|was never sent|try again/i

function withVendorMessage(upstream: string, message: string): string {
  const structured = { vendorKey: 'relay', method: 'GET', httpStatus: 503, upstreamMsg: upstream, category: 'server', retryable: true }
  return `NOMI_VENDOR_ERR_B64::${Buffer.from(JSON.stringify(structured), 'utf8').toString('base64')}:: ${message}`
}

afterAll(async () => { await i18n.changeLanguage('zh-CN') })

describe('取回阶段码 → 「已提交、这次没取回」', () => {
  for (const lang of ['zh-CN', 'en'] as const) {
    for (const code of RETRIEVAL_CODES) {
      it(`${lang} · ${code}：归到 retrieval-incomplete，主 / 次动作都不是再生成，说明里不出「重试 / 没发到」`, async () => {
        await i18n.changeLanguage(lang)
        const report = classifyGenerationError(tagNomiError(code, '取回卡在「查询任务」这一步：socket hang up'))
        expect(report.kind).toBe('retrieval-incomplete')
        expect(report.primary).toBe('view-task')
        expect(report.secondary).not.toBe('retry')
        expect(`${report.reason} ${report.hint}`).not.toMatch(FORBIDDEN)
        expect(report.vendorSide).toBe(false)
      })
    }
  }

  it('服务商真回的原话照旧显示（#1213：503「无可用渠道」要让用户看见）', async () => {
    await i18n.changeLanguage('zh-CN')
    const report = classifyGenerationError(withVendorMessage('当前分组下无可用渠道', tagNomiError('retrieval-query', '取回卡在「查询任务」这一步：Provider request failed (HTTP 503)')))
    expect(report.kind).toBe('retrieval-incomplete')
    expect(report.providerMessage).toContain('无可用渠道')
  })

  it('没有服务商原话时不从正文里抠一句冒充（Nomi 自己拦下的那句不是服务商说的）', async () => {
    await i18n.changeLanguage('zh-CN')
    const report = classifyGenerationError(tagNomiError('retrieval-query', '取回卡在「查询任务」这一步：Nomi 在本机拦下了这次请求（原始码 outbound-blocked-submit）'))
    expect(report.providerMessage).toBeUndefined()
  })

  it('动作表与「是不是服务商那一侧」表都有这一类的答案', () => {
    expect(narrateGenerationErrorActions('retrieval-incomplete')).toEqual({ primary: 'view-task', secondary: null })
    expect(narrateIsVendorSideFailure('retrieval-incomplete')).toBe(false)
  })
})
