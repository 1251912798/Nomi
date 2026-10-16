// 去蓝色描边棘轮的自证：真违规抓得到、合规写法不误伤。
import { describe, expect, it } from 'vitest'

import { countAccentOutlineInLine, countAccentOutlineInText, findAccentAliasedTokens } from './lib/accentOutlineScan.mjs'

describe('countAccentOutlineInLine', () => {
  it('抓住强调色用在 border / outline / ring / divide 上的类名（含前缀、透明度）', () => {
    for (const cls of [
      'border-nomi-accent',
      'hover:border-nomi-accent',
      'focus:border-nomi-accent',
      'focus-visible:outline-nomi-accent',
      'ring-2 ring-nomi-accent',
      'border-nomi-accent/30',
      'border-t-nomi-accent',
      'border-nomi-accent-soft',
      'ring-nomi-info-edge',
      'border-workbench-accent',
    ]) {
      expect(countAccentOutlineInLine(`<div className="${cls}" />`), cls).toBe(1)
    }
  })

  it('抓住任意值写法和阴影描边', () => {
    expect(countAccentOutlineInLine("'focus-visible:ring-[var(--nomi-accent)]'")).toBe(1)
    expect(countAccentOutlineInLine("'border-[color-mix(in_srgb,var(--workbench-accent)_22%,transparent)]'")).toBe(1)
    expect(countAccentOutlineInLine("'shadow-[0_0_0_3px_var(--nomi-accent-soft)]'")).toBe(1)
  })

  it('抓住 CSS / 行内样式声明', () => {
    expect(countAccentOutlineInLine('  border-left: 3px solid color-mix(in srgb, var(--workbench-accent) 34%, transparent);')).toBe(1)
    expect(countAccentOutlineInLine("style={{ boxShadow: '0 0 0 2px var(--nomi-accent)' }}")).toBe(1)
    expect(countAccentOutlineInLine('  outline: 3px solid var(--nomi-accent);')).toBe(1)
    expect(countAccentOutlineInLine("      'border-color': 'var(--nomi-accent)',")).toBe(1)
  })

  it('不误伤：文字色 / 底色 / 连线握把 stroke / 灰线 / 深色焦点环 / info 文字', () => {
    for (const ok of [
      'text-nomi-accent bg-nomi-accent-soft',
      'hover:bg-nomi-accent',
      'border-nomi-line hover:border-nomi-ink-30',
      'focus-visible:outline-nomi-ink focus-visible:ring-nomi-ink',
      'text-nomi-info-ink bg-nomi-info-soft',
      '  stroke: var(--nomi-accent);',
      '  --xy-edge-stroke-selected: var(--nomi-accent);',
    ]) {
      expect(countAccentOutlineInLine(ok), ok).toBe(0)
    }
  })

  it('注释里提到类名不算', () => {
    expect(countAccentOutlineInLine("// 旧写法 'border-nomi-accent'")).toBe(0)
    expect(countAccentOutlineInLine(' * border-nomi-accent')).toBe(0)
  })
})

describe('countAccentOutlineInText', () => {
  it('逐行累加', () => {
    expect(countAccentOutlineInText('a border-nomi-accent\nb\nc ring-nomi-accent')).toBe(2)
  })
})

describe('findAccentAliasedTokens', () => {
  it('--nomi-focus / --nomi-info 别名到强调色 → 违规', () => {
    expect(findAccentAliasedTokens("'--nomi-focus': 'color-mix(in srgb, var(--nomi-accent) 42%, transparent)',", 'x')).toHaveLength(1)
    expect(findAccentAliasedTokens('  --nomi-info: var(--nomi-accent);', 'x')).toHaveLength(1)
  })
  it('改成深色（ink）后放行', () => {
    expect(findAccentAliasedTokens("'--nomi-focus': 'color-mix(in srgb, var(--nomi-ink) 70%, transparent)',", 'x')).toHaveLength(0)
  })
})
