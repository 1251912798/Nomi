import React from 'react'
import { createPortal } from 'react-dom'
import { NOMI_OVERLAY_Z_INDEX } from './overlayLayers'
import { resolveAnchoredPopoverPlacement, type AnchoredPopoverAlign } from './anchoredPopoverPlacement'

/**
 * 锚点浮层：Portal 到 body + fixed 贴锚点，**逃出祖先 overflow 的裁切**。
 *
 * ⚠️ **它不是「全站唯一」的浮层定位机制**（这句话在 2026-09-07 之前一直写在这里，
 * 而它从来不是真的；照它写的人会以为已经收口了）。全仓浮层定位**实际有四套**：
 *   ① 本组件 —— 生产侧只有 2 个消费者（`workbench/timeline/TimelineTransitionPicker.tsx`、
 *      `workbench/assets/AssetPickerPopover.tsx`），外加设计实验室的 3 处陈列；
 *   ② Radix —— `src/design/tooltip.tsx`（tooltip 一族全走它）；
 *   ③ Mantine —— `src/design/overlays.tsx` 的 `DesignModal`（Modal 自带定位与遮罩）；
 *   ④ 手写 `getBoundingClientRect()` + `createPortal` —— **8 个文件**：
 *      `generationCanvas/nodes/{NodeGenerationComposer,InlineParameterBar,ClipNode,PanoramaViewer}.tsx`、
 *      `generationCanvas/components/{SelectionPromptSaveController,ScreenshotCropOverlay}.tsx`、
 *      `creation/DocumentListSidebar.tsx`、`assets/AssetTile.tsx`。
 *
 * **要收口的话该往哪收**：④ 那 8 处是真正的债（每处各写一遍贴边/避让/关闭），收到本组件；
 * ② 不收（Radix tooltip 的 a11y 与 hover 延迟是它自带的，重写一遍不划算）；
 * ③ 不收（Modal 是居中模态不是锚点浮层，不同形态）。收口归属：D 档刀 1/刀 3。
 *
 * 为什么必须 Portal 而不是在原地写 absolute：只要浮层与它的定位祖先之间夹着一个
 * `overflow: hidden`（时间轴的轨道格、composer 卡、属性面板的分组…），浮层就会被裁成一条边。
 * 这一族最阴的地方在于**三样常用证据全都看不出来**：
 *   · DOM 里在（count>0、toBeVisible 都绿）；
 *   · getBoundingClientRect 照样报完整尺寸——**裁切不改 rect**；
 *   · Playwright 的 click 会先 scrollIntoViewIfNeeded 把那个容器滚一下再点，所以脚本点得动。
 * 唯独真人看不见、也点不到。2026-09-06 的转场选择器就是这么绿了一整轮走查
 * （49 个采样点只有 7 个命中，8 颗按钮里 7 颗 elementFromPoint 落到别的轨道上）。
 *
 * 判据别再用 rect，用 `tests/ux/_assert.mjs` 的 measureOverlayReach / expectOverlayReachable。
 *
 * 新增**锚点式**浮层用它，不要再各写各的 absolute，也不要引第五套定位库。
 * （这条以前写成「P1：一律用它」——一句管不住 8 个反例的 P1 不如不写。）
 */

export type AnchoredPopoverProps = {
  /** 贴谁。不给就贴「浮层原本在流里的那个位置」（组件会就地留一个 0 尺寸锚点）。 */
  anchorRef?: React.RefObject<HTMLElement | null>
  /** 相对锚点的横向对齐。 */
  align?: AnchoredPopoverAlign
  /** 锚点与浮层之间的缝。 */
  gap?: number
  /** 层级。默认走 overlayLayers 的 popover 档；调用方要压低（例如让位给更高的模态）才传。 */
  zIndex?: number
  /** 传了就接管「点外面 / Esc 关闭」。不传则由调用方自己管开合。 */
  onClose?: () => void
  children: React.ReactNode
}

type Placement = { top: number; left: number }

export function AnchoredPopover({
  anchorRef,
  align = 'start',
  gap = 4,
  zIndex,
  onClose,
  children,
}: AnchoredPopoverProps): JSX.Element {
  const fallbackAnchorRef = React.useRef<HTMLSpanElement>(null)
  const popRef = React.useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = React.useState<Placement | null>(null)

  const reposition = React.useCallback(() => {
    const anchor = anchorRef?.current ?? fallbackAnchorRef.current
    const pop = popRef.current
    if (!anchor || !anchor.isConnected) return
    setPlacement(resolveAnchoredPopoverPlacement(
      anchor.getBoundingClientRect(),
      { width: pop?.offsetWidth || 300, height: pop?.offsetHeight || 360 },
      align,
      gap,
      { width: window.innerWidth, height: window.innerHeight },
    ))
  }, [align, anchorRef, gap])

  // 两段式：先按估计尺寸放一次，渲染后按实测尺寸修正（修正前 visibility:hidden，不闪）。
  React.useLayoutEffect(reposition, [reposition])

  // 锚点会动：时间轴横向滚动、面板拖宽、窗口缩放。跟着重算，别让浮层停在原地指着空气。
  // 浮层自己也会变高（转场选择器换成「硬切」就少一行时长）——向上翻转时高度是位置的输入，
  // 不跟着重算就会把长高的那一截顶出视口，于是又变回「露不全」。
  React.useEffect(() => {
    const onMove = () => reposition()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onMove)
    if (observer && popRef.current) observer.observe(popRef.current)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      observer?.disconnect()
    }
  }, [reposition])

  React.useEffect(() => {
    if (!onClose) return undefined
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    const onDown = (event: MouseEvent) => {
      const target = event.target as globalThis.Node
      const anchor = anchorRef?.current ?? fallbackAnchorRef.current
      if (popRef.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [anchorRef, onClose])

  const layer = (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        top: placement?.top ?? -9999,
        left: placement?.left ?? -9999,
        zIndex: zIndex ?? NOMI_OVERLAY_Z_INDEX.popover,
        visibility: placement ? 'visible' : 'hidden',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )

  return (
    <>
      {/* 0 尺寸锚点：不给 anchorRef 时用它代表「浮层原本该待的位置」。 */}
      {anchorRef ? null : <span ref={fallbackAnchorRef} className="inline-block h-0 w-0 align-bottom" aria-hidden="true" />}
      {typeof document === 'undefined' ? layer : createPortal(layer, document.body)}
    </>
  )
}
