import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-10-17（#1189 审查 F7）：浮层跟锚点曾靠 `autoUpdate({ animationFrame: true })`——面板开着的每一帧都读一次锚点矩形，
// 空闲时实测 165 次读取 / 秒、约 2% 主线程，而不开它走 Floating UI 自带的 IntersectionObserver（layoutShift），动态锚点走查的结果完全一样。
// 类根因：「为不漏某一类运动源，把监听换成常开轮询」，每个新消费者都能再点一次。
// 合同：anchored 浮层的跟踪只有一个入口（AnchoredPopover 里的 autoUpdate），且不带 animationFrame 选项；
// 别处不许直接 import autoUpdate，也就不会有第二条定位链路。
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const OWNER = 'src/design/AnchoredPopover.tsx'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const sources = walk(resolve(process.cwd(), 'src')).map((file) => ({ file: relative(process.cwd(), file).split('\\').join('/'), code: stripComments(readFileSync(file, 'utf8')) }))

describe('浮层跟踪不靠逐帧轮询', () => {
  it('只有 AnchoredPopover 用 autoUpdate', () => {
    expect(sources.filter(({ code }) => /import[^;]*\bautoUpdate\b[^;]*from\s*['"]@floating-ui\//.test(code)).map(({ file }) => file)).toEqual([OWNER])
  })

  it('autoUpdate 不带 animationFrame 选项', () => {
    expect(sources.filter(({ file, code }) => file === OWNER && /\banimationFrame\s*:/.test(code)).map(({ file }) => file)).toEqual([])
  })

  it('公开的浮层属性里没有「逐帧跟踪」开关', () => {
    expect(sources.find(({ file }) => file === OWNER)?.code).not.toMatch(/\btrackTransforms\b/)
  })
})
