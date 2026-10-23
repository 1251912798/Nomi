// 付费走查 composer-b3-reference.paid.mjs 花钱前那道「界面标的在用 / 未用到」核对，先零花费验一遍：
// 拿**生产组件** AssetReference（B3 生成框参考行）的服务端渲染喂 readComposerReferences / judgeComposerReferences，
// props 照 NodeParameterControls 在首尾帧方式下交给它的那一份摆（首帧、尾帧两格 + 3 张未用到）。
// 组件改了锚点（data-reference-unused / data-asset-slot / data-asset-tile）或嵌套，这里先红，不等付费那一刻。
// 另钉一条：步骤本体在点 ↑ 之前真的跑这道判、判不过就抛（反例：删掉花钱前的界面核对，这里红）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import AssetReference from '../../src/workbench/assets/AssetReference'
import { fileMapper, judgeComposerReferences, readComposerReferences } from './_composerReferenceRow.mjs'
import { UI_LOCALES, uiText } from './full-walk/invariants.mjs'

vi.mock('react-i18next', async (original) => ({
  ...await original(),
  useTranslation: () => ({ t: (key) => key }),
}))

const PROJECT = 'project-paid-b3'
const REFS = ['ref-1.png', 'ref-2.png', 'ref-3.png']
const FILES = [...REFS, 'first.png', 'last.png']
const url = (file) => `nomi-local://asset/${PROJECT}/assets/imported/${file}`
const fileOf = fileMapper(FILES, url)
const SCENE = { frames: [{ slot: 'firstFrameUrl', file: 'first.png' }, { slot: 'lastFrameUrl', file: 'last.png' }], unused: REFS, fileOf, unusedLabels: ['assetLibrary.refRow.unused'] }

// NodeParameterControls 在 Seedance 2.0（apimart）首尾帧方式下的单图格：首帧、尾帧（尾帧 min 0 → 「可不填」）。
const frameSlot = (key, label, optional) => ({ key, label, accept: 'image', form: 'single', persistAsEdge: true, numbered: false, max: 1, optional })
const FRAME_SLOTS = [frameSlot('firstFrameUrl', '首帧', false), frameSlot('lastFrameUrl', '尾帧', true)]
const ARRAY_SLOT = { key: 'referenceImageUrls', label: '角色参考', accept: 'image', form: 'array', persistAsEdge: false, numbered: true, max: 9 }

/** 生产组件渲染出来的参考行，外面套一层和画布上一样的生成框壳（pageReadComposer 取的就是这一层的 outerHTML）。 */
function composerHtml(props) {
  const row = renderToStaticMarkup(React.createElement(AssetReference, {
    projectId: PROJECT, openSlotKey: '', uploadingSlotKey: '',
    onTogglePicker: vi.fn(), onPick: vi.fn(), onUpload: vi.fn(), onRemove: vi.fn(), onPickOnCanvas: vi.fn(),
    ...props,
  }))
  return { composers: 1, html: `<div class="generation-canvas-v2-node__composer nokey" data-composer-host="canvas"><div data-node-composer-references>${row}</div></div>` }
}
const firstLast = (overrides = {}) => composerHtml({
  slots: FRAME_SLOTS,
  valuesByKey: { firstFrameUrl: url('first.png'), lastFrameUrl: url('last.png') },
  unusedUrls: REFS.map(url), parkedUrls: new Set(), onRemoveUnused: vi.fn(), onUseParked: vi.fn(), onSwapFrames: vi.fn(),
  ...overrides,
})
const judge = (read) => judgeComposerReferences(readComposerReferences(read), SCENE)

describe('生成框参考行的「在用 / 未用到」：生产组件 AssetReference 的服务端渲染', () => {
  it('首尾帧方式：首帧、尾帧两格在用，3 张参考标「未用到」→ 判过，摘要写清谁在用、谁没用到', () => {
    const verdict = judge(firstLast())
    expect(verdict.problems).toEqual([])
    expect(verdict.summary.inUse).toEqual({ firstFrameUrl: ['first.png'], lastFrameUrl: ['last.png'] })
    expect([...verdict.summary.unused].sort()).toEqual(REFS)
    expect(verdict.summary.arrayInUse).toEqual([])
    expect(verdict.summary.parked).toEqual([])
    expect(verdict.summary.slotLabels).toEqual(['首帧', 'assetLibrary.refRow.lastFrameOptional'])
  })

  it('反例：还停在参考方式（5 张都进参考数组、标为在用）→ 判红，点名首尾帧格不对、数组里有在用的、未用到不对', () => {
    const verdict = judge(composerHtml({ slots: [ARRAY_SLOT], valuesByKey: { referenceImageUrls: ['first.png', 'last.png', ...REFS].map(url) } }))
    const text = verdict.problems.join('\n')
    expect(text).toMatch(/单图格是 \[没有\]/)
    expect(text).toMatch(/参考数组里还有 5 张标为在用/)
    expect(text).toMatch(/标「未用到」的是 （没有）/)
  })

  it('反例：只有 2 张标「未用到」（第 3 张被当成在用 / 丢了）→ 判红', () => {
    const verdict = judge(firstLast({ unusedUrls: REFS.slice(0, 2).map(url) }))
    expect(verdict.problems.join('\n')).toMatch(/标「未用到」的是 ref-1\.png、ref-2\.png，应恰好是 ref-1\.png、ref-2\.png、ref-3\.png/)
  })

  it('反例：首帧格空着、或首尾帧对调 → 判红', () => {
    expect(judge(firstLast({ valuesByKey: { lastFrameUrl: url('last.png') } })).problems.join('\n')).toMatch(/「firstFrameUrl」格里标为在用的是 （空）/)
    const swapped = judge(firstLast({ valuesByKey: { firstFrameUrl: url('last.png'), lastFrameUrl: url('first.png') } })).problems.join('\n')
    expect(swapped).toMatch(/「firstFrameUrl」格里标为在用的是 last\.png/)
    expect(swapped).toMatch(/「lastFrameUrl」格里标为在用的是 first\.png/)
  })

  it('反例：未用到里混进一张场景外的图 → 判红并点名', () => {
    const verdict = judge(firstLast({ unusedUrls: [...REFS, 'nomi-local://asset/other/assets/stray.png'].map((item) => (item.includes('://') ? item : url(item))) }))
    expect(verdict.problems.join('\n')).toMatch(/对不回场景里的文件：\?stray\.png/)
  })

  it('旧工程残留（先放一边，data-reference-parked）也是「未用到」：判过，摘要单列出来', () => {
    const verdict = judge(firstLast({ parkedUrls: new Set([url('ref-2.png')]) }))
    expect(verdict.problems).toEqual([])
    expect(verdict.summary.parked).toEqual(['ref-2.png'])
  })

  it('没选中（没有生成框）/ 两张生成框 / 两行参考 → 判红', () => {
    expect(judgeComposerReferences(readComposerReferences({ composers: 0, html: '' }), SCENE).problems.join('\n')).toMatch(/生成框有 0 张[\s\S]*参考行有 0 行/)
    const doubled = firstLast()
    expect(judge({ ...doubled, composers: 2 }).problems.join('\n')).toMatch(/生成框有 2 张/)
    const twoRows = { composers: 1, html: `<div>${doubled.html}${doubled.html}</div>` }
    expect(judge(twoRows).problems.join('\n')).toMatch(/参考行有 2 行/)
  })
})

describe('浏览器 outerHTML 的写法也读得出（img 不自闭合、属性顺序不同、属性值里有 > 和实体）', () => {
  // 真界面上的字从词典取（中文界面那一份），不在测试里另抄一份文案。
  const zh = (key) => uiText('zh-CN', key)
  const UNUSED_LABELS = UI_LOCALES.map((locale) => uiText(locale, 'assetLibrary.refRow.unused'))
  const tile = (file) => `<div class="group/tile relative h-10 w-10 opacity-40" data-asset-tile="image"><span class="x"><img loading="lazy" alt="${file}" src="${url(file)}" decoding="async" class="w-full h-full"></span></div>`
  const live = [
    '<div class="generation-canvas-v2-node__composer" data-composer-host="canvas">',
    '<div class="flex [&>svg]:size-4" data-reference-row="true">',
    `<div class="ml-3" data-asset-slot="firstFrameUrl">${tile('first.png').replace(' opacity-40', '')}<span data-asset-slot-label="true">首帧</span></div>`,
    `<div data-asset-slot="lastFrameUrl" class="x">${tile('last.png').replace(' opacity-40', '')}<span data-asset-slot-label="true">${zh('assetLibrary.refRow.lastFrameOptional')}</span></div>`,
    ...REFS.map((file) => `<div class="flex" data-reference-unused="true" title="a &gt; b &amp; c">${tile(file)}<span>${zh('assetLibrary.refRow.unused')}</span></div>`),
    `<span data-reference-tail="true">${zh('assetLibrary.refRow.unusedNote')}</span></div></div>`,
  ].join('')
  it('读出首帧、尾帧两格与 3 个未用到，判过', () => {
    const verdict = judgeComposerReferences(readComposerReferences({ composers: 1, html: live }), { ...SCENE, unusedLabels: UNUSED_LABELS })
    expect(verdict.problems).toEqual([])
    expect(verdict.summary.slotLabels).toEqual(['首帧', zh('assetLibrary.refRow.lastFrameOptional')])
  })
  it('小图没出图（NomiImage 加载失败换成了占位，没有 img）→ 判红', () => {
    const broken = live.replace(`<img loading="lazy" alt="ref-3.png" src="${url('ref-3.png')}" decoding="async" class="w-full h-full">`, `<div title="x" aria-label="${zh('assetLibrary.expiredReference')}">${zh('assetLibrary.expiredReference')}</div>`)
    const verdict = judgeComposerReferences(readComposerReferences({ composers: 1, html: broken }), { ...SCENE, unusedLabels: UNUSED_LABELS })
    expect(verdict.problems.join('\n')).toMatch(/第 3 个「未用到」格里有 1 张小图、0 张出了图/)
  })
})

describe('fileMapper：小图地址对回场景文件', () => {
  it('完整本地地址（含查询串）、按文件名、对不回', () => {
    expect(fileOf(url('ref-1.png'))).toBe('ref-1.png')
    expect(fileOf(`${url('first.png')}?v=2`)).toBe('first.png')
    expect(fileOf('nomi-local://asset/elsewhere/last.png')).toBe('last.png')
    expect(fileOf('nomi-local://asset/elsewhere/%E6%96%B0.png')).toBeNull()
    expect(fileOf('https://cdn.example/unknown.png')).toBeNull()
  })
})

describe('付费样本花钱前真的核界面状态（反例：删掉这道判，这里红）', () => {
  it('步骤本体在点 ↑ 之前读选中镜头的生成框参考行、判过才往下走；判出的问题并进花钱前的那一次抛错', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
    const source = fs.readFileSync(path.join(repoRoot, 'tests/ux/_composerB3ReferenceSteps.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // 红了就点名「花钱前不核界面状态」：协调看报错就知道这条付费样本又退回了只核 store 的老样子。
    const NOT_CHECKED = '花钱前不核界面状态'
    // 读：页面里取生成框 → 拆 → 判（不是截图了事）。
    expect(source, `${NOT_CHECKED}：步骤本体里没有「页面里取生成框 → 拆 → 判」这一道`).toMatch(/judgeComposerReferences\(readComposerReferences\(await win\.evaluate\(pageReadComposer, shotId\)\)/)
    const read = source.indexOf('await readComposerUntilSettled(win, shotId')
    const merged = source.indexOf('problems.push(...shown.problems)')
    const thrown = source.indexOf('花钱前核对没过（一分钱没花）')
    const spend = source.indexOf('clickOrFail(generateButton')
    expect([read, merged, thrown, spend].every((index) => index > -1), `${NOT_CHECKED}：读 / 并进问题 / 抛错 / 点 ↑ 缺了一步 ${JSON.stringify({ read, merged, thrown, spend })}`).toBe(true)
    expect(read < merged && merged < thrown && thrown < spend, `${NOT_CHECKED}：顺序应是读 → 并进问题 → 抛错 → 才点 ↑`).toBe(true)
  })
})
