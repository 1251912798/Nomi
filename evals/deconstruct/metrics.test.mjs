import { describe, expect, it } from 'vitest'
import { bestWindowCer, judgeCase, normalizeForCer, scoreDeconstruction } from './metrics.mjs'

const shot = (over = {}) => ({ index: 1, visual: '雨夜街口', shotSize: '全景', mood: '悬念', imagePrompt: 'p', dialogue: '', ...over })

describe('拆解效果指标', () => {
  it('读图成功率 / 填充率 / 景别合规率按读出的镜算', () => {
    const metrics = scoreDeconstruction({ shots: [shot(), shot({ shotSize: '大全景' }), shot({ visionFailed: true, visual: '', shotSize: '' })], hasAudio: false })
    expect(metrics.shots).toBe(3)
    expect(metrics.readRate).toBe(0.667)
    expect(metrics.fill.visual).toBe(1)
    expect(metrics.shotSizeValid).toBe(0.5)
    expect(metrics.dialogueShotRate).toBeNull()
  })

  it('「—」占位不算填了', () => {
    expect(scoreDeconstruction({ shots: [shot({ mood: '—' })] }).fill.mood).toBe(0)
  })

  it('调用次数 ≠ 镜数 → 判不达标', () => {
    const metrics = scoreDeconstruction({ shots: [shot(), shot()] }, { visionCalls: 3 })
    expect(metrics.callsMatchShots).toBe(false)
    expect(judgeCase(metrics).join()).toContain('≠ 镜数')
  })

  // 2026-10-19：有人说话的片子对白整列空、没参考稿时 CER 为 null，旧门槛一条都不报——空对白被当成达标。
  it('有人说话却一镜对白都没有 → 判不达标，并带上整次失败原因', () => {
    const metrics = scoreDeconstruction({ shots: [shot(), shot()], hasAudio: true, failureReason: '对白没取到：没有可用的转写模型' })
    expect(judgeCase(metrics).join()).not.toContain('对白覆盖')
    const misses = judgeCase(metrics, { expectDialogue: true }).join()
    expect(misses).toContain('对白覆盖 0')
    expect(misses).toContain('没有可用的转写模型')
    expect(judgeCase(scoreDeconstruction({ shots: [shot({ dialogue: '你好' })], hasAudio: true }), { expectDialogue: true })).toEqual([])
  })
})

describe('对白字错率（对参考稿里最像的那一段）', () => {
  const reference = '最近真的有人跟我去聊要几万块钱买我的产品虽然最后我没有卖出去但是竟然有人有意向愿意买'
  it('一模一样（含标点 / 大小写差）→ 0', () => {
    expect(bestWindowCer('虽然最后我没有卖出去，', reference)).toBe(0)
    expect(normalizeForCer('Web Coding，API key!')).toBe('webcodingapikey')
  })
  it('错一个字 → 1/长度', () => {
    expect(bestWindowCer('虽然最后我没有买出去', reference)).toBe(0.1)
  })
  it('没文本 → null（不当 0 分）', () => {
    expect(bestWindowCer('', reference)).toBeNull()
  })
})
