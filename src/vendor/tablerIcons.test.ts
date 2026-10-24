import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 构建时 vite 把 `@tabler/icons-react` 换成本文件旁边的 tablerIcons.ts（只登记用到的图标，vite.config.ts 的 alias）；
// tsc 和 vitest 却解析真包——源码里用了没登记的图标，类型检查和单测全绿，只有 `pnpm build` 炸（2026-10-18 IconColumns3）。
// 这里把那一步前移：源码里每个从 `@tabler/icons-react` 具名导入的值，都必须在登记表里。

const srcRoot = path.resolve(__dirname, '..')
const registry = fs.readFileSync(path.join(__dirname, 'tablerIcons.ts'), 'utf8')
const registered = new Set([...registry.matchAll(/export \{ default as (\w+) \}/g)].map((match) => match[1]))
const typeOnly = new Set(['Icon', 'IconProps'])

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && full !== path.join(__dirname, 'tablerIcons.ts') ? [full] : []
  })
}

describe('tabler 图标登记表', () => {
  it('源码用到的每个图标都登记了（否则只有构建会炸）', () => {
    const missing: string[] = []
    for (const file of sourceFiles(srcRoot)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@tabler\/icons-react'/g)) {
        if (match[1]) continue
        for (const raw of match[2].split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
          if (!name || raw.trim().startsWith('type ') || typeOnly.has(name)) continue
          if (!registered.has(name)) missing.push(`${path.relative(srcRoot, file)}: ${name}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
