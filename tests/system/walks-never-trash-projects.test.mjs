import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// ⑭ 起，产品的「删除项目」会把文件夹放进运行者电脑的系统回收站（shell.trashItem）。走查 / 脚本跑在开发者或用户的
// 真机上，收尾要是走产品删除，就会往这台电脑的回收站塞测试垃圾（协调 10-23）。规则：走查建的项目都在自己的隔离
// 临时根里，收尾删临时根（launchNomiApp 的 close() → cleanupTempRoot）；不许调产品删除口，也不许直接调 trashItem。
// 单测（*.test.ts）里 electron 是假的、回收站是临时目录，不在这条的范围里。
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..')
const ROOTS = ['tests/ux', 'tests/system', 'scripts', 'evals', 'docs/evidence']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'perf-results', 'shots'])
const FORBIDDEN = [
  { pattern: /nomiDesktop\.projects\.delete\s*\(/, why: '调了产品的删除项目口（会进系统回收站）' },
  { pattern: /['"]nomi:projects:delete['"]/, why: '直接点名产品删除 IPC 通道' },
  { pattern: /shell\.trashItem\s*\(/, why: '直接往系统回收站里放东西' },
]
const SELF = 'tests/system/walks-never-trash-projects.test.mjs'

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out)
    } else if (/\.(mjs|cjs|js|mts|cts)$/.test(entry.name) || /\.walk\.|\.e2e\./.test(entry.name)) {
      out.push(path.join(dir, entry.name))
    }
  }
  return out
}

describe('走查与脚本收尾不往系统回收站里扔东西', () => {
  it('tests/ux、tests/system、scripts、evals、docs/evidence 里没有任何产品删除调用或 trashItem', () => {
    const hits = []
    for (const root of ROOTS) {
      for (const file of walk(path.join(repoRoot, root))) {
        const rel = path.relative(repoRoot, file).split(path.sep).join('/')
        if (rel === SELF) continue
        const source = fs.readFileSync(file, 'utf8')
        for (const rule of FORBIDDEN) if (rule.pattern.test(source)) hits.push(`${rel}：${rule.why}`)
      }
    }
    expect(hits).toEqual([])
  })
})
