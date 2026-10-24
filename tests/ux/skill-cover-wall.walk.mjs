import fs from 'node:fs'
import path from 'node:path'
import { launchNomiApp } from './_launchApp.mjs'
import { expect } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
const out = path.resolve('docs/design/verification/2026-09-09-skill-ui-b')
fs.mkdirSync(out, { recursive: true })
const run = await launchNomiApp({ name: 'skill-cover-wall', settleMs: 0,
  initialLocalStorage: { 'nomi-color-scheme': 'light', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen' },
})
const page = run.win
page.setDefaultTimeout(stationTimeout({ operations: 2 }))
const media = []
// 2026-10-24 改版：技能库只列技能、效果住在提示词库（Q1）；库是虚拟列表（屏外的卡不挂载），首页每组只露一行。
// 所以在项目库页签里按左侧分类逐组点开（一组全部摊开），一边滚一边把每张卡的封面都看一遍：图片解码出来、视频出了首帧。
async function wallOf(tab, kind, cardSelector, categoryPrefix) {
  await page.locator(`[data-library-tab-button="${tab}"]`).click()
  const host = page.locator('[data-library-host="page"]')
  const categories = host.locator(`[data-library-category^="${categoryPrefix}"]`)
  await expect(categories.first()).toBeVisible()
  const ids = await categories.evaluateAll(buttons => buttons.map(button => ({ id: button.getAttribute('data-library-category'), count: Number(button.lastElementChild.textContent) })))
  const seen = new Map()
  for (const { id, count } of ids) {
    await host.locator(`[data-library-category="${id}"]`).click()
    const scroller = host.locator('[data-library-scroll]')
    await scroller.evaluate(element => { element.scrollTop = 0 })
    const inGroup = new Set()
    for (let step = 0; step < 200 && inGroup.size < count; step += 1) {
      const cards = host.locator(cardSelector)
      await expect(cards.first()).toBeVisible()
      for (const card of await cards.all()) {
        const cardId = await card.getAttribute(cardSelector.match(/\[(data-[a-z-]+)\]/)[1])
        if (inGroup.has(cardId) || !(await card.isVisible())) continue
        await expect.poll(() => card.evaluate(element => {
          const image = element.querySelector('img[data-skill-media="image"]')
          if (image) return image.complete && image.naturalWidth > 0
          const video = element.querySelector('[data-skill-media="video"] video')
          return Boolean(video && video.readyState >= 2)
        }), { message: `${kind} 封面没出来：${cardId}` }).toBe(true)
        inGroup.add(cardId)
        seen.set(cardId, { id: cardId, group: id, loaded: true })
      }
      if (inGroup.size >= count) break
      const moved = await scroller.evaluate(element => {
        const before = element.scrollTop
        element.scrollTop = Math.min(element.scrollHeight, before + element.clientHeight * 0.8)
        return element.scrollTop !== before
      })
      if (!moved) break
    }
    expect(inGroup.size, `${kind} 分组 ${id} 的卡没看全`).toBe(count)
    await page.screenshot({ path: path.join(out, `wall-${kind}-${String(seen.size).padStart(2, '0')}.png`) })
  }
  return [...seen.values()]
}
try {
  await (await run.app.browserWindow(page)).evaluate(w => w.setBounds({ x: 0, y: 0, width: 1680, height: 980 }))
  const skills = await wallOf('skills', 'skill', '[data-skill-card]', 'builtin:')
  const effects = await wallOf('prompts', 'effect', '[data-prompt-card]', 'builtin:category:')
  media.push(...skills.map(item => ({ ...item, kind: 'skill' })), ...effects.map(item => ({ ...item, kind: 'effect' })))
  expect(skills.length, '技能库里的技能变少了').toBeGreaterThanOrEqual(48)
  expect(effects.length, '提示词库里的效果变少了').toBeGreaterThanOrEqual(40)
  fs.writeFileSync(path.join(out, 'cover-wall.json'), JSON.stringify({ passed: true, paidCalls: 0, media }, null, 2) + '\n')
} catch (error) {
  await page.screenshot({ path: path.join(out, 'wall-FAIL.png') })
  fs.writeFileSync('/private/tmp/nomi-skill-ui-b-wall-dom.html', await page.content())
  throw error
} finally { await run.close() }
