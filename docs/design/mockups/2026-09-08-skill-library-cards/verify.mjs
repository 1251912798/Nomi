import console from 'node:console'
import process from 'node:process'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
const dir = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.NOMI_MOCKUP_BASE ?? 'http://127.0.0.1:5198/docs/design/mockups/2026-09-08-skill-library-cards/'
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 842 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}library-cards.html`)
  await page.evaluate(() => Promise.all([...globalThis.document.images].map((image) => image.decode())))
  assert.match(await page.locator('#detail-source').innerText(), /Apache-2.0/)
  await page.screenshot({ path: path.join(dir, 'library-cards.png') })
  await page.getByRole('button', { name: '提示词库', exact: true }).click()
  assert.match(await page.locator('#detail-prompt').innerText(), /{[^}]+}/)
  assert.match(await page.locator('.hero figcaption').innerText(), /未批准|已批准封面/)
  await page.getByRole('button', { name: '引用到 Agent', exact: true }).click()
  assert.equal(await page.locator('.agent-chip').count(), 1)
  await page.getByRole('button', { name: '用到节点', exact: true }).click()
  await page.waitForURL('**/node-effects.html?apply=1')
  assert.ok((await page.locator('#editor').innerText()).trim())
  await page.goto(`${base}node-effects.html`)
  await page.evaluate(() => Promise.all([...globalThis.document.images].map((image) => image.decode())))
  await page.screenshot({ path: path.join(dir, 'node-effects.png') })
  await page.locator('#favorites [data-effect="effect-character-three-view"]').click()
  assert.equal(await page.locator('#favorites').isHidden(), true)
  assert.equal(await page.locator('#editor mark').count(), 1)
  assert.equal(await page.locator('#editor mark').getAttribute('data-slot'), '{角色名}')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  assert.equal((await page.locator('#editor').innerText()).trim(), '')
  assert.equal(await page.locator('#favorites').isVisible(), true)
  await page.locator('#editor').fill('保留原文。')
  await page.locator('.more').first().click()
  await page.locator('.menu [data-effect="effect-object-six-view"]').click()
  assert.match(await page.locator('#editor').innerText(), /^保留原文。/)
  assert.match(await page.locator('#editor').innerText(), /连接的主体参考/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  assert.equal((await page.locator('#editor').innerText()).trim(), '保留原文。')
  await page.locator('#filled-more').click()
  await page.locator('.menu [data-effect="effect-character-three-view"]').click()
  assert.match(await page.locator('#filled-editor').innerText(), /^柔和的自然光/)
  assert.equal(await page.locator('#filled-editor mark').count(), 1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  assert.equal((await page.locator('#filled-editor').innerText()).trim(), '柔和的自然光，保持原有服装和构图。')
  assert.deepEqual(errors, [])
  console.log('Mockups: media decoded; details, both tabs, reference, append, inherited slots, missing slots and undo verified.')
} finally {
  await browser.close()
}
