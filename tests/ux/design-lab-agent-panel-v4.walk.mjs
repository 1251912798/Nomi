// 设计实验室 · Agent 面板 v4 走查（R13 人眼判断的素材源）。零额度：纯本地渲染，不碰任何生成 API。
//
// 流程住 `design-lab/walkScreen.mjs`——三屏共用一份。这里只声明这一屏的取景参数。
//
// 取景宽度 = 面板宽 390 + `Piece` 取景框的左右内边距：这一屏大多数格子只渲**一个积木**
// （定稿 Vocabulary / Composer 两板画的就是单件的状态阵列），不是整块面板。
//
// 用法：node tests/ux/design-lab-agent-panel-v4.walk.mjs  （ONLY=v4-composer-idle 只跑一个）
// 付费卡（含刹车退回的那一张）不在这一屏了：它住自己的屏 `spend-card`（SpendCardQ1 板，D2 第③步），
// 断言在 tests/ux/design-lab-spend-card.walk.mjs。
import { walkDesignLabScreen } from './design-lab/walkScreen.mjs'

await walkDesignLabScreen({
  screen: 'agent-panel-v4',
  title: 'Agent 面板 v4',
  // 端口按 worktree + 角色派生（design-lab/labServer.mjs）：写死端口在这台常年 20+ worktree
  // 的机器上一定会撞，撞了截回来的是别人分支的 UI（docs/lessons/design-lab-port-5197-collision-fakes-visual-red.md）。
  role: 'walk-agent-panel-v4',
  cellWidth: 410,
  columns: 4,
  async assertState(page, state, record) {
    if (state.id === 'v4-consent-first-ask') {
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('[data-v4-block="consent"]')
        const decline = document.querySelector('[data-v4-consent-decline]')
        const accept = document.querySelector('[data-v4-consent-accept]')
        if (!(card instanceof HTMLElement) || !(decline instanceof HTMLElement) || !(accept instanceof HTMLElement)) return null
        card.style.width = '300px'
        card.style.boxSizing = 'border-box'
        const rect = (element) => {
          const box = element.getBoundingClientRect()
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
        }
        return { card: rect(card), decline: rect(decline), accept: rect(accept) }
      })
      if (!geometry) {
        record(`${state.id} consent action geometry missing`)
      } else {
        const { card, decline, accept } = geometry
        if (accept.width <= 0 || accept.height <= 0 || accept.right > card.right + 1 || accept.bottom > card.bottom + 1) {
          record(`${state.id} primary action is clipped at narrow width: ${JSON.stringify(geometry)}`)
        }
        if (accept.right < decline.right - 1 || accept.top < decline.top - 1) {
          record(`${state.id} primary action is not the rightmost action on the final row: ${JSON.stringify(geometry)}`)
        }
      }
    }
  },
})
