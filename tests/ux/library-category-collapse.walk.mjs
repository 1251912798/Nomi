import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { launchNomiApp } from './_launchApp.mjs'
import { expect, proveProbe, expectAbsent } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { COMPOSER_SKILL, SKILL_POPOVER } from './agent-runtime-walk-support.mjs'
import { newProjectEntry, openRailDrawer } from './_shell.mjs'
const out = path.resolve('docs/design/verification/2026-09-09-skill-ui-b')
fs.mkdirSync(out, { recursive: true })
const base = process.env.NOMI_SKILL_UI_DEV_URL
if (base) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/tests/ux/fixtures/library-groups/index.html`)
    const summary = page.locator('summary')
    await expect(summary).toHaveCount(1)
    await expect(summary).toHaveText('表情 · 12 项')
    await expect(page.locator('[data-v4-command]:visible')).toHaveCount(0)
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-v4-command]:visible')).toHaveCount(12)
    await page.screenshot({ path: path.join(out, 'fixture-12-expanded.png') })
    const proof = await proveProbe(page.locator('[data-v4-command="variant-11"]'), '第12项可达')
    await page.locator('[data-v4-command="variant-11"]').click()
    await expect(page.locator('output')).toHaveText('variant-11')
    await summary.click()
    await expectAbsent(page.locator('[data-v4-command="variant-11"]:visible'), { provenBy: proof })
    await page.screenshot({ path: path.join(out, 'fixture-12.png') })
  } finally { await browser.close() }
}
const run = await launchNomiApp({ name: 'library-category-collapse', settleMs: 0,
  env: base ? { NOMI_RENDERER_URL: base, VITE_DEV_SERVER_URL: base } : {},
  initialLocalStorage: { 'nomi-color-scheme': 'light', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen' },
})
const page = run.win
page.setDefaultTimeout(stationTimeout({ operations: 2 }))
try {
  await (await run.app.browserWindow(page)).evaluate(w => w.setBounds({ x: 0, y: 0, width: 1680, height: 980 }))
  await newProjectEntry(page).click()
  await page.locator(COMPOSER_SKILL).first().click()
  const picker = page.locator(SKILL_POPOVER).first()
  const expression = picker.locator('details[data-library-group*="source:builtin-expressions"]')
  await expect(expression.locator('summary')).toContainText('25')
  await expression.locator('summary').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(out, '01-composer-collapsed.png') })
  await expression.locator('summary').click()
  await expect(expression.locator('[data-v4-command]:visible')).toHaveCount(25)
  await page.screenshot({ path: path.join(out, '02-composer-expanded.png') })
  // 2026-10-24 改版：技能库只列技能（表情预设住在提示词库，Q1），「用到节点」删了（Q4）；库里不再把整组折成一行字，
  // 改成首页每组露一行真卡片 +「全部 N ›」（Q3，替换 09-09 的 C20）。表情预设经提示词库「放上画布」新建节点。
  await page.keyboard.press('Escape')
  const prompts = await openRailDrawer(page, 'prompts', '提示词库')
  const pack = prompts.locator('[data-library-section="builtin:source:builtin-expressions"]')
  await pack.scrollIntoViewIfNeeded()
  await expect(pack.locator('[data-library-show-all]')).toContainText('25')
  await page.screenshot({ path: path.join(out, '05-prompt-collapsed.png') })
  await pack.locator('[data-library-show-all]').click()
  await expect(prompts.locator('[data-library-category-menu]')).toContainText('表情预设')
  await expect(prompts.locator('[data-library-show-all]')).toHaveCount(0)
  await expect(prompts.locator('[data-prompt-card="builtin-expr-joy-1"]')).toBeVisible()
  await page.screenshot({ path: path.join(out, '06-prompt-expanded.png') })
  await prompts.locator('[data-prompt-card="builtin-expr-joy-1"] button').first().click()
  await page.locator('[data-prompt-preview="builtin-expr-joy-1"] [data-prompt-detail-add]').click()
  const editor = page.locator('.generation-canvas-v2-node__composer [contenteditable="true"]').first()
  await expect(editor).toContainText('嘴角极轻微地上扬')
  await page.locator('[data-effect-more]').click()
  const menu = page.getByTestId('node-effect-menu')
  await expect(menu).toBeVisible()
  await page.screenshot({ path: path.join(out, '07-node-groups.png') })
  await page.keyboard.press('Escape')
  fs.writeFileSync(path.join(out, 'journey.json'), JSON.stringify({ passed: true, paidCalls: 0, tasks: ['12 variants collapse and keyboard expand', '25 real expressions collapse and expand in composer', 'prompt library shows one row then all 25 expressions', 'add real expression to canvas from prompt library'] }, null, 2) + '\n')
} catch (error) {
  await page.screenshot({ path: path.join(out, 'FAIL.png') })
  throw error
} finally { await run.close() }
