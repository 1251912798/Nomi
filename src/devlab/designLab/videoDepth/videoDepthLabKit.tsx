// 设计实验室 · 屏「画布 · 提取深度」的取景台与夹具。
//
// 这一屏渲染的是**现役组件本身**——浮条外壳与按钮（`NodeFloatingToolbar`）、小面板
// （`VideoDepthActionPanel`）、生成中遮罩（`GeneratingOverlay`）——不是照着它们画的样张。
// 2026-09-06 用户拍板的「UI 交付定义」就是这一条：样张与实现是两套代码描述同一个东西，
// 中间靠人脑翻译，漂移是结构性的。
//
// 唯一的占位是**节点卡本身**：真 `BaseGenerationNode` 要 React Flow 上下文、拖拽/连线/
// 尺寸求解一整套，把它搬进实验室等于把半个画布搬进来。所以这里画一张骨架卡，
// 但它的外壳类名（`generation-canvas-v2-node__preview` + ring/shadow/rounded 那一组）
// 与现役卡**逐字相同**——这一屏要人回答的问题是「这几件东西看着是不是一家的」，
// 卡的边框、圆角、阴影不对，那个问题就白问了。
import React from 'react'

import { GeneratingOverlay } from '../../../workbench/generationCanvas/nodes/render/CardCommon'
import { cn } from '../../../utils/cn'

export const DEPTH_ACTION_CELL_WIDTH = 800
export const DEPTH_ACTION_CELL_HEIGHT = 460

/**
 * 卡的渲染尺寸：340 是视频节点的注册默认宽（registry 的 defaultSize），高按 16:9 取整。
 * 不能随手定小：处理中那一格遮罩里要竖着摞进度环 + 一句人话 + 取消按钮，
 * 卡矮一点就会把取消挤到贴边——而那是「这一格看着挤不挤」这个问题的假答案。
 */
export const DEPTH_CARD = { width: 340, height: 191 } as const

/**
 * 源片的一帧。画成「暖色调、有个人」的样子，好和右边那张灰白深度帧一眼对上。
 * data URI 而不是引真实素材：实验室不许依赖项目资产（那会让截图取决于机器上有什么）。
 */
export const SOURCE_FRAME =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="191" viewBox="0 0 300 169">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3d4f6b"/><stop offset="1" stop-color="#8a6a4e"/></linearGradient></defs>
      <rect width="300" height="169" fill="url(#sky)"/>
      <rect y="120" width="300" height="49" fill="#2a2118"/>
      <ellipse cx="150" cy="70" rx="17" ry="19" fill="#e8c9a0"/>
      <path d="M133 96 q17 -12 34 0 l6 40 h-46 z" fill="#c8562f"/>
      <rect x="126" y="100" width="9" height="34" rx="4" fill="#c8562f"/>
      <rect x="165" y="100" width="9" height="34" rx="4" fill="#c8562f"/>
    </svg>`,
  )

/** 假深度帧：同一个人形，只剩远近。近处偏白（默认档 nearWhite）。 */
export const DEPTH_FRAME =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="191" viewBox="0 0 300 169">
      <defs><linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#101010"/><stop offset="1" stop-color="#3a3a3a"/></linearGradient></defs>
      <rect width="300" height="169" fill="url(#far)"/>
      <rect y="120" width="300" height="49" fill="#565656"/>
      <ellipse cx="150" cy="70" rx="17" ry="19" fill="#f2f2f2"/>
      <path d="M133 96 q17 -12 34 0 l6 40 h-46 z" fill="#dcdcdc"/>
      <rect x="126" y="100" width="9" height="34" rx="4" fill="#cfcfcf"/>
      <rect x="165" y="100" width="9" height="34" rx="4" fill="#cfcfcf"/>
    </svg>`,
  )

/**
 * 一张节点卡（骨架）。`children` 盖在预览区上——遮罩就是这么进去的。
 * 标题条沿用现役卡的位置（左上角，半透明胶囊），因为「产物标题带出身」正是这一屏要看的东西之一。
 */
export function DepthNodeCard({
  title,
  frame,
  selected = false,
  toolbar,
  children,
}: {
  title: string
  frame?: string
  selected?: boolean
  /** 浮条。必须渲染在卡的**定位祖先里**：现役外壳是 `bottom: calc(100% + 16px)`，
      放到卡外面它就贴着别人算位置了（那是另一张图，不是这一张）。 */
  toolbar?: React.ReactNode
  children?: React.ReactNode
}): JSX.Element {
  return (
    <div className="relative" style={{ width: DEPTH_CARD.width, height: DEPTH_CARD.height }}>
      {toolbar}
      <div
        className={cn(
          'generation-canvas-v2-node__preview',
          'relative h-full w-full overflow-hidden rounded-nomi shadow-nomi-md ring-1 ring-inset',
          selected ? 'ring-nomi-accent' : 'ring-nomi-line',
          'bg-nomi-ink-05',
        )}
      >
        {frame ? <img src={frame} alt="" className="h-full w-full object-cover" /> : null}
        {children}
      </div>
      <span className="absolute left-[10px] top-[10px] z-[3] rounded-nomi-sm bg-nomi-paper/[0.82] px-2 py-[3px] text-micro font-medium text-nomi-ink-80 backdrop-blur-[8px]">
        {title}
      </span>
    </div>
  )
}

/** 处理中那一格里遮罩的样子。真组件，参数就是真运行会喂给它的那几样。 */
export function DepthProcessingOverlay({ percent, message }: { percent: number; message: string }): JSX.Element {
  return <GeneratingOverlay percent={percent} message={message} previewUrl={DEPTH_FRAME} onCancel={() => {}} />
}

/**
 * 舞台：一块画布色的底 + 两张卡的位置 + 它们之间那根线。
 *
 * 连线用一条直的 `<svg>`，不是现役 React Flow 的贝塞尔边——这一屏要看的是「产物是从谁来的」
 * 这件事在图上读不读得出来，不是边的曲率。曲率有它自己的回归位置（画布走查）。
 */
export function DepthActionStage({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="relative overflow-hidden rounded-nomi border border-nomi-line bg-[var(--workbench-surface)]"
      style={{ width: DEPTH_ACTION_CELL_WIDTH, height: DEPTH_ACTION_CELL_HEIGHT }}
      data-design-lab-stage="depth-action"
    >
      {children}
    </div>
  )
}

/** 源卡 → 派生卡之间那根线（画在两张卡的缝里）。 */
export function DepthDerivationEdge({ left, top, width }: { left: number; top: number; width: number }): JSX.Element {
  return (
    <svg className="absolute" style={{ left, top, width, height: 2 }} aria-hidden>
      <line x1="0" y1="1" x2={width} y2="1" stroke="var(--nomi-line)" strokeWidth="2" />
    </svg>
  )
}
