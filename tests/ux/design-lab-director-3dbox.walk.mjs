// 设计实验室 · 导演视图（3D-BOX）走查（R13 人眼判断的素材源）。零额度：纯本地渲染（无头 Chromium，不起可见窗口），不碰任何生成 API。
//
// 流程住 `design-lab/walkScreen.mjs`（与另几屏共用一份）；这里只声明这一屏的取景参数。
// 产出：`tests/ux/shots/design-lab-director-3dbox/<state>.png` + `_contact-sheet.png`。
// 这一屏的格子要和 Claude Design 画布「3D-BOX · 正在改：镜头 N」七态逐项对账（3c，10-06 拍板）。
//
// 用法：node tests/ux/design-lab-director-3dbox.walk.mjs   （ONLY=d3-focus-3-two-zh 只跑一个）
import { walkDesignLabScreen } from './design-lab/walkScreen.mjs'

await walkDesignLabScreen({
  screen: 'director-3dbox',
  title: '导演视图（3D-BOX）· 正在改：镜头 N',
  role: 'walk-director-3dbox',
  cellWidth: 640,
  columns: 2,
  viewport: { width: 1280, height: 933 },
  async assertState(page, state, record) {
    const statesWithProduce = new Set([
      'd3-produce-idle-zh', 'd3-produce-idle-en',
      'd3-produce-rendering-zh', 'd3-produce-rendering-en',
      'd3-produce-retry-zh', 'd3-produce-too-long-en', 'd3-produce-empty-zh',
      'd3-produce-menu-zh', 'd3-produce-menu-en',
    ])
    if (!statesWithProduce.has(state.id)) return
    const main = page.getByTestId('director-produce-main')
    const menu = page.getByTestId('director-produce-menu')
    const colors = await page.evaluate(() => {
      const resolve = (className) => {
        const probe = document.createElement('span')
        probe.className = className
        document.body.appendChild(probe)
        const value = getComputedStyle(probe).backgroundColor
        probe.remove()
        return value
      }
      return { ink: resolve('bg-nomi-ink'), accent: resolve('bg-nomi-accent') }
    })
    const before = await main.evaluate((node) => getComputedStyle(node).backgroundColor)
    await main.hover()
    const hover = await main.evaluate((node) => getComputedStyle(node).backgroundColor)
    const disabled = await main.isDisabled()
    // board:DirectorProduce/primary · board:DirectorProduce/primary-hover · board:DirectorProduce/primary-disabled · board:DirectorProduce/menu
    if (before !== colors.ink) record(`${state.id} 主按钮平时背景不是 --nomi-ink：${before} !== ${colors.ink}`)
    if (!disabled && hover !== colors.accent) record(`${state.id} 主按钮悬停背景不是 --nomi-accent：${hover} !== ${colors.accent}`)
    if (disabled && hover !== colors.ink) record(`${state.id} 禁用按钮悬停变色：${hover} !== ${colors.ink}`)
    if (!(await menu.isVisible())) record(`${state.id} ▾ 菜单按钮不可见`)
  },
})
