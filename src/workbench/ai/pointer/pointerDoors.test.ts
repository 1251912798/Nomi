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
