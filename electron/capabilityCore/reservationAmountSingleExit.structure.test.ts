// 确认卡上「费用」一行的金额只能从 `reservationMaximumForDisplay`（approvalReceipt.ts）出来（V-mcp 三轮之后的结构解）：
// 不靠扫词条文案证明「没有金额」（正则证不了「没有」），而是证明**金额的来源只有一个出口**。
// 这个守卫遍历 electron/ 的非测试源码：除了 approvalReceipt.ts 自己（校验 + 那个函数），任何文件都不许读 `reservationPreview.maximum`。
// 新入口要展示预算预览金额，只能调函数；直接读字段 = 又一处自己决定「0 还是未知」→ 这里红。
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ELECTRON_ROOT = path.resolve(__dirname, '..')
const ALLOWED = new Set(['capabilityCore/approvalReceipt.ts'])

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full)
    return /\.(?:ts|tsx|mts)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [full] : []
  })
}

describe('reservationPreview.maximum 只有一个出口', () => {
  it('electron 非测试源码里只有 approvalReceipt.ts 读 reservationPreview.maximum', () => {
    const offenders = sources(ELECTRON_ROOT)
      .filter((file) => /reservationPreview\s*\.\s*maximum\b/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ELECTRON_ROOT, file).split(path.sep).join('/'))
      .filter((file) => !ALLOWED.has(file))
    expect(offenders).toEqual([])
  })
})
