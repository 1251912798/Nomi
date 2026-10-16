import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 类级普查（按生产文件清单遍历）：生产代码里每一处把 LightweightGenerationNode 当 Suspense 兜底（fallback=）用的地方，都必须传 `loading`，
// 这样兜底态在 DOM 上带 data-node-loading，走查的共享取点入口才分得出「这张卡马上要被整棵换掉」。
// 少传一处，就会有一处点击在换树那一刻丢掉（2026-10-16 main 收据的间歇红）。
const root = path.resolve(__dirname, '../../..')
function productionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return productionFiles(full)
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
  })
}
const fallbackUses = productionFiles(path.join(root, 'workbench'))
  .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }))
  .flatMap(({ file, source }) => [...source.matchAll(/fallback=\{\s*<LightweightGenerationNode([\s\S]*?)\/>/g)].map((match) => ({ file: path.relative(root, file), props: match[1] })))

describe('Suspense 兜底普查', () => {
  it('至少找到画布节点那一处兜底', () => {
    expect(fallbackUses.length).toBeGreaterThan(0)
  })
  it.each(fallbackUses.map((use) => [use.file, use.props] as const))('%s 的兜底带 loading', (_file, props) => {
    expect(props).toMatch(/\bloading\b/)
  })
})
