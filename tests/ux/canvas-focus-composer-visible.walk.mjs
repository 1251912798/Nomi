#!/usr/bin/env node
// 对焦节点后，生成框的 ↑ 必须在可见区里、点得到（2026-10-22）。
//
// 现场：「出成片」回画布 / 侧栏定位，对焦只看节点本身，会把画布放大到 200% 以上并居中节点；
// 节点下方的生成框和 ↑ 掉出视口，或被浮动 Agent 窗、缩放条盖住，用户还得自己平移画布才点得到生成。
// 本走查走真实对焦入口（FOCUS_GENERATION_NODE_EVENT 的监听器，和 9 处调用方派的是同一个事件），
// 在 1280×933 窗口、Agent 面板「停靠」与「浮窗」两种形态下各对焦一次，断言：
//   · 对焦后缩放 ≤ 100%；
//   · ↑（生成钮）中心点在画布舞台内；
//   · elementFromPoint(↑ 中心) 就是 ↑ 自己（没有被浮动 Agent 窗 / 缩放条 / 时间轴盖住）。
// 零额度：只点对焦，不点生成；真 Electron、窗口在屏外、隔离 profile。
// Run: pnpm run build && node tests/ux/canvas-focus-composer-visible.walk.mjs
import fs from 'node:fs'
import path from 'node:path'
import { launchNomiApp, ACCEPTANCE_VIEWPORT, repoRoot } from './_launchApp.mjs'
import { waitForCanvasViewportSettled, findCanvasBlankPoint } from './_canvasHit.mjs'
import { clickOrFail, expect, screenshotSettled } from './_assert.mjs'
import { addCanvasNode, canvasZoomPercent, canvasZoomStep, ensureAgentPanelOpen, newProjectEntry, setAppLanguage, AGENT_PANEL } from './_shell.mjs'

const shotsDir = path.join(repoRoot, 'tests/ux/shots/canvas-focus-composer-visible')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

const SUBMIT = 'button[aria-label="生成素材"],button[aria-label="重新生成"],button[aria-label="Generate asset"],button[aria-label="Regenerate"]'
const STAGE = '.generation-canvas-v2__stage'

const { app, win } = await launchNomiApp({
  name: 'canvas-focus-composer-visible',
  viewportSize: ACCEPTANCE_VIEWPORT,
  args: ['--no-proxy-server'],
  settleMs: 0,
  initialLocalStorage: { 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen' },
})

win.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)))
win.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)) })
let failure
try {
  await newProjectEntry(win).click()
  await win.getByRole('button', { name: '生成', exact: true }).click()
  await addCanvasNode(win, 'video')
  const card = win.locator('.generation-canvas-v2-node[data-node-id]').first()
  await card.waitFor()
  const nodeId = await card.getAttribute('data-node-id')
  if (!nodeId) throw new Error('新建的视频节点没有 data-node-id')

  async function focusAndMeasure(label, shotName) {
    // 先点空白取消选择、把画布放大到 200% 以上（事故现场就是对焦前用户处在放大的视图里）。
    const blank = await findCanvasBlankPoint(win)
    if (blank) await win.mouse.click(blank.x, blank.y)
    for (let i = 0; i < 12 && (await canvasZoomPercent(win)) < 220; i += 1) await canvasZoomStep(win, 'in', `${label}：放大到 200% 以上`)
    await waitForCanvasViewportSettled(win)
    const before = await canvasZoomPercent(win)
    // 真实入口：与侧栏定位 / 出成片后定位 / 副本角标等 9 处调用方派的是同一个事件，由画布监听器接手。
    await win.evaluate((id) => window.dispatchEvent(new CustomEvent('nomi-focus-generation-node', { detail: { nodeId: id } })), nodeId)
    // board:NodePointer/canvas.node.highlight —— 定位闪光改中性（2026-10-23 D2）：对焦那条路给节点外壳一档 flash，
    // 样子是深色细线 + ink 淡光晕，不用强调色；1.4 秒后由同一条路清掉。列表 / 通知 / 侧栏等 9 处入口派的都是这个事件。
    const shell = win.locator(`.react-flow__node[data-id="${nodeId}"] .generation-canvas-react-flow__node-shell`)
    await expect(shell, `${label}：对焦后外壳没有闪一下`).toHaveAttribute('data-external-highlight', 'flash', { timeout: 1500 })
    const flash = await shell.evaluate((el) => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--nomi-accent)'
      document.body.appendChild(probe)
      const accent = getComputedStyle(probe).color
      probe.remove()
      return { shadow: getComputedStyle(el).boxShadow, accent }
    })
    console.log('FOCUS_FLASH', JSON.stringify({ label, ...flash }))
    expect(flash.shadow !== 'none' && !flash.shadow.includes(flash.accent), `${label}：闪一下必须是中性光晕、不许强调色（${flash.shadow}）`).toBe(true)
    await expect(shell, `${label}：闪完没有清掉`).not.toHaveAttribute('data-external-highlight', /.+/, { timeout: 4000 })
    await expect.poll(() => canvasZoomPercent(win), { message: `${label}：对焦事件派出后画布没有任何移动` }).not.toBe(before)
    await waitForCanvasViewportSettled(win)
    const submit = win.locator(`.generation-canvas-v2-node[data-node-id="${nodeId}"] ${SUBMIT}, ${SUBMIT}`).first()
    await expect(submit, `${label}：对焦后 ↑ 没出现`).toBeVisible()
    await waitForCanvasViewportSettled(win)
    const after = await canvasZoomPercent(win)
    const probe = await submit.evaluate((button, stageSelector) => {
      const rect = button.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const stage = document.querySelector(stageSelector)?.getBoundingClientRect()
      const hit = document.elementFromPoint(x, y)
      return {
        x, y,
        inStage: Boolean(stage && x >= stage.left && x <= stage.right && y >= stage.top && y <= stage.bottom),
        hitIsButton: Boolean(hit && button.contains(hit)),
        hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 60)}` : null,
      }
    }, STAGE)
    console.log('FOCUS_COMPOSER', JSON.stringify({ label, zoomBefore: before, zoomAfter: after, ...probe }))
    await screenshotSettled(win, { path: path.join(shotsDir, `${shotName}.png`) })
    expect(after, `${label}：对焦后缩放不许超过 100%（对焦前 ${before}%）`).toBeLessThanOrEqual(100.5)
    expect(probe.inStage, `${label}：↑ 中心 (${probe.x}, ${probe.y}) 在舞台外`).toBe(true)
    expect(probe.hitIsButton, `${label}：↑ 被别的元素盖住：${probe.hit}`).toBe(true)
  }

  await focusAndMeasure('Agent 停靠 / 中文', 'zh-dock')

  await ensureAgentPanelOpen(win, '展开 Agent')
  const toFloat = win.locator(`${AGENT_PANEL} [data-agent-form-to="float"]`).first()
  await clickOrFail(toFloat, 'Agent 切成浮窗')
  await expect(win.locator('[data-agent-float]').first(), 'Agent 浮窗没出现').toBeVisible()
  await focusAndMeasure('Agent 浮窗 / 中文', 'zh-float')

  await setAppLanguage(win, 'en')
  await focusAndMeasure('Agent 浮窗 / 英文', 'en-float')
} catch (error) {
  failure = error
} finally {
  await app.close().catch(() => {})
}
if (failure) {
  console.error(failure)
  process.exit(1)
}
console.log('canvas-focus-composer-visible: OK')
