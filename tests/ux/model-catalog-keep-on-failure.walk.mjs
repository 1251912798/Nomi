// 模型目录读取失败时，生成框的模型选项不被清空（真组件走查，零额度）。
//
// 跑的是设计实验室里「节点生成浮框底栏」那一屏——它挂的是现役 NodeGenerationComposer → 现役
// useModelOptionsState / modelCatalogCache，只有目录桥是夹具。这里在页面里把桥的 models:list /
// vendors:list 换成抛错，再触发和设置页保存模型时同一个刷新事件，量屏上的真实结果。
//   A 先读成功、再刷新时读失败  → 芯片仍在，旁边有说得出原因的一行（stale_kept）
//   B 一开始就读失败（缓存没命中）→ 空态 + 原因，不假装有选项
// 夹具桥的目录行没带主进程投影的 availability（真机每行都带），这里补上，否则 fail-closed 闸会把整份清单挡成空。
// 中英两轨各截一张。用法：node tests/ux/model-catalog-keep-on-failure.walk.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { expect, expectAbsent, proveProbe } from './_assert.mjs'
import { REPO_ROOT } from './design-lab/labStates.mjs'
import { assertLabPortOwnership, labPortFor } from './design-lab/labServer.mjs'

// 等待上限（冷启动的 vite 要转译整张模块图）：是上限不是休眠，条件一到立刻继续。
const COLD_START_MS = 180_000
const until = (page, predicate, arg, ms = COLD_START_MS) => page.waitForFunction(predicate, arg, { timeout: ms })
const ROLE = 'walk-node-composer-bar'
const PORT = labPortFor(ROLE)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = path.join(REPO_ROOT, 'docs/evidence/2026-10-18-model-catalog-keep')
fs.mkdirSync(OUT, { recursive: true })
const failures = []
const check = (ok, message) => { if (!ok) { failures.push(message); console.error(`  ✗ ${message}`) } else console.log(`  ✓ ${message}`) }

assertLabPortOwnership(ROLE)
const vite = spawn(process.execPath, [path.join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] })
vite.stderr?.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
try {
  for (let i = 0; i < 300; i += 1) {
    try { const r = await fetch(`${BASE}/design-lab.html`); if (r.ok || r.status === 404) break } catch { /* not up */ }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  assertLabPortOwnership(ROLE)
  const browser = await chromium.launch({ headless: true })
  const T = {
    zh: { reason: /模型目录这次没读到，仍显示上一次的清单：.*models:list exploded/, empty: /模型目录加载失败：.*models:list exploded/ },
    en: { reason: /Couldn't refresh the model catalog; showing the last list: .*models:list exploded/, empty: /Failed to load model catalog: .*models:list exploded/ },
  }
  for (const locale of ['zh-CN', 'en']) {
    const key = locale === 'en' ? 'en' : 'zh'
    for (const scenario of ['kept', 'cold']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error)))
      await page.addInitScript(({ locale, scenario }) => {
        window.localStorage.setItem('nomi:locale:v1', locale)
        window.__catalogFail = scenario === 'cold'
        let bridge
        Object.defineProperty(window, 'nomiDesktop', {
          configurable: true,
          get: () => bridge,
          set: (value) => {
            const catalog = value?.modelCatalog
            if (catalog) {
              const models = catalog.listModels
              const vendors = catalog.listVendors
              catalog.listModels = (...args) => { if (window.__catalogFail) throw new Error('models:list exploded'); return models(...args).map((row) => ({ ...row, availability: { usable: true } })) }
              catalog.listVendors = (...args) => { if (window.__catalogFail) throw new Error('vendors:list exploded'); return vendors(...args) }
            }
            bridge = value
          },
        })
      }, { locale, scenario })
      await page.goto(`${BASE}/design-lab.html?screen=node-composer-bar&frame=1&state=composer-bar-v1-video`, { timeout: COLD_START_MS })
      await until(page, () => window.__designLabReady === true)
      const shot = page.locator('[data-design-lab-shot="composer-bar-v1-video"]')
      const stale = page.locator('[data-model-catalog-stale="true"]')
      const configureButton = page.locator('button[aria-label="去配置模型"], button[aria-label="Configure a model"]')
      const modelChip = page.locator('[data-node-composer-footer] [role="combobox"], [data-node-composer-footer] button[aria-haspopup]')
      if (scenario === 'kept') {
        await until(page, (selector) => document.querySelector(selector) !== null, '[data-node-composer-footer] [role="combobox"], [data-node-composer-footer] button[aria-haspopup]')
        const before = await page.locator('[data-node-composer-footer]').innerText()
        // 走生产的刷新入口（设置页保存模型时同一个）：作废缓存 + 广播刷新事件。
        await page.evaluate(async () => { window.__catalogFail = true; (await import('/src/config/modelCatalogCache.ts')).notifyModelOptionsRefresh('all') })
        await until(page, (selector) => document.querySelector(selector) !== null, '[data-model-catalog-stale="true"]')
        const note = await stale.innerText()
        check(T[key].reason.test(note), `${key}/kept 屏上说得出原因：${note}`)
        const footer = await page.locator('[data-node-composer-footer]').innerText()
        check(footer.includes(before.split('\n')[0]), `${key}/kept 模型芯片还在（${before.split('\n')[0]}）`)
        // 探针活的证明：同屏必然在的对照物（模型芯片）找得到，才轮得到断言「配置模型」空态按钮不在。
        const chipProof = await proveProbe(modelChip, `${key}/kept 底栏模型芯片`)
        await expectAbsent(configureButton, { provenBy: chipProof, message: `${key}/kept 没退成"配置模型"空态` })
        check(true, `${key}/kept 没退成"配置模型"空态`)
      } else {
        await expect(shot.getByText(/exploded/).first()).toBeVisible()
        const text = await shot.innerText()
        check(T[key].empty.test(text), `${key}/cold 空态带着原因：${text.replace(/\n/g, ' | ').slice(0, 160)}`)
        // 探针活的证明：空态按钮（同屏必然在）找得到，才轮得到断言「读失败说明行」不在——冷态没有旧清单可留。
        const buttonProof = await proveProbe(configureButton, `${key}/cold 配置模型空态按钮`)
        await expectAbsent(stale, { provenBy: buttonProof, message: `${key}/cold 没有假装有选项` })
        check(true, `${key}/cold 没有假装有选项`)
      }
      // 整屏截（实验室的取景框会把舞台左侧裁掉一截，底栏左边的模型芯片就看不见了）。
      await page.evaluate(() => { const stage = document.querySelector('[data-design-lab-stage]')?.firstElementChild; if (stage) stage.style.transform = 'translateX(150px)' })
      await page.screenshot({ path: path.join(OUT, `${key}-${scenario}.png`), animations: 'disabled', clip: { x: 0, y: 0, width: 760, height: 700 } })
      check(errors.length === 0, `${key}/${scenario} 零 pageerror ${errors.join(';')}`)
      await context.close()
    }
  }
  await browser.close()
} finally {
  vite.kill()
}
if (failures.length) { console.error(`\n${failures.length} 条失败`); process.exit(1) }
console.log('\nOK 截图在', OUT)
