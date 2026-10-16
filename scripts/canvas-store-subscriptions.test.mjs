// 画布整表订阅的两条保险（方向检查 docs/engineering/direction-checks/2026-10-16-canvas-shell-subscriptions.md）：
// ① 名单内每个文件的处数**等于**名单记的数：多了红（只减不增），少了也红（收窄后把名单降下来，不留虚数）；名单外出现也红。
// ② ESLint 规则真的接在源码上：名单外文件的整表订阅报错；画布壳订阅选区（数组 / 张数 / 有没有）报错，壳的窄选择器不报。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import tseslint from 'typescript-eslint'

import {
  CANVAS_SHELL_FILE,
  WHOLE_TABLE_SUBSCRIPTION_BASELINE,
  WHOLE_TABLE_SUBSCRIPTION_SELECTORS,
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

// 计数和 lint 用**同一组语法树选择器**（不另写正则）：只开这一条规则、不读仓库 eslint 配置，名单内的文件也照数。
const counter = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-restricted-syntax': ['error', ...WHOLE_TABLE_SUBSCRIPTION_SELECTORS] },
  },
})
async function countWholeTableSubscriptions(source, filePath) {
  const [result] = await counter.lintText(source, { filePath })
  return new Set(result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => `${m.line}:${m.column}`)).size
}

describe('画布 nodes / edges 整表订阅：存量冻结，只减不增', () => {
  it('src 下每个文件的整表订阅处数（按语法树数）与名单逐一相等', async () => {
    const actual = {}
    for (const file of sourceFiles(path.join(root, 'src'))) {
      const source = fs.readFileSync(file, 'utf8')
      // 只解析可能有订阅的文件（纯文本预筛，不参与判定）。
      if (!/useGenerationCanvasStore|use(?:Nodes|Edges)/.test(source)) continue
      const count = await countWholeTableSubscriptions(source, file)
      if (count > 0) actual[path.relative(root, file).replaceAll(path.sep, '/')] = count
    }
    expect(actual).toEqual({ ...WHOLE_TABLE_SUBSCRIPTION_BASELINE })
  }, 120_000)

  it('等价写法都认得（V-1211 的三种绕过 + 包一层的写法），按 id / 标量 / 判断位置不认', async () => {
    const probe = (body) => countWholeTableSubscriptions(`import { useGenerationCanvasStore } from './s'
export const x = ${body}
`, path.join(root, 'src/probe.ts'))
    for (const body of [
      'useGenerationCanvasStore((state) => state.nodes)',
      'useGenerationCanvasStore(s => s.edges)',
      'useGenerationCanvasStore(s => { return s.nodes })',
      'useGenerationCanvasStore(({ nodes }) => nodes)',
      "useGenerationCanvasStore(s => s['nodes'])",
      'useGenerationCanvasStore(({ edges: list }) => { return list })',
      'useGenerationCanvasStore(function (s) { return s.nodes })',
      'useGenerationCanvasStore((s) => s.nodes as readonly unknown[])',
      'useGenerationCanvasStore((s) => s.edges ?? [])',
      'useGenerationCanvasStore((s) => (s.ready ? s.nodes : []))',
      'useNodes()',
    ]) expect(await probe(body), body).toBe(1)
    for (const body of [
      'useGenerationCanvasStore((state) => state.nodes.length)',
      'useGenerationCanvasStore((state) => selectCanvasNodeById(state, id))',
      'useGenerationCanvasStore((state) => state.nodes.find((node) => node.id === id))',
      'useGenerationCanvasStore((s) => (s.nodes.length ? 1 : 0))',
      'useGenerationCanvasStore(({ nodes }) => nodes.length)',
    ]) expect(await probe(body), body).toBe(0)
  }, 60_000)
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
      '  const blockBody = useGenerationCanvasStore((s) => { return s.nodes })',
      '  const destructured = useGenerationCanvasStore(({ nodes }) => nodes)',
      "  const bracket = useGenerationCanvasStore((s) => s['edges'])",
      '  return [nodes, edges, one, blockBody, destructured, bracket]',
      '}',
      '',
    ].join('\n')
    expect(await restricted(source, 'src/workbench/generationCanvas/nodes/wholeTableProbe.ts')).toEqual([3, 4, 6, 7, 8])
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
