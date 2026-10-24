// R-B6 `chat-card-no-import-node-editor` 的反例单测：在一棵临时的小仓库上跑同一条 dependency-cruiser 规则（规则本身从
// .dependency-cruiser.mjs 读，不抄第二份），聊天卡片一 import 节点编辑器就必须报；读节点的纯函数、设计实验室、
// 画布自己 import 编辑器都不报。规则的来由见 .dependency-cruiser.mjs 的 R-B6 注释（设计系统 §1.0）。
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cruise } from 'dependency-cruiser'
import ruleConfig, { NODE_EDITOR_MODULES } from '../.dependency-cruiser.mjs'
import { cleanupTestTemp, makeTempDir } from './_test-temp.mjs'

const RULE = ruleConfig.forbidden.find((rule) => rule.name === 'chat-card-no-import-node-editor')
const NODES = 'src/workbench/generationCanvas/nodes'

/** 临时仓库里的一个文件：内容就是那一行 import（或一个空导出）。 */
const write = (root, file, body) => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, `${body}\nexport const marker = 1\n`)
}
const importOf = (from, to) => {
  const spec = path.posix.relative(path.posix.dirname(from), to).replace(/\.tsx?$/, '')
  return `import { marker as imported } from '${spec.startsWith('.') ? spec : `./${spec}`}'\nvoid imported`
}

let root
beforeAll(() => {
  root = makeTempDir('nomi-chat-card-boundary-')
  // 被 import 的那一侧：清单里的每一个编辑器模块、controls/ 下的一个控件组件，外加两个读节点的纯函数。
  for (const name of NODE_EDITOR_MODULES) write(root, `${NODES}/${name}.tsx`, '')
  write(root, `${NODES}/controls/QuantitySelect.tsx`, '')
  write(root, `${NODES}/controls/parameterControlModel.ts`, '')
  write(root, `${NODES}/aspectRatio.ts`, '')
})
afterAll(() => cleanupTestTemp(root))

async function violationsFor(from, to) {
  write(root, from, importOf(from, to))
  // baseDir 下的相对路径：规则的 path 正则按仓库相对路径认（和 check-boundaries 跑真仓库时同一种路径）。
  const result = await cruise([from], {
    baseDir: root,
    validate: true,
    ruleSet: { forbidden: [RULE] },
    tsPreCompilationDeps: true,
    outputType: 'json',
  })
  fs.rmSync(path.join(root, from))
  const output = typeof result.output === 'string' ? JSON.parse(result.output) : result.output
  return output.summary.violations.map((violation) => `${violation.from} -> ${violation.to}`)
}

describe('R-B6：聊天卡片不许引用节点编辑器（规则清单矩阵）', () => {
  it('规则在 .dependency-cruiser.mjs 里、是 error、从 Agent 面板出发', () => {
    expect(RULE).toBeDefined()
    expect(RULE.severity).toBe('error')
    expect(RULE.from.path).toBe('^src/workbench/ai/')
  })

  // 编辑器清单里的每一个模块：付费卡（v4）、指向元素（pointer）、面板外壳各 import 一次，都要报。
  const CARD_SIDES = ['src/workbench/ai/v4/FakeSpendCard.tsx', 'src/workbench/ai/pointer/FakePointer.tsx', 'src/workbench/ai/FakeResidentShell.tsx']
  const EDITOR_ROWS = [...NODE_EDITOR_MODULES.map((name) => `${NODES}/${name}.tsx`), `${NODES}/controls/QuantitySelect.tsx`]
    .flatMap((to) => CARD_SIDES.map((from) => ({ from, to })))
  it.each(EDITOR_ROWS)('$from import $to → 报', async ({ from, to }) => {
    expect(await violationsFor(from, to)).toEqual([`${from} -> ${to}`])
  })

  it('纯类型导入也报（类型住在编辑器里，卡就在照编辑器的形状长）', async () => {
    const from = 'src/workbench/ai/v4/FakeTypeOnly.ts'
    write(root, from, "import type { marker } from '../../generationCanvas/nodes/InlineParameterBar'\nexport type Shape = typeof marker")
    const result = await cruise([from], { baseDir: root, validate: true, ruleSet: { forbidden: [RULE] }, tsPreCompilationDeps: true, outputType: 'json' })
    fs.rmSync(path.join(root, from))
    const output = typeof result.output === 'string' ? JSON.parse(result.output) : result.output
    expect(output.summary.violations.map((violation) => violation.to)).toEqual([`${NODES}/InlineParameterBar.tsx`])
  })

  // 不该报的：卡读节点的纯函数（D2 的设计就是卡读节点）、设计实验室搭编辑器的格子、画布自己的生成框。
  it.each([
    { from: 'src/workbench/ai/v4/FakeSpendCardReader.ts', to: `${NODES}/controls/parameterControlModel.ts`, why: '读节点参数的纯函数' },
    { from: 'src/workbench/ai/pointer/FakePointerFace.ts', to: `${NODES}/aspectRatio.ts`, why: '比例读法' },
    { from: 'src/devlab/designLab/fake/FakeLab.tsx', to: `${NODES}/InlineParameterBar.tsx`, why: '设计实验室不在 Agent 面板里' },
    { from: `${NODES}/FakeCanvasNode.tsx`, to: `${NODES}/NodeGenerationComposer.tsx`, why: '画布自己挂生成框' },
  ])('$from import $to（$why）→ 不报', async ({ from, to }) => {
    expect(await violationsFor(from, to)).toEqual([])
  })
})
