import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../../scripts/framework-boundary-lib.mjs'

/**
 * 隐藏的分镜工作区不跟当前文稿重渲染（性能场景 document-switch-after-storyboard）。
 *
 * 病根：分镜页访问过之后，它被保留在隐藏槽里（只有 `hidden` 属性），仍订阅 activeDocumentId / 方案，
 * 切文稿时 320 行编辑器在背后卸载再重挂（真机 7s+）。治法是 React 自带的 <Activity mode="hidden">：
 * 子树冻结、effect 全卸、更新降到最低优先级。真判据是跑 `pnpm run perf:scenarios -- --id document-switch-after-storyboard`
 * （渲染要在真 Electron 里才量得出）；这里钉根因的形状，防有人把冻结摘掉或换回只有 hidden 属性的版本。
 */
const read = (relative: string): string => stripComments(fs.readFileSync(path.join(process.cwd(), relative), 'utf8'))

describe('隐藏工作区槽冻结子树', () => {
  const shell = read('src/workbench/WorkbenchShell.tsx')

  it('WorkspaceSlot 在 freezeWhenHidden 时用 React.Activity 包住子树，mode 跟 active 走', () => {
    expect(shell).toMatch(/freezeWhenHidden\s*\?\s*<React\.Activity mode=\{active \? "visible" : "hidden"\}>/)
  })

  it('分镜槽开着 freezeWhenHidden', () => {
    expect(shell).toMatch(/<WorkspaceSlot active=\{workspaceMode === "storyboard"\} freezeWhenHidden /)
  })
})
