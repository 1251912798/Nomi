import { describe, expect, it } from 'vitest'
import { hasEmptyCardLabel } from './emptyCardLabel'

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
const filledDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }

describe('hasEmptyCardLabel: 空卡在任何生成状态都带框外标签行（不看 status）', () => {
  it('空卡片：有标签行；有结果图的卡片：没有', () => {
    expect(hasEmptyCardLabel({ isCardKind: true, isTextKind: false, hasResult: false })).toBe(true)
    expect(hasEmptyCardLabel({ isCardKind: true, isTextKind: false, hasResult: true })).toBe(false)
  })
  it('空文本卡有、有正文的文本卡没有', () => {
    expect(hasEmptyCardLabel({ isCardKind: false, isTextKind: true, hasResult: false, contentJson: emptyDoc as never })).toBe(true)
    expect(hasEmptyCardLabel({ isCardKind: false, isTextKind: true, hasResult: false, contentJson: filledDoc as never })).toBe(false)
  })
})
