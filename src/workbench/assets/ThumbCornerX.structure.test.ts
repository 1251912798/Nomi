// 缩略图角上的 ×：样子只在 ThumbCornerX 一处定义。
//
// 付费卡板 card.pointer.exclude 写的是「和输入框里参考图的 × 同一个样子」；上一轮付费卡自己画了一颗白底灰叉的胶囊，
// 报告说「一致」、放大看图才发现是两颗（2026-10-25）。把「同一个样子」从「靠人眼对」变成「只有一份定义、用的人只能引用它」：
// 两处使用方（参考图 tile、付费卡格子）都得 import 共用件、都不许自己再写圆点的类名或 IconX。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const shared = stripComments(read('src/workbench/assets/ThumbCornerX.tsx'))
const consumers = {
  'AssetTile（输入框里的参考图）': stripComments(read('src/workbench/assets/AssetTile.tsx')),
  'AgentPanelV4SpendCardBody（付费卡的格子）': stripComments(read('src/workbench/ai/v4/AgentPanelV4SpendCardBody.tsx')),
}

describe('缩略图角上的 ×：只有一份定义', () => {
  it('共用件：28px 点击区里一颗 16px 黑底白叉圆（IconX 12 / 2.67），带 data-thumb-corner-x 标记（走查数它）', () => {
    expect(shared).toContain('data-thumb-corner-x')
    expect(shared).toMatch(/\bsize-7\b/)
    expect(shared).toMatch(/\bsize-4\b/)
    expect(shared).toContain('rounded-full bg-nomi-ink text-nomi-paper')
    expect(shared).toMatch(/<IconX size=\{12\} stroke=\{2\.67\}/)
  })

  it.each(Object.entries(consumers))('%s 引用共用件，不抄样子', (_name, source) => {
    expect(source).toMatch(/import \{ ThumbCornerX \} from '[./]+(?:assets\/)?ThumbCornerX'/)
    expect(source).toContain('<ThumbCornerX')
    // 圆点的类名、叉的图标都只许出现在共用件里。
    expect(source).not.toContain('IconX')
    expect(source).not.toContain('rounded-full bg-nomi-ink text-nomi-paper')
    expect(source).not.toMatch(/\bsize-4\b[^'"`]*rounded-full/)
  })
})
