// Controlled browser component behavior; not Electron/package acceptance.
import { test } from 'vitest'
import { expect } from '@playwright/test'
import { chromium } from 'playwright'
import { expectAbsent, proveProbe } from './_assert.mjs'
import { useBrowserFixture } from './_browserFixture.mjs'

const ENTRY = 'tests/ux/fixtures/creation-sidebar-delete-harness.html'
const fixture = useBrowserFixture({ entries: [ENTRY], browserType: chromium })
test('sidebar deletes a plan at once (undo is the net) and still confirms document deletion', async () => {
  const page = await fixture.browser.newPage()
  try {
    await page.goto(fixture.url(ENTRY))
    const plan = page.locator('[data-storyboard-id]')
    await expect(plan).toHaveCount(1)
    const planProof = await proveProbe(plan, 'existing sidebar plan before deletion')
    // 行内动作 ≤3 个直接摆图标（设计系统 §1.8 规则 2 补充）：删方案就是行上的垃圾桶，不再经「⋯」。
    const planTrash = page.locator('[data-storyboard-row] [data-resource-action="delete"]')
    await page.locator('[data-storyboard-row]').hover()
    await expect(planTrash).toBeVisible()
    // 删方案**不再弹确认**（2026-09-21 渲染层第四程，用户拍板：当场删 + 撤销条，接仓库现成的 `showUndoToast`；
    // 撤销复原到原位由 `storyboardDeleteUndoRestore.test.ts` 与真机走查 `creation-plan-delete-undo.walk.mjs` 钉）。
    // 这里守的是它的另一半：点下去就没了，而且中间**没有**一个对话框把它拦住。文稿删除仍然要确认（不可撤销）。
    await planTrash.click()
    await expectAbsent(plan, { provenBy: planProof, message: 'deleting a plan removes it at once — the undo toast is the safety net, not a dialog' })
    await expect(page.getByRole('dialog'), '删方案不该再有确认框').toBeHidden()
    await expect(page.locator('[data-document-row]')).toHaveCount(2)
    await page.locator('button[data-document-id="b"]').click({ button: 'right' })
    await page.locator('[role="menu"] [data-resource-action="delete"]').click()
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('[data-document-row]')).toHaveCount(1)
    await page.locator('button[data-document-id="a"]').click({ button: 'right' })
    await expect(page.locator('[role="menu"] [data-resource-action="delete"]')).toBeDisabled()
    // 最后一篇原稿：行内垃圾桶同样禁用，并说明为什么
    await expect(page.locator('[data-document-row="a"] [data-resource-action="delete"]')).toBeDisabled()
  } finally { await page.close() }
})
