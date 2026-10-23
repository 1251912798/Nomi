/**
 * 「点外面就收起」只有这一种听法：document 上的 `pointerdown`，**捕获阶段**。
 *
 * 为什么不能听 `mousedown` / 冒泡阶段：按下点下面的东西会把这一下吃掉，document 根本收不到。
 *   · 画布空白处是 d3-zoom 的平移面：它在 `mousedown` 上 `stopImmediatePropagation()`（d3-zoom/src/zoom.js），
 *     节点拖拽（d3-drag）同理——画布上每一次按下，冒泡的 mousedown 都到不了 document；
 *   · React Flow 框选时在 `pointerdown` 上 `preventDefault()`，浏览器就不再派发随后的兼容 `mousedown`；
 *   · 节点里、浮层里到处是 `onPointerDown={(e) => e.stopPropagation()}`，冒泡的 pointerdown 也会断在半路。
 * 2026-10-23 用户实测：画布左下「⋯」点开后点画布中间不收，一直挡着；左栏抽屉、任务中心同因。
 * 捕获阶段在任何目标处理器之前先到 document，下面谁拦都拦不住。
 *
 * `isInside` 判「这一下算不算点在我自己身上」（浮层本体、触发钮、自己弹出的下拉…），由调用方给；
 * 返回 true 就不收。返回清理函数，放进 effect 的 cleanup。
 */
export function listenOutsidePress(isInside: (target: EventTarget | null) => boolean, onOutside: (event: PointerEvent) => void): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    if (isInside(event.target)) return
    onOutside(event)
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  return () => document.removeEventListener('pointerdown', onPointerDown, true)
}
