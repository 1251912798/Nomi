import { chromium } from 'playwright'
import { expect, expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const out = process.env.B2A_EVIDENCE_DIR || 'artifacts/b2a'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.setDefaultTimeout(stationTimeout())
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:52793/tests/ux/fixtures/agent-panel-mechanics/')
await page.locator('[data-v4-panel]').waitFor()
await page.screenshot({path:`${out}/folded.png`})
await page.locator('[data-v4-block="context"] > summary').click()
const popover = page.locator('[data-v4-block="context"] > div')
await popover.waitFor({state:'visible'})
await page.screenshot({path:`${out}/context.png`})
const rect = await popover.boundingBox()
const panel = await page.locator('[data-v4-panel]').boundingBox()
const inside = rect.x >= panel.x && rect.x + rect.width <= panel.x + panel.width && rect.y >= 0 && rect.y + rect.height <= 800
await page.locator('[data-v4-block="context"] > summary').click()
await page.locator('[data-v4-control="model"]').click()
await page.screenshot({path:`${out}/model.png`})
await page.locator('[data-v4-control="model"]').click()
await page.getByText('切换审批卡', {exact:true}).click()
await page.screenshot({path:`${out}/approval.png`})
await page.getByText('切换审批卡', {exact:true}).click()
await page.screenshot({path:`${out}/queue.png`})
const queueProbe = await proveProbe(page.locator('[data-v4-block="queue"]'), 'seeded queued instruction')
await page.locator('[data-v4-block="queue"] button').click()
await expectAbsent(page.locator('[data-v4-block="queue"]'), {provenBy:queueProbe})
const queueDeleted = true
await page.getByText('切换长回答',{exact:true}).click()
await page.screenshot({path:`${out}/next-step.png`})
const nextStepExposed = await page.locator('[data-v4-block="assistant"]').evaluate(el => !el.querySelector('[data-folded="true"]'))
await page.getByText('切换长回答',{exact:true}).click()
await page.getByText('打开媒体预览', {exact:true}).click()
await page.getByRole('dialog').waitFor()
await page.screenshot({path:`${out}/preview.png`})
const visibleChildren = await page.locator('.workbench-generation__ai').evaluate(el => [...el.querySelectorAll('button,p,summary')].filter(child => {const r=child.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(child).visibility==='visible'}).length)
const inert = await page.locator('[data-canvas-content]').evaluate(el => el.inert)
await page.getByRole('dialog').getByRole('button').click()
await expect(page.locator('[data-canvas-content]')).not.toHaveAttribute('inert', '')
await page.goto('http://127.0.0.1:52793/tests/ux/fixtures/agent-panel-mechanics/?width=340')
await expect(page.locator('[data-v4-panel]')).toBeVisible()
const narrow = await page.locator('[data-v4-control="model"]').evaluate(el => {
  const label=el.querySelector('span'), panel=el.closest('[data-v4-panel]').getBoundingClientRect()
  return { modelReadable:label.scrollWidth <= label.clientWidth, controlsInside:[...el.parentElement.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=panel.left && r.right<=panel.right}) }
})
await page.screenshot({path:`${out}/model-narrow.png`})
const result = { inside, queueDeleted, nextStepExposed, visibleChildren, inert, narrow, errors }
await writeFile(`${out}/browser-result.json`,JSON.stringify(result,null,2))
await browser.close()
console.log(result)
if (!inside || !queueDeleted || !nextStepExposed || !visibleChildren || !inert || !narrow.modelReadable || !narrow.controlsInside || errors.length) process.exitCode = 1
