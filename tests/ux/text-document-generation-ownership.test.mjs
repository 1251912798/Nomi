// Real Chromium, original TextDocumentNode/ProseMirror and generation action; controlled supplier/storage, not Electron acceptance.
import { expect, test } from 'vitest'
import { expect as browserExpect } from '@playwright/test'
import { chromium } from 'playwright'
import { useBrowserFixture } from './_browserFixture.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { assertTailwindApplied, freshTailwindCss } from './_freshTailwindCss.mjs'

// 现编一次 Tailwind（收集阶段做完，不占用例自己的超时），后面各用例复用。
freshTailwindCss()

const ENTRY = 'tests/ux/fixtures/text-document-generation-ownership.html'
// 夹具页在准备阶段编完（_browserFixture.mjs）：用例里的 goto 只是执行页面，不再在 15 秒的操作预算里等开发服务冷编译。
const fixture = useBrowserFixture({ entries: [ENTRY], browserType: chromium })

test('selection rewrite persists its actual result body, reopens without replay, and rejects later manual edits', async () => {
  const page = await fixture.browser.newPage()
  page.setDefaultTimeout(stationTimeout({ operations: 1 }))
  try {
    await page.goto(fixture.url(ENTRY))
    await page.addStyleTag({ content: freshTailwindCss() })
    await assertTailwindApplied(page, 'text-document-generation-ownership.test.mjs')
    const editor = page.locator('.ProseMirror')
    await browserExpect(editor).toBeVisible()
    await browserExpect(editor).toHaveText('Keep OLD tail')
    await editor.click()
    await browserExpect(editor).toBeFocused()
    // 选区经编辑器自己的选区命令落下（原因见夹具 select()）：同步写进屏幕选区和节点 meta，不用等、也不赌时序。
    expect(await page.evaluate(() => window.textOwnership.select('OLD'))).toEqual({ screen: 'OLD', stored: 'OLD' })
    await page.evaluate(() => window.textOwnership.prepare())
    await page.evaluate(() => window.textOwnership.generate())
    await browserExpect.poll(() => page.evaluate(() => window.textOwnership.snapshot().pending)).toBe(null)
    const generated = await page.evaluate(() => ({ ...window.textOwnership.snapshot(), validation: window.textOwnership.validate() }))
    expect(generated.text).toBe('Keep\nNEW\ntail')
    expect(generated.validation).toEqual({ accepted: true })
    expect(generated.appliedRun.resultId).toBe(generated.result.id)
    expect(generated.appliedRun.textDocumentDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(generated.persistRevision).toBeGreaterThan(generated.beforeApplyRevision)

    await page.evaluate(() => window.textOwnership.reopen())
    await browserExpect(editor).toHaveText('Keep NEW tail')
    const reopened = await page.evaluate(() => ({ ...window.textOwnership.snapshot(), validation: window.textOwnership.validate() }))
    expect(reopened.text).toBe(generated.text)
    expect(reopened.appliedRun.textDocumentDigest).toBe(generated.appliedRun.textDocumentDigest)
    expect(reopened.validation).toEqual({ accepted: true })

    await editor.click()
    await page.keyboard.type(' MANUAL')
    const edited = await page.evaluate(() => ({ ...window.textOwnership.snapshot(), validation: window.textOwnership.validate() }))
    expect(edited.text).toContain('MANUAL')
    expect(edited.appliedRun.textDocumentDigest).toBe(generated.appliedRun.textDocumentDigest)
    expect(edited.validation.accepted).toBe(false)
  } finally { await page.close() }
})
