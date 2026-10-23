import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-10-23 用户实测：画布左下「⋯」浮层点开后，点画布中间不收、一直挡着；左栏抽屉、任务中心同因。
// 直接原因：「点外面就收」听的是 document / window 上冒泡的 mousedown，而画布空白处的 d3-zoom 在 mousedown 上
// stopImmediatePropagation——画布上每一次按下都到不了 document。
// 类根因：「点外面」各写各的听法，听在了下面的东西能吃掉的阶段 / 事件上。
// 合同：「点外面」只有一种听法——src/design/outsidePress.ts 的 listenOutsidePress（document 上 pointerdown 捕获阶段）。
//   ① 不许在 document / window 上听 mousedown / touchstart（d3 必吃）；
//   ② 不许用 Mantine 的 useClickOutside（它听的就是 document 冒泡的 mousedown + touchstart）；
//   ③ document / window 上冒泡阶段的 pointerdown 只许减不许增：下面三处没有「点在自己身上」的判据，
//      靠菜单自己 stopPropagation 撑着不被关，换成捕获会让菜单项点不动，要先补判据才能迁。
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const OWNER = 'src/design/outsidePress.ts'
const BUBBLE_POINTERDOWN_BASELINE: Record<string, number> = {
  'src/workbench/creation/DocumentListSidebar.tsx': 1,
  'src/workbench/generationCanvas/reactFlow/useGenerationCanvasReactFlowMenus.ts': 1,
  'src/workbench/generationCanvas/nodes/whiteboard/useWhiteboardSelectionActions.ts': 1,
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const sources = walk(resolve(process.cwd(), 'src')).map((file) => ({ file: relative(process.cwd(), file).split('\\').join('/'), code: stripComments(readFileSync(file, 'utf8')) }))
const PRESS_LISTENER = /\b(?:document|window)\.addEventListener\(\s*['"](mousedown|touchstart|pointerdown)['"]\s*,\s*[\w.]+\s*(,[^)]*)?\)/g

describe('「点外面就收」只有一种听法', () => {
  it('document / window 上没有 mousedown / touchstart 监听', () => {
    const offenders = sources.flatMap(({ file, code }) => [...code.matchAll(PRESS_LISTENER)].filter((match) => match[1] !== 'pointerdown').map(() => file))
    expect(offenders).toEqual([])
  })

  it('不用 Mantine 的 useClickOutside', () => {
    expect(sources.filter(({ code }) => /import[^;]*\buseClickOutside\b[^;]*from\s*['"]@mantine\/hooks['"]/.test(code)).map(({ file }) => file)).toEqual([])
  })

  it('冒泡阶段的 pointerdown 只许减不许增', () => {
    const counts: Record<string, number> = {}
    for (const { file, code } of sources) {
      for (const match of code.matchAll(PRESS_LISTENER)) {
        const options = match[2] ?? ''
        if (match[1] !== 'pointerdown' || /\btrue\b|capture:\s*true/.test(options)) continue
        counts[file] = (counts[file] ?? 0) + 1
      }
    }
    for (const [file, count] of Object.entries(counts)) expect({ file, count }).toEqual({ file, count: Math.min(count, BUBBLE_POINTERDOWN_BASELINE[file] ?? 0) })
  })

  it('owner 听的是 document 上捕获阶段的 pointerdown', () => {
    const owner = sources.find(({ file }) => file === OWNER)?.code ?? ''
    expect(owner).toMatch(/document\.addEventListener\('pointerdown',\s*\w+,\s*true\)/)
    expect(owner).toMatch(/document\.removeEventListener\('pointerdown',\s*\w+,\s*true\)/)
  })
})
