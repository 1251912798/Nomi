// 画布整表订阅的两条保险（方向检查 docs/engineering/direction-checks/2026-10-16-canvas-shell-subscriptions.md）：
// ① 名单内每个文件的处数**等于**名单记的数：多了红（只减不增），少了也红（收窄后把名单降下来，不留虚数）；名单外出现也红。
// ② ESLint 规则真的接在源码上：名单外文件的整表订阅报错；画布壳订阅选区（数组 / 张数 / 有没有）报错，壳的窄选择器不报。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import {
  CANVAS_SHELL_FILE,
  WHOLE_TABLE_SUBSCRIPTION_BASELINE,
  countWholeTableSubscriptions,
} from './canvas-store-subscriptions.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('画布 nodes / edges 整表订阅：存量冻结，只减不增', () => {
  it('src 下每个文件的整表订阅处数与名单逐一相等', () => {
    const actual = {}
    for (const file of sourceFiles(path.join(root, 'src'))) {
      const count = countWholeTableSubscriptions(fs.readFileSync(file, 'utf8'))
      if (count > 0) actual[path.relative(root, file).replaceAll(path.sep, '/')] = count
    }
    expect(actual).toEqual({ ...WHOLE_TABLE_SUBSCRIPTION_BASELINE })
  })

  it('计数口径认得常见写法，不认按 id / 标量的窄选择器', () => {
    expect(countWholeTableSubscriptions('const a = useGenerationCanvasStore((state) => state.nodes)')).toBe(1)
    expect(countWholeTableSubscriptions('const a = useGenerationCanvasStore(s => s.edges)')).toBe(1)
    expect(countWholeTableSubscriptions('const a = useNodes()')).toBe(1)
    expect(countWholeTableSubscriptions('const a = useGenerationCanvasStore((state) => state.nodes.length)')).toBe(0)
    expect(countWholeTableSubscriptions('const a = useGenerationCanvasStore((state) => selectCanvasNodeById(state, id))')).toBe(0)
  })
})

describe('ESLint 规则接在源码上', () => {
  const eslint = new ESLint({ cwd: root })
  const restricted = async (source, file) => {
    const [result] = await eslint.lintText(source, { filePath: path.join(root, file) })
    return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').map((message) => message.line)
  }

  it('名单外的文件整表订阅 nodes / edges 报错，按 id 的选择器不报', async () => {
    const source = [
      "import { useGenerationCanvasStore } from './store'",
      'export function useProbe(id: string) {',
      '  const nodes = useGenerationCanvasStore((state) => state.nodes)',
      '  const edges = useGenerationCanvasStore((s) => s.edges)',
      '  const one = useGenerationCanvasStore((state) => state.nodes.find((node) => node.id === id))',
      '  return [nodes, edges, one]',
      '}',
      '',
    ].join('\n')
    expect(await restricted(source, 'src/workbench/generationCanvas/nodes/wholeTableProbe.ts')).toEqual([3, 4])
  }, 60_000)

  it('画布壳订阅选区（数组 / 张数 / 有没有）报错，结果只在变时才变的窄选择器不报', async () => {
    const source = [
      "import { useGenerationCanvasStore } from '../store/generationCanvasStore'",
      'export function Probe() {',
      '  const a = useGenerationCanvasStore((state) => state.selectedNodeIds)',
      '  const b = useGenerationCanvasStore((state) => state.selectedNodeIds.length)',
      '  const c = useGenerationCanvasStore((state) => state.selectedNodeIds.length > 0)',
      '  const d = useGenerationCanvasStore((state) => resolveGroup(state.selectedNodeIds))',
      '  return [a, b, c, d]',
      '}',
      '',
    ].join('\n')
    expect(await restricted(source, CANVAS_SHELL_FILE)).toEqual([3, 4, 5])
  }, 60_000)
})
