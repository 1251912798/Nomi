import { chromium } from 'playwright'
import { expect, expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const out = process.env.B2A_EVIDENCE_DIR || 'artifacts/b2a'
await mkdir(out, { recursive: true })
// 自己起这条走查要的开发服务：以前得先手动在 52793 开一个，夜跑里从来没有（run 40035294026：ERR_CONNECTION_REFUSED）。
// 直接用 node 起 vite（不经 npx 垫片：kill 只杀得到垫片，vite 成孤儿攥着端口）；进程退出 / 被信号终止时一并收掉。
const VITE_ORIGIN = 'http://127.0.0.1:52793'
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const viteServer = spawn(process.execPath, [path.join(repoDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '52793', '--strictPort'], { cwd: repoDir, stdio: 'ignore' })
viteServer.unref() // 不让这个子进程撑着走查进程不退（否则断言跑完照样挂到超时）；退出时由下面这行收掉它
process.on('exit', () => viteServer.kill())
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { viteServer.kill(); process.exit(1) })
await expect.poll(async () => { try { return (await fetch(`${VITE_ORIGIN}/tests/ux/fixtures/agent-panel-mechanics/`)).ok } catch { return false } }, { timeout: stationTimeout({ operations: 4 }) }).toBe(true)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.setDefaultTimeout(stationTimeout())
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(VITE_ORIGIN + '/tests/ux/fixtures/agent-panel-mechanics/')
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
await page.goto(VITE_ORIGIN + '/tests/ux/fixtures/agent-panel-mechanics/?width=340')
await expect(page.locator('[data-v4-panel]')).toBeVisible()
const narrow = await page.locator('[data-v4-control="model"]').evaluate(el => {
  const label=el.querySelector('span'), panel=el.closest('[data-v4-panel]').getBoundingClientRect()
  return { modelReadable:label.scrollWidth <= label.clientWidth, controlsInside:[...el.parentElement.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=panel.left && r.right<=panel.right}) }
})
await page.screenshot({path:`${out}/model-narrow.png`})
const result = { inside, queueDeleted: true, nextStepExposed, visibleChildren, inert, narrow, errors }
await writeFile(`${out}/browser-result.json`,JSON.stringify(result,null,2))
await browser.close()
console.log(result)
if (!inside || !nextStepExposed || !visibleChildren || !inert || !narrow.modelReadable || !narrow.controlsInside || errors.length) process.exitCode = 1
