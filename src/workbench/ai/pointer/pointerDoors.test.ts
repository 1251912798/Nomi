// 指向元素目录的门岗（搜索测试，独立验收 V-d2-pointer 条件 2）。
//
// 为什么是一条搜索测试：S4「定位只走现役对焦」原来只是此刻的事实（目录里恰好没有视口写口），没有任何东西拦着以后有人加。
// 画布的视口只有一条路能动——对焦事件（`viewNodeInCanvas` → FOCUS_GENERATION_NODE_EVENT，#1277 的唯一算式，缩放封顶 100%、
// 扣掉浮层、闪一下都在那条路里）。指向元素里一旦自己 `setViewport` / `setCenter`，就多了一套没有这些保护的第二条路。
// 按 TypeScript 语法树里的标识符判，不按文本：注释和说明文字里提到这些名字不算。
import fs from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const DIR = new URL('.', import.meta.url)

/** 目录里的生产源码（不含测试）。 */
function productionSources(): Array<{ file: string; source: ts.SourceFile }> {
  return fs.readdirSync(DIR)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((file) => ({
      file,
      source: ts.createSourceFile(file, fs.readFileSync(new URL(file, DIR), 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS),
    }))
}

/** 语法树里所有标识符（变量、属性、方法名）。注释和字符串不是标识符。 */
function identifiersOf(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) names.add(node.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

/** 能直接动画布视口的口（React Flow 的实例方法 + 画布自己的视口调度器 / 写口）。 */
const VIEWPORT_WRITERS = [
  'setViewport', 'setCenter', 'fitView', 'fitBounds', 'zoomTo', 'zoomIn', 'zoomOut', 'panBy', 'panTo', 'setTransform',
  'animateViewportTo', 'setLiveViewport',
] as const

/** 语法树里所有字符串（className 里的类名就在这里；注释不是）。 */
function stringsOf(source: ts.SourceFile): string[] {
  const strings: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return strings
}

describe('pointer directory · the canvas viewport only moves through the existing focus path (S4)', () => {
  it('the directory has production sources to scan (the guard is not vacuous)', () => {
    const files = productionSources().map(({ file }) => file)
    expect(files).toEqual(expect.arrayContaining(['NodePointer.tsx', 'revealNodeFromChat.ts', 'nodePointerStore.ts', 'nodePointerFace.ts']))
  })

  it('no file in src/workbench/ai/pointer/ names a viewport write port', () => {
    const offenders = productionSources().flatMap(({ file, source }) => {
      const names = identifiersOf(source)
      return VIEWPORT_WRITERS.filter((writer) => names.has(writer)).map((writer) => `${file}: ${writer}`)
    })
    expect(offenders, '指向元素要定位只能调 viewNodeInCanvas（revealNodeFromChat），不许自己动画布视口').toEqual([])
  })

  it('the only way out to the canvas is viewNodeInCanvas, called from revealNodeFromChat', () => {
    const callers = productionSources().filter(({ source }) => identifiersOf(source).has('viewNodeInCanvas')).map(({ file }) => file)
    expect(callers).toEqual(['revealNodeFromChat.ts'])
  })
})

// 焦点环（设计系统 §8「全局，别再 per-component 加」）：焦点指示由 tailwind 基础层的 `:root :focus-visible` 一份供给，
// 组件不许自己再加 `focus-visible:ring-*` / `focus-visible:outline-*`（会和全局 2px 环叠成双环；V-d2-pointer 建议 C）。
// 注意这里说的是焦点**环**；悬停 / 聚焦时「画布那个节点同亮」是联动高亮，不在其内。
const OWN_FOCUS_INDICATOR = /(?:^|\s)(?:focus|focus-visible|focus-within)(?::[\w-]+)*:(?:ring|outline|shadow|border)/

describe('pointer directory · focus indication is the global one only (design system §8)', () => {
  it('no class in src/workbench/ai/pointer/ draws its own focus ring, outline, shadow or border', () => {
    const offenders = productionSources().flatMap(({ file, source }) => stringsOf(source)
      .flatMap((text) => text.split(/\s+/).filter((token) => OWN_FOCUS_INDICATOR.test(` ${token}`)))
      .map((token) => `${file}: ${token}`))
    expect(offenders, '焦点环只留全局 outline，别在组件里再加').toEqual([])
  })
})
