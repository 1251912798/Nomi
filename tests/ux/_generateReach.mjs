// 点节点底栏 ↑ 之前，先把画布调到「真鼠标点得到它」（协调 10-22）。
//
// 起因：导演台「出成片」之后画布对焦放大到 200% 以上，节点下方的生成框和 ↑ 会掉出视口、或被时间轴条 / Agent 面板盖住，真鼠标点落空
// （付费样本 2 次点 ↑ 没反应；免费复现见 director-reference-attach.walk.mjs 的 NOMI_WALK_PAID_LIKE=1）。产品的对焦另线修；
// 脚本这边先用画布自己的控件（收起 Agent 面板、适配视图、缩小）把按钮调到能点，再用「按钮中心点必须是它自己」自检，点不到就报错。
import { canvasFitViewButton, canvasZoomPercent, canvasZoomStep, collapseAgentPanel } from './_shell.mjs'
import { waitForCanvasViewportSettled } from './_canvasHit.mjs'
import { stationTimeout } from './_station-budget.mjs'

/** 按钮此刻在不在视口里、禁没禁用、中心点上是不是它自己（被别的元素盖着 = 真鼠标点不到）。 */
export function readButtonReach(button) {
  return button.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    const describe = (el) => (el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}${el.getAttribute('aria-label') ? ` [${el.getAttribute('aria-label')}]` : ''}` : null)
    return {
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }, viewport: { w: innerWidth, h: innerHeight },
      disabled: element.disabled, hitIsButton: Boolean(top && (top === element || element.contains(top))), hitElement: describe(top),
    }
  }).catch((error) => ({ error: String(error?.message ?? error), hitIsButton: false }))
}

/** 调到点得到为止；调了几步、最后什么样都返回，点不到就抛（一分钱没花）。 */
export async function bringButtonIntoReach(win, button, label) {
  const steps = []
  await collapseAgentPanel(win).catch(() => {})
  const fit = canvasFitViewButton(win)
  if (await fit.isEnabled().catch(() => false)) {
    await fit.click({ timeout: stationTimeout({ operations: 1 }) }).catch(() => {})
    await waitForCanvasViewportSettled(win)
    steps.push('fit-view')
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await readButtonReach(button)
    if (state.hitIsButton && !state.disabled) return { ...state, steps, zoom: await canvasZoomPercent(win).catch(() => null) }
    await canvasZoomStep(win, 'out', `${label}：缩小一步让 ↑ 进视口`)
    await waitForCanvasViewportSettled(win)
    steps.push('zoom-out')
  }
  const last = await readButtonReach(button)
  throw new Error(`点不到 ↑（一分钱没花）：${label}：调了 ${steps.join(' → ')} 之后，按钮中心点上是 ${last.hitElement ?? '视口外（没有元素）'}，视口 ${JSON.stringify(last.viewport)}，按钮 ${JSON.stringify(last.rect)}，禁用=${last.disabled}`)
}
