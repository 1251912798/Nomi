#!/usr/bin/env node
import { makeTempDir } from '../../scripts/_test-temp.mjs'
// R13 走查：2026-09-01 UXC 可见性/一致性修复批（fix/visibility-i18n-batch）。
// 逐项钉死用户真机反馈的 5 个问题，全部用 _assert.mjs 的真断言（点不到/看不到即红），不留假绿路径：
//   1&2. 流程库 rail 标签走 i18n（不再泄漏 raw key `sidebar.workflows`）且不截断。
//   4①.  提示词库精选按「来源」分类导航（chip 行渲染，且能筛）。
//   4②③④. 提示词卡有标题+来源；暗色下徽标/标题遮罩托得住白字（计算色 + 眼见截图）。
//   3.   素材库图片预览关闭钮暗色下与背景有对比（描边非透明，计算色断言）。
//   5.   模型配置无 logo 的家用统一「白底描边框」首字母徽标（框可见，与 logo 框对齐）。
//   EN.  切到 English 后这几屏无 CJK 漏译（EN-DOM 断言网）。
//
// 用法：pnpm run build:renderer && pnpm run build:electron && node tests/ux/visibility-i18n-batch.walk.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { launchNomiApp } from './_launchApp.mjs'
import { openRailDrawer, setAppLanguage } from './_shell.mjs'
import { stationTimeout } from './_station-budget.mjs'
import {
  expectVisible,
  clickOrFail,
  proveProbe,
  expectAbsent,
  readComputedColorChannels,
  applyColorSchemeForShot,
  screenshotSettled,
  expectNoCjkInEnglishDom,
} from './_assert.mjs'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shotsDir = path.join(repoRoot, 'tests', 'ux', 'shots', 'visibility-i18n-batch')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

const root = makeTempDir('nomi-visibility-i18n-')
const settingsDir = path.join(root, 'settings')
const projectsDir = path.join(root, 'projects')
fs.mkdirSync(settingsDir, { recursive: true })

// seed 一张真图（左深右亮）：素材库图片预览的关闭钮就压在它上面，专测「亮区/暗区都要看得见」。
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
function seedImageProject() {
  const projectRoot = path.join(projectsDir, 'visibility-proj')
  const importedDir = path.join(projectRoot, 'assets', 'imported')
  fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
  fs.mkdirSync(importedDir, { recursive: true })
  const filter = 'color=c=0x202024:s=1200x800:d=1,drawbox=x=600:y=0:w=600:h=800:color=white:t=fill'
  const run = spawnSync(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', path.join(importedDir, 'uxc-测试图.png')], { timeout: 60_000 })
  if (run.status !== 0) throw new Error('图夹具编码失败: ' + run.stderr?.toString().slice(-300))
  const generationCanvas = { nodes: [], edges: [], selectedNodeIds: [], groups: [], canvasZoom: 1, canvasPan: { x: 0, y: 0 } }
  const payload = { workbenchDocument: null, timeline: null, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false }
  const project = { id: 'visibility-proj', name: 'UXC可见性验收', version: 2, createdAt: 1, updatedAt: 2, savedAt: 2, revision: 1, lastKnownRootPath: projectRoot, workbenchDocument: null, timeline: null, generationCanvas, payload }
  fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(project, null, 2))
  fs.writeFileSync(path.join(projectRoot, '.nomi', 'project.json'), JSON.stringify(project, null, 2))
}
seedImageProject()

let app
try {
  let win
  ;({ app, win } = await launchNomiApp({ name: 'visibility-i18n-batch', userDataDir: settingsDir, settingsDir, projectsDir, args: ['--no-proxy-server'], settleMs: 1800 }))
  const getWin = () => {
    const live = app.windows().filter((p) => !p.isClosed())
    win = live.find((p) => /projectId=/.test(p.url())) || live[live.length - 1] || win
    return win
  }
  await win.evaluate(() => { for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(k, 'seen') })
  await win.reload()

  // 进项目 → 生成区（库侧栏只在生成区挂载）。等的是「元素出现」，不是固定时长。
  const projectCard = win.locator('[data-project-card="true"]', { hasText: 'UXC可见性验收' }).first()
  await expectVisible(projectCard, '起始页应出现 seed 的验收项目卡')
  await projectCard.dblclick({ timeout: 5000 })
  // 进工作台的信号：顶栏工作区切换按钮出现（而非睡固定时长）。
  const generationTab = getWin().locator('button[data-mode="generation"]').first()
  await expectVisible(generationTab, '进入工作台后顶栏应出现工作区切换')
  const cont = getWin().getByRole('button', { name: /继续创作/ }).first()
  if (await cont.isVisible().catch(() => false)) await cont.click()
  await clickOrFail(getWin().locator('button[data-mode="generation"]').first(), '顶栏「生成」工作区切换')

  // ── 问题 1&2：流程库 rail 标签走 i18n、不泄漏 raw key ──
  // 基线：rail 上「流程」这颗按钮存在（aria-label 已本地化为「流程库」——修复前它是 raw key）。
  const workflowRail = getWin().locator('[data-shell-rail-item="flows"]')
  await proveProbe(workflowRail, 'rail 上有「流程库」按钮（aria-label 已本地化）')
  // 断言：整个左栏 + 抽屉里不存在任何 raw i18n key 文本（`sidebar.workflows` / `sidebar.workflowLibrary`）。
  const rawKeyNode = getWin().locator('[data-shell-rail] :text("sidebar.workflow"), [data-shell-drawer] :text("sidebar.workflow")')
  const railProbe = await proveProbe(getWin().locator('[data-shell-rail-item="assets"]'), 'rail 至少有「素材库」按钮（探针活性）')
  await expectAbsent(rawKeyNode, { provenBy: railProbe, message: 'rail/面板不该出现未翻译的 raw key sidebar.workflow*' })
  await openRailDrawer(getWin(), 'flows', '流程库 rail 按钮')
  await getWin().waitForTimeout(1000)
  // 抽屉内容区沿用「流程库」当面板名（抽屉头部写的是左栏名「流程」；外壳只搬容器，内容的身份不变），应是本地化的「流程库」而非 raw key。
  await expectVisible(getWin().getByRole('region', { name: '流程库' }).first(), '流程库面板名应本地化为「流程库」')
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '01-workflow-library-i18n.png') })

  // ── 问题 4①：提示词库按来源分类导航 ──
  // 2026-10-24 改版（拍板图 LibraryDrawers）：来源 chip 那一长排删了，并进抽屉里那颗「分类 ▾」——菜单的「公开库」段按来源列。
  await openRailDrawer(getWin(), 'prompts', '提示词库 rail 按钮')
  const promptsDrawer = getWin().locator('[data-shell-drawer="prompts"]')
  await clickOrFail(promptsDrawer.locator('[data-library-category-menu]'), '提示词库的「分类 ▾」')
  const categoryMenu = getWin().getByTestId('library-category-menu')
  // 至少一个真实来源（从数据派生，非硬编码）：公开库离线也有打包快照兜底。
  await expectVisible(categoryMenu.getByRole('menuitemradio').filter({ hasText: /GPT|Sora|Nano|4o/ }).first(), '分类菜单里应按来源列出公开库（治「一大片无分类」）', stationTimeout({ operations: 2 }))
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '02-prompt-source-nav.png') })
  // 收菜单：点回当前选着的「全部」（不改筛选）。不按 Esc——抽屉里的菜单按 Esc 会连抽屉一起收起
  // （左栏抽屉的 Esc 判据在菜单已卸载后才查「还有没有别的层」；那处是热点，交协调另立账）。
  await clickOrFail(categoryMenu.getByRole('menuitemradio', { name: /^全部/ }).first(), '菜单里点回「全部」收起菜单')

  // ── 问题 4②③④：提示词卡标题 / 类型在封面下，暗色下照样看得清 ──
  // 改版后封面上不再压任何字和角标（P-09），标题和「类型」移到封面下的卡面上——这一类「暗色角标托不住白字」不再有。
  const firstPromptCard = promptsDrawer.locator('[data-prompt-card]').first()
  await expectVisible(firstPromptCard, '提示词库至少有一张提示词卡')
  await applyColorSchemeForShot(getWin(), 'dark')
  await getWin().waitForTimeout(250)
  await expectVisible(firstPromptCard.locator('[data-prompt-card-title]'), '暗色下卡下标题应可见')
  await expectVisible(firstPromptCard.locator('[data-prompt-card-meta]').filter({ hasText: /图片|视频/ }), '暗色下卡下类型（图片/视频）应可见')
  const coverText = await firstPromptCard.locator('[data-prompt-cover]').evaluate((cover) => cover.innerText.trim())
  if (coverText) throw new Error(`封面上又压了字：「${coverText}」——角标 / 标题应在封面下`)
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '03-prompt-card-dark.png') })
  await applyColorSchemeForShot(getWin(), 'light')
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '03-prompt-card-light.png') })

  // ── 问题 3：素材库图片预览关闭钮暗色下与背景有对比 ──
  await openRailDrawer(getWin(), 'assets', '素材库 rail 按钮')
  await getWin().waitForTimeout(900)
  const allAssetsTab = getWin().getByRole('tab', { name: /全部素材/ }).first()
  if (await allAssetsTab.isVisible().catch(() => false)) await clickOrFail(allAssetsTab, '全部素材标签')
  const assetCard = getWin().getByRole('button', { name: 'uxc-测试图.png', exact: true }).first()
  await expectVisible(assetCard, '素材库应出现 seed 的测试图卡')
  await assetCard.dblclick({ timeout: 5000 })
  const closeBtn = getWin().getByRole('button', { name: '关闭预览' }).first()
  await expectVisible(closeBtn, '图片预览关闭钮应存在')
  await applyColorSchemeForShot(getWin(), 'dark')
  await getWin().waitForTimeout(250)
  // 关闭钮描边非透明（背景是 black/60，无描边会与暗背景融为一体——用户反馈「找不到关闭钮」）。
  const closeBorder = await readComputedColorChannels(closeBtn, 'border-top-color')
  const borderAlpha = closeBorder.channels[3] ?? 1
  if (!(borderAlpha > 0.1)) {
    throw new Error(`关闭钮描边太透明（alpha=${borderAlpha}，raw=${closeBorder.raw}）——暗背景上会隐形`)
  }
  const closeBg = await readComputedColorChannels(closeBtn, 'background-color')
  if (!((closeBg.channels[3] ?? 1) >= 0.6)) {
    throw new Error(`关闭钮底色太透明（alpha=${closeBg.channels[3]}，raw=${closeBg.raw}）`)
  }
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '04-asset-preview-close-dark.png') })
  await getWin().keyboard.press('Escape')
  await getWin().waitForTimeout(500)
  await applyColorSchemeForShot(getWin(), 'light')

  // ── 问题 5：模型配置无 logo 的家用统一「白底描边框」首字母徽标 ──
  await getWin().evaluate(() => window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'models' } })))
  // 探针：品牌标渲染出来了（logo 与首字母徽标都带稳定标记 data-connection-mark）。expectVisible 自会等它挂载。
  const anyConnectionMark = getWin().locator('[data-connection-mark]').first()
  await expectVisible(anyConnectionMark, '模型设置列表应渲染出品牌标', 20_000)
  // 断言：logo 标与 monogram 标共用同一「白底描边框」——两类都存在、且每个都带描边，不再有「无框悬空灰字」。
  const marks = await getWin().evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-connection-mark]')]
    let logo = 0, monogram = 0, framed = 0, unframed = 0
    for (const n of nodes) {
      const kind = n.getAttribute('data-connection-mark')
      if (kind === 'logo') logo += 1
      else if (kind === 'monogram') monogram += 1
      const bw = parseFloat(getComputedStyle(n).borderTopWidth || '0')
      if (bw > 0) framed += 1; else unframed += 1
    }
    return { total: nodes.length, logo, monogram, framed, unframed }
  })
  if (marks.total === 0 || marks.unframed > 0) {
    throw new Error(`模型品牌标未全部加框：framed=${marks.framed} unframed=${marks.unframed}（共 ${marks.total}）——logo 参差未统一`)
  }
  if (marks.monogram === 0) {
    throw new Error('这一屏没有首字母徽标类品牌标，无法验证「无 logo 家也进统一框」——换一屏或放宽 seed')
  }
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '05-model-marks-consistent.png') })

  // ── EN-DOM：切英文后这几屏无 CJK 漏译 ──
  // 走生产路径切语言：设置 → 通用 tab → 点 English（data-settings-locale=en → setAppLocale）。
  await setAppLanguage(getWin(), 'en', '设置里的 English 语言按钮')
  // 回到流程库这一屏（现应为英文），断言无 CJK 漏译（用户内容豁免）。
  await openRailDrawer(getWin(), 'flows', 'Workflow library rail (en)')
  await getWin().waitForTimeout(900)
  await expectNoCjkInEnglishDom(getWin(), { message: '流程库这一屏在 en 下不应残留中文', allowSelectors: ['[data-user-content]'] })
  await screenshotSettled(getWin(), { path: path.join(shotsDir, '06-workflow-en.png') })

  console.log('\n✅ UXC 可见性/i18n 批走查全部断言通过')
  console.log(`截图：${shotsDir}`)
} catch (error) {
  console.error('\n❌ 走查失败:', error?.message || error)
  try { await app?.windows()[0]?.screenshot({ path: path.join(shotsDir, 'FAIL.png') }) } catch {}
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
}
