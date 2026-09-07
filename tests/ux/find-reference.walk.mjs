// 「找参考」真机走查：模拟一个真实用户，从空素材库走到「把一条正在跑的片子加进项目」。
//
// **打真 TikHub**（需要 TIKHUB_API_KEY），因为这条线的价值全在真实数据上——
// 用 fixture 只能证明界面在，证明不了「搜出来的东西对不对、看不看得懂」。
// 缺 key 时明确跳过并说清楚，不静默假绿。
//
// 逐步截图落 tests/ux/shots/find-reference/，跑完人眼逐张看（R13：截图是给人判断的，不是给断言的）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { screenshotSettled } from './_assert.mjs'

const KEY = (process.env.TIKHUB_API_KEY || '').trim()
if (!KEY) {
  console.error('⏭️  跳过：没有 TIKHUB_API_KEY。这条走查刻意打真接口——没 key 就没有结论，不假绿。')
  process.exit(0)
}

const SHOTS = path.join(repoRoot, 'tests/ux/shots/find-reference')
fs.rmSync(SHOTS, { recursive: true, force: true })
fs.mkdirSync(SHOTS, { recursive: true })

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-find-reference-'))
const trail = []
let step = 0

async function shot(win, name, note) {
  step += 1
  const file = path.join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`)
  await screenshotSettled(win, { path: file })
  trail.push({ step, name, note, file: path.relative(repoRoot, file) })
  console.log(`  📸 ${step}. ${name} —— ${note}`)
}

function note(text) {
  trail.push({ step: `${step}+`, name: 'observation', note: text, file: null })
  console.log(`  · ${text}`)
}

const run = await launchNomiApp({
  name: 'find-reference',
  env: {
    NOMI_USER_DATA_DIR: path.join(TEMP, 'user-data'),
    NOMI_SETTINGS_DIR: path.join(TEMP, 'settings'),
    NOMI_PROJECTS_DIR: path.join(TEMP, 'projects'),
    NOMI_CAPABILITY_DIR: path.join(TEMP, 'capability'),
  },
})
const { win, close } = run

const consoleErrors = []
win.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
win.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`))

try {
  // ── 用户第一次打开，先建个项目 ─────────────────────────────────────────────
  await win.waitForTimeout(1500)
  await shot(win, 'app-open', '刚打开的样子')

  const newProject = win.getByText('新建空白项目', { exact: true }).first()
  await newProject.waitFor({ state: 'visible', timeout: 20_000 })
  await newProject.click()
  await win.waitForFunction(() => /projectId=/.test(location.href), undefined, { timeout: 20_000 })
  await win.waitForTimeout(1200)
  await shot(win, 'project-created', '进了一个空项目')

  // ── 配 key（真 key，走真实校验）────────────────────────────────────────────
  const keyStatus = await win.evaluate(async (k) => window.nomiDesktop.connector.tikhub.saveKey({ apiKey: k }), KEY)
  note(`真 key 保存校验：${JSON.stringify(keyStatus)}`)

  // ── 打开素材库 ─────────────────────────────────────────────────────────────
  await win.locator('[data-mode="generation"]').click().catch(() => {})
  await win.waitForTimeout(600)
  let assetSection = win.locator('section[aria-label="素材库"]')
  if (!(await assetSection.isVisible().catch(() => false))) {
    await win.getByRole('button', { name: '素材库', exact: true }).first().click().catch(() => {})
  }
  await assetSection.waitFor({ state: 'visible', timeout: 15_000 })
  await win.waitForTimeout(600)
  await shot(win, 'asset-library-empty', '素材库空态——卡点①：这里能不能看见「找参考」')

  // ── 卡点①：空态 CTA 在不在、点不点得动 ────────────────────────────────────
  const cta = win.locator('[data-find-reference-cta]')
  const ctaCount = await cta.count()
  note(`空态「找参考素材」CTA 数量 = ${ctaCount}`)
  if (ctaCount > 0) {
    await cta.first().click()
  } else {
    note('⚠️ 空态没有 CTA，退回工具栏那颗 🔗')
    await win.locator('button[aria-label="找参考素材"]').first().click()
  }
  await win.waitForTimeout(800)
  await shot(win, 'find-panel-open', '找参考面板展开——平台 chip / 输入框 / 计费提示')

  const panel = win.locator('[data-find-reference-panel]')
  note(`面板存在 = ${await panel.count() > 0}`)
  const platforms = await win.locator('[data-find-reference-panel] [data-platform]').allTextContents().catch(() => [])
  note(`平台 chip = ${JSON.stringify(platforms)}`)
  const active = await win.locator('[data-find-reference-panel] [data-platform][data-active="true"]').textContent().catch(() => null)
  note(`默认平台 = ${active}`)

  // ── 真搜一次（抖音，中文原生可用）─────────────────────────────────────────
  const input = win.locator('[data-find-reference-panel] input').first()
  await input.click()
  await input.fill('护肤精华')
  await shot(win, 'keyword-typed', '输入关键词，还没回车')
  await input.press('Enter')
  await win.waitForTimeout(1000)
  await shot(win, 'searching', '搜索中')

  await win.waitForFunction(
    () => !document.querySelector('[data-find-reference-panel]')?.textContent?.includes('正在搜索'),
    undefined,
    { timeout: 60_000 },
  ).catch(() => note('⚠️ 60 秒还在「正在搜索」'))
  await win.waitForTimeout(1500)
  await shot(win, 'results', '结果回来了——卡点④：角标看不看得懂')

  const cards = win.locator('[data-find-reference-panel] .grid > div')
  const cardCount = await cards.count()
  note(`结果卡片数 = ${cardCount}`)

  // 封面探针：naturalWidth>0 = 真的画出来了；complete && naturalWidth===0 = 加载失败；
  // !complete = 还在加载。肉眼分不出这三者，DOM 分得出。
  const coverProbe = async (label) => {
    const p = await win.evaluate(() => {
      const imgs = [...document.querySelectorAll('[data-find-reference-panel] img')]
      return {
        total: imgs.length,
        drawn: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        failed: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
        pending: imgs.filter((i) => !i.complete).length,
        sample: imgs[0]?.currentSrc?.slice(0, 80) || null,
      }
    })
    note(`封面探针(${label}) = ${JSON.stringify(p)}`)
    return p
  }
  await coverProbe('结果刚出来')
  await win.waitForTimeout(6000)
  await coverProbe('再等 6 秒')
  await shot(win, 'results-covers-settled', '等封面加载完之后——对比上一张，看是「慢」还是「挂」')
  const panelText = await panel.textContent().catch(() => '')
  note(`面板文案片段 = ${JSON.stringify((panelText || '').slice(0, 240))}`)

  // ── 卡点④：把一条加进素材库 ───────────────────────────────────────────────
  if (cardCount > 0) {
    const addBtn = win.locator('[data-find-reference-panel] button:has-text("加入素材库")').first()
    if (await addBtn.count() > 0) {
      const gate = await win.evaluate(() => {
        const b = [...document.querySelectorAll('[data-find-reference-panel] button')].find((x) => x.textContent?.includes('加入素材库'))
        return b ? { disabled: b.disabled, blocked: b.dataset.blocked, reason: b.closest('span[title]')?.title || null } : null
      })
      note(`加入按钮闸门 = ${JSON.stringify(gate)}`)
      const firstId = await win.locator('[data-find-reference-panel] [data-ref-id]').first().getAttribute('data-ref-id').catch(() => null)
      note(`首条 data-ref-id = ${firstId}`)
      await addBtn.click()
      // toast 会自己消失——点完立刻抓，别等 6 秒后才找
      await win.waitForTimeout(1200)
      // 真实 toast 是 mantine 通知（.mantine-Notification-root）——2026-09-08 走查里我先猜了
      // [data-toast]，结果「什么都没抓到」被误读成「什么都没发生」。锚点要实查，别猜。
      const toast = await win.locator('.mantine-Notification-root').allTextContents().catch(() => [])
      note(`点击后 toast = ${JSON.stringify(toast.filter(Boolean).map((t) => t.slice(0, 120)))}`)
      await shot(win, 'added-toast', '点完 1.2 秒——toast 还在的话就在这张')
      await win.waitForTimeout(6000)
      await shot(win, 'added', '点了「加入素材库」6 秒之后')
      const btnText = await addBtn.textContent().catch(() => null)
      note(`按钮文案 = ${JSON.stringify(btnText)}`)

      // 分离两种可能：① UI 的 projectId 为空（点击静默早退）② 后端导入本身坏了。
      // 直接用 URL 里的 projectId 打同一条 IPC——它通了就说明是 ①。
      const direct = await win.evaluate(async () => {
        const m = location.href.match(/projectId=([^&#]+)/)
        const pid = m ? decodeURIComponent(m[1]) : null
        if (!pid) return { pid: null, error: 'URL 里没有 projectId' }
        const first = document.querySelector('[data-find-reference-panel] .grid > div')
        const badge = first?.querySelector('span')?.textContent || null
        try {
          const r = await window.nomiDesktop.connector.tikhub.importReference({ projectId: pid, platform: 'douyin', itemId: window.__lastRefItemId || 'unknown' })
          return { pid, badge, ok: true, r: JSON.stringify(r).slice(0, 160) }
        } catch (e) { return { pid, badge, ok: false, error: String(e?.message || e).slice(0, 220) } }
      })
      note(`直接打 IPC = ${JSON.stringify(direct)}`)
      const assets = await win.evaluate(async () => {
        const m = location.href.match(/projectId=([^&#]+)/)
        return m ? window.nomiDesktop.assets.list({ projectId: decodeURIComponent(m[1]) }) : { items: [] }
      })
      const ref = (assets.items || []).find((i) => i.data?.sourceEvidence?.connectorId === 'tikhub')
      note(`落库素材：${ref ? JSON.stringify({ name: ref.name, usage: ref.data?.sourceEvidence?.usageStatus, platform: ref.data?.sourceEvidence?.platform }) : '（没找到）'}`)
      note(`素材总数 = ${(assets.items || []).length}`)
    } else {
      note('⚠️ 结果卡上没有「加入素材库」按钮')
    }
  }

  // ── 切平台看证据格变不变（设计的核心主张）─────────────────────────────────
  const tiktokChip = win.locator('[data-find-reference-panel] [data-platform="tiktok"]')
  if (await tiktokChip.count() > 0) {
    await tiktokChip.click()
    await win.waitForTimeout(800)
    await shot(win, 'platform-switched', '切到 TikTok——上一个平台的结果必须清掉')
    const cardsAfter = await win.locator('[data-find-reference-panel] [data-ref-id]').count()
    const afterText = await panel.textContent().catch(() => '')
    note(`切平台后：卡片数 = ${cardsAfter}（应为 0）· 还含「收藏」= ${/收藏/.test(afterText || '')}（应为 false）`)
  }

  // 验 A：返回条在不在、点得回去吗
  const back = win.locator('[data-find-reference-back]')
  note(`返回条数量 = ${await back.count()} · 文案 = ${JSON.stringify((await back.textContent().catch(() => null))?.trim() || null)}`)
  if (await back.count() > 0) {
    await back.click()
    await win.waitForTimeout(800)
    await shot(win, 'back-to-library', '点返回条——应该回到我的素材，且看得见刚加的那条')
    const gridAssets = await win.locator('section[aria-label="素材库"] [role="list"] > *, section[aria-label="素材库"] img').count()
    note(`回到素材库后可见元素 = ${gridAssets} · 面板还在 = ${await win.locator('[data-find-reference-panel]').count() > 0}`)
  }

  await shot(win, 'final', '最终状态')
  if (consoleErrors.length) note(`控制台错误 ${consoleErrors.length} 条：${JSON.stringify(consoleErrors.slice(0, 4))}`)
  else note('控制台无错误')
} catch (error) {
  note(`💥 走查中断：${error?.message || error}`)
  await shot(win, 'crash', '中断时的样子').catch(() => {})
  throw error
} finally {
  fs.writeFileSync(path.join(SHOTS, 'trail.json'), `${JSON.stringify(trail, null, 2)}\n`)
  console.log(`\n轨迹与截图：${path.relative(repoRoot, SHOTS)}`)
  await close()
}
