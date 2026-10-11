// 分组框在走查里的**唯一**定位出口（10-10 拍板：框头进框内后，各走查不再各抄一份选择器）。
//
// 为什么要它：框头从框外标签改到框内一行（组名 · 计数 + 生成全部），工具条的图标动作也是新入口。旧的选择器散在八份走查里，
// 框头一改就同时悬空。现在走查找框 / 框头 / 标题 / 计数 / 生成全部 / 工具条的组名与图标动作，一律经这里；框头再变，只改这一个文件。
//
// 页面里读 DOM 的走查（page.evaluate）用下面的字符串常量；Playwright 定位用对应的函数。
import { clickOrFail } from './_assert.mjs'
import { GROUP_TOOLBAR } from './_groupGenerate.mjs'

/** 框体（绝对定位的 div，带 data-group-id）。 */
export const GROUP_FRAME_SELECTOR = '.generation-canvas-v2__group-box[data-group-id]'
/** 框头（框内左上一行：组名 · 计数 · 生成全部）。 */
export const GROUP_FRAME_HEADER_SELECTOR = '.generation-canvas-v2__group-box-label'
/** 框头里的组名（分镜组带「分镜 · 」前缀）。 */
export const GROUP_FRAME_TITLE_SELECTOR = '[data-frame-title="true"]'
/** 框头里的计数（「6 镜」「3 个」，拖动中「6 → 5」）。 */
export const GROUP_FRAME_COUNT_SELECTOR = '[data-frame-count="true"]'
/** 框头右上「生成全部」。 */
export const GROUP_FRAME_GENERATE_ALL_SELECTOR = '[data-frame-generate-all="true"]'
/** 分组工具条上的组名与计数（与框头同一显示函数：分镜 · 名 · N 镜）。 */
export const GROUP_TOOLBAR_TITLE_SELECTOR = '[data-group-toolbar-count="true"]'
/** 分组工具条上直接摆的三个图标动作（改名 / 说明、折叠成卡、删除）：按 data-toolbar-action 找，不依赖语言。 */
export const GROUP_TOOLBAR_ICON_ACTIONS = { edit: 'group-edit', collapse: 'group-collapse', delete: 'group-delete' }

/** 按组 id 找框体。 */
export function groupFrame(win, groupId) {
  return win.locator(`.generation-canvas-v2__group-box[data-group-id="${groupId}"]`)
}
/** 框头根（框体内）。 */
export function groupFrameHeader(frame) {
  return frame.locator(GROUP_FRAME_HEADER_SELECTOR).first()
}
export function groupFrameTitle(frame) {
  return frame.locator(GROUP_FRAME_TITLE_SELECTOR).first()
}
export function groupFrameCount(frame) {
  return frame.locator(GROUP_FRAME_COUNT_SELECTOR).first()
}
export function groupFrameGenerateAll(frame) {
  return frame.locator(GROUP_FRAME_GENERATE_ALL_SELECTOR).first()
}
export function groupToolbarTitle(win) {
  return win.locator(GROUP_TOOLBAR_TITLE_SELECTOR).first()
}
/** 工具条上的某个图标动作（edit / collapse / delete）。 */
export function groupToolbarAction(win, action) {
  return win.locator(GROUP_TOOLBAR).locator(`[data-toolbar-action="${GROUP_TOOLBAR_ICON_ACTIONS[action]}"]`).first()
}

// ── 框的动作入口（右键菜单 / 工具条图标）──

/**
 * 框体空白点：在框体自己的元素上、没被别的东西（工具簇 / 成员卡 / 浮条）盖住的一点。
 * 先试左下角内缩区（左上角压着节点名字标签，右下角常被成员卡盖住），再沿底边、沿上沿扫；
 * 每个候选点都用 elementFromPoint 验过「点下去命中的就是这个框」，一个都没有就抛（fail-closed）。
 */
export async function frameBlankPosition(frame) {
  const position = await frame.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hits = (x, y) => {
      const px = rect.left + x
      const py = rect.top + y
      if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) return false
      return document.elementFromPoint(px, py) === element
    }
    const candidates = []
    for (const y of [rect.height - 8, rect.height - 24, 8]) {
      for (let x = 8; x < rect.width - 8; x += 24) candidates.push({ x, y })
    }
    return candidates.find((point) => point.y > 0 && hits(point.x, point.y)) ?? null
  })
  if (!position) throw new Error('框体上找不到没被盖住的空白点（fail-closed）')
  return position
}

/** 右键框体空白打开框菜单（完整六项；工具条上的改名 / 折叠 / 删除是直接摆的图标）。 */
export async function openFrameMenuByRightClick(frame) {
  await frame.click({ button: 'right', position: await frameBlankPosition(frame) })
}

/** 选中框（点框体空白）：分组工具条随之出现。 */
export async function selectFrameByBlankClick(frame) {
  await frame.click({ position: await frameBlankPosition(frame) })
}

/** 选中框后点工具条上的图标动作（改名 / 折叠 / 删除）。 */
export async function clickFrameToolbarAction(win, frame, action) {
  await selectFrameByBlankClick(frame)
  await clickOrFail(groupToolbarAction(win, action), `分组工具条「${action}」图标`)
}
