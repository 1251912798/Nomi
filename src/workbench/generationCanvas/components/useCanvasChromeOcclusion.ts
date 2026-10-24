import React from 'react'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { COMPOSER_ROOT_SELECTOR } from '../reactFlow/canvasLayerOrder'

const SHADOW_MARGIN = 24
type Rect = { left: number; top: number; right: number; bottom: number }

/** 外框控件（含投影外扩范围）被一组生成框压住的部分（相对外框控件自己的左上角）。纯函数，便于单测。 */
export function occludedHoles(dock: Rect, composers: readonly Rect[]): Rect[] {
  const holes: Rect[] = []
  const outer = {
    left: dock.left - SHADOW_MARGIN,
    top: dock.top - SHADOW_MARGIN,
    right: dock.right + SHADOW_MARGIN,
    bottom: dock.bottom + SHADOW_MARGIN,
  }
  for (const c of composers) {
    const left = Math.max(outer.left, c.left)
    const top = Math.max(outer.top, c.top)
    const right = Math.min(outer.right, c.right)
    const bottom = Math.min(outer.bottom, c.bottom)
    if (right - left > 0.5 && bottom - top > 0.5) holes.push({ left: left - dock.left, top: top - dock.top, right: right - dock.left, bottom: bottom - dock.top })
  }
  return holes
}

/** 把洞转成 clip-path。外框比盒子大一圈，别把投影一起剪掉；洞用反向缠绕（nonzero 下挖空）。没有洞返回 undefined（不加任何裁剪）。 */
export function clipPathForHoles(width: number, height: number, holes: readonly Rect[]): string | undefined {
  if (holes.length === 0) return undefined
  const m = SHADOW_MARGIN
  const outer = `M${-m} ${-m}H${width + m}V${height + m}H${-m}Z`
  const cut = holes.map((h) => `M${h.left} ${h.top}V${h.bottom}H${h.right}V${h.top}Z`).join('')
  return `path(nonzero,"${outer}${cut}")`
}

/**
 * 「事件触发、合并到一帧」的调度器：schedule() 在同一帧里被叫多少次，下一帧只量一次；没人叫就一次都不量。
 * 纯逻辑（帧函数注入），单测用假帧钉住「静止时零开销」。
 */
export function createFrameCoalescer(measure: () => void, requestFrame: (cb: () => void) => number, cancelFrame: (id: number) => void, isPaused: () => boolean = () => false) {
  let pending = 0
  return {
    schedule() {
      // 暂停期间（画布拖动中）不排帧；恢复时由翻转事件再 schedule 一次。
      if (pending || isPaused()) return
      pending = requestFrame(() => {
        pending = 0
        if (isPaused()) return
        measure()
      })
    },
    dispose() {
      if (pending) cancelFrame(pending)
      pending = 0
    },
  }
}

/**
 * 加节点条 / 缩放簇不许盖在节点生成框上（用户 2026-10-10 验收规则）。
 * 层级做不到（见 canvasLayerOrder.ts 里 chromeDock 的说明），所以把外框控件被生成框压住的那一块用 clip-path 裁掉：
 * 视觉与命中都等同于「生成框在上」。
 * 只在「可能变了」的事件上量一次（合并到一帧）：选中变化、视口平移 / 缩放（react-flow__viewport 的 style）、节点被挪（生成框所在节点的 style）、
 * 拖动状态翻转（stage 的 data-dragging；拖动期间暂停测量，松手那一下量一次）、生成框挂上 / 卸下（stage 子树 childList，生成框是懒加载的）、生成框或外框控件自己变大小（ResizeObserver）、窗口缩放。
 * 静止时零开销——不再每帧强制读布局。值没变不写 DOM。
 */
export function useCanvasChromeOcclusion(ref: React.RefObject<HTMLElement | null>): void {
  const selectionKey = useGenerationCanvasStore((state) => state.selectedNodeIds.join('|'))
  React.useEffect(() => {
    const el = ref.current
    const stage = el?.closest<HTMLElement>('[data-shortcut-surface="canvas"]')
    // 没有节点被选中就没有生成框，不用跑。
    if (!el || !stage || selectionKey === '') return undefined
    let applied: string | undefined
    const apply = (value: string | undefined) => {
      if (value === applied) return
      applied = value
      if (value === undefined) el.style.removeProperty('clip-path')
      else el.style.clipPath = value
    }
    const resizeObserver = new ResizeObserver(() => coalescer.schedule())
    const styleObserver = new MutationObserver(() => coalescer.schedule())
    const observedNodes = new Set<Element>()
    const watch = (target: Element | null) => {
      if (!target || observedNodes.has(target)) return
      observedNodes.add(target)
      styleObserver.observe(target, { attributes: true, attributeFilter: ['style'] })
    }
    const measure = () => {
      const roots = [...stage.querySelectorAll<HTMLElement>(COMPOSER_ROOT_SELECTOR)]
      // 生成框挂上来之后，盯住它自己的尺寸和它所在节点的位置（节点被挪 = 生成框跟着挪）。
      for (const root of roots) {
        resizeObserver.observe(root)
        watch(root.closest('.react-flow__node'))
      }
      const composers = roots
        .filter((node) => getComputedStyle(node).visibility !== 'hidden')
        .map((node) => node.getBoundingClientRect())
      const box = el.getBoundingClientRect()
      apply(clipPathForHoles(box.width, box.height, occludedHoles(box, composers)))
    }
    const coalescer = createFrameCoalescer(measure, requestAnimationFrame, cancelAnimationFrame, () => stage.getAttribute('data-dragging') === 'true')
    resizeObserver.observe(el)
    watch(stage.querySelector('.react-flow__viewport'))
    // 生成框挂 / 卸、视口元素本身挂上来：只看 childList，不看属性。
    const mountObserver = new MutationObserver(() => {
      watch(stage.querySelector('.react-flow__viewport'))
      coalescer.schedule()
    })
    mountObserver.observe(stage, { childList: true, subtree: true })
    // 拖动开始 / 结束翻转 data-dragging（生成框拖动中隐身，结束后重新露出）。
    const dragObserver = new MutationObserver(() => coalescer.schedule())
    dragObserver.observe(stage, { attributes: true, attributeFilter: ['data-dragging'] })
    window.addEventListener('resize', coalescer.schedule)
    coalescer.schedule()
    return () => {
      coalescer.dispose()
      resizeObserver.disconnect()
      styleObserver.disconnect()
      mountObserver.disconnect()
      dragObserver.disconnect()
      window.removeEventListener('resize', coalescer.schedule)
      apply(undefined)
    }
  }, [ref, selectionKey])
}
