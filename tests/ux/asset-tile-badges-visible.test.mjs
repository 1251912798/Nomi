// 参考缩略图（AssetTile）悬停才出的 × 必须**整枚**看得见：包围盒完全落在最近的裁剪祖先里，中心点点得到自己；
// 平时没有序号、没有 ×（B3：提示词里写「小图 + 名字」，不再靠序号；统一规则 4：悬停才显示名字和 ×）。
//
// 2026-10-06 的老教训：角标原来挂在格外 5px，而格子自己 overflow-hidden，所以被切掉一角。B3 的 × 挂在小图右上角
// **外侧**（-10px），所以生产里那层滚动口必须向卡片边缘外扩、把它装进去（NodeGenerationComposer 的 -mx-3 -mt-3 px-3 pt-3）——这条就是守它。
// 清单遍历这个组件的两处生产宿主：
//   · 画布节点参考区：真 NodeParameterControls → AssetReference（fixtures/asset-tile-badges-harness）；
//   · 分镜行内参考条：设计实验室 storyboard-reuse 屏的真镜头行（横 / 竖 / 3:4 / 1:1 / 混排 × 宽 / 窄、三种状态）。
// 零额度：纯本地渲染，不碰任何生成 API。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { chromium } from 'playwright'
// eslint-disable-next-line browser-fixture/no-restricted-imports -- 存量：用应用 vite.config 起设计实验室（屏按查询串懒加载），迁到 useBrowserFixture 要它先支持应用配置与「屏就绪」判据（docs/fixes/2026-10-24-browser-fixture-ready-signals.root-cause.json 残留风险）
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { assertTailwindApplied, freshTailwindCss } from './_freshTailwindCss.mjs'

// 现编一次 Tailwind（收集阶段做完，不占用例自己的超时），后面各用例复用。
freshTailwindCss()

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const STRIP_STATES = [
  'sbl-01-film-16x9-wide', 'sbl-02-film-16x9-narrow',
  'sbp-01-film-9x16-wide', 'sbp-02-film-9x16-narrow',
  'sbp-03-film-3x4-wide', 'sbp-04-film-3x4-narrow',
  'sbl-05-film-1x1-wide', 'sbl-06-film-1x1-narrow',
  'sbl-07-mixed-wide', 'sbl-08-mixed-narrow',
  'sbl-11-row-states',
]

let server
let browser
let origin
beforeAll(async () => {
  server = await createServer({ root: repoRoot, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
  await server.listen()
  origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true })
}, 120000)
afterAll(async () => {
  await browser?.close()
  await server?.close()
})

/** 在页面里量：悬停中的这一格，它的 × 对最近的裁剪祖先的内框、可点性。 */
function measureRemove(tileIndex) {
  const clipBoxOf = (element) => {
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      if (style.overflowX === 'visible' && style.overflowY === 'visible' && style.clipPath === 'none') continue
      const rect = ancestor.getBoundingClientRect()
      return {
        left: rect.left + parseFloat(style.borderLeftWidth), top: rect.top + parseFloat(style.borderTopWidth),
        right: rect.right - parseFloat(style.borderRightWidth), bottom: rect.bottom - parseFloat(style.borderBottomWidth),
      }
    }
    return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  }
  const tile = document.querySelectorAll('[data-asset-tile]')[tileIndex]
  const remove = tile?.querySelector('[data-asset-tile-remove]')
  if (!tile || !remove) return null
  const dot = remove.querySelector('i') ?? remove
  const rect = dot.getBoundingClientRect()
  const clip = clipBoxOf(remove)
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  return {
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    clip,
    opacity: Number(getComputedStyle(remove).opacity),
    inside: rect.left >= clip.left - 0.5 && rect.top >= clip.top - 0.5 && rect.right <= clip.right + 0.5 && rect.bottom <= clip.bottom + 0.5,
    hit: Boolean(hit && remove.contains(hit)),
    badges: [...tile.querySelectorAll('*')].filter((el) => !el.children.length && /^\d+$/.test(el.textContent?.trim() ?? '')).length,
  }
}

/**
 * 读**终态**，不靠时机：× 带 transition-opacity，注入样式 / 悬停之后立刻读，读到的是渐变半路的值
 * （CI 上 0.0552 / 0.0166，本机忙时 0.79）。getAnimations() 会先刷新样式、把正在跑的 CSS 过渡交出来，
 * finish() 直接跳到终值；无限循环的动画没有终点，跳过。
 */
async function settleTransitions(page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try { animation.finish() } catch { /* 无限循环的动画没有终点 */ }
    }
  })
}

/** 量「平时」之前把指针挪到所有小图之外：滚动后指针可能正好停在下一格上，那一格的 × 就在淡入。 */
async function movePointerOffTiles(page) {
  const point = await page.evaluate(() => {
    const corners = [[1, 1], [window.innerWidth - 2, 1], [1, window.innerHeight - 2], [window.innerWidth - 2, window.innerHeight - 2]]
    return corners.find(([x, y]) => !document.elementFromPoint(x, y)?.closest('[data-asset-tile]')) ?? corners[0]
  })
  await page.mouse.move(point[0], point[1])
}

async function expectHoverRemoveVisible(page, where) {
  const count = await page.locator('[data-asset-tile]').count()
  expect(count, `${where}: 应该量到参考缩略图`).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    await page.locator('[data-asset-tile]').nth(index).scrollIntoViewIfNeeded()
    await movePointerOffTiles(page)
    await settleTransitions(page)
    const quiet = await page.evaluate(measureRemove, index)
    expect(quiet?.opacity ?? 1, `${where} #${index}: 平时 × 是看不见的`).toBeLessThan(0.01)
    await page.locator('[data-asset-tile]').nth(index).hover()
    await settleTransitions(page)
    const shown = await page.evaluate(measureRemove, index)
    expect(shown, `${where} #${index}: 找不到 ×`).not.toBeNull()
    expect(shown.opacity, `${where} #${index}: 悬停后 × 要出现`).toBe(1)
    expect(shown.inside, `${where} #${index}: × 被裁剪祖先切掉（${JSON.stringify(shown.rect)} 不在 ${JSON.stringify(shown.clip)} 里）`).toBe(true)
    expect(shown.hit, `${where} #${index}: × 的中心点点不到它自己`).toBe(true)
    expect(shown.badges, `${where}: 不再有序号角标`).toBe(0)
  }
}

test('画布节点参考区：悬停才出 ×，整枚可见、点得到，没有序号', async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
  try {
    await page.goto(`${origin}/tests/ux/fixtures/asset-tile-badges-harness.html`, { timeout: 90000 })
    await page.addStyleTag({ content: freshTailwindCss() })
    await assertTailwindApplied(page, 'canvas harness')
    await page.locator('[data-asset-tile]').first().waitFor({ timeout: 60000 })
    await expectHoverRemoveVisible(page, 'canvas')
  } finally { await page.close() }
}, 180000)

test('分镜行内参考条：各画幅、宽窄两档悬停才出 ×，整枚可见', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  try {
    for (const state of STRIP_STATES) {
      await page.goto(`${origin}/design-lab.html?screen=storyboard-reuse&frame=1&state=${state}`, { timeout: 90000 })
      await page.waitForFunction(() => window.__designLabReady === true, null, { timeout: 60000 })
      await page.addStyleTag({ content: freshTailwindCss() })
      await assertTailwindApplied(page, state)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expectHoverRemoveVisible(page, state)
    }
  } finally { await page.close() }
}, 600000)
