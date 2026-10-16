import React from 'react'
import { useElementWidth } from './useElementWidth'

/**
 * 行的宽 / 窄两档（第二轮版面）。判据只有行的实测宽度（= 行容器的内宽，由容器量一次，见 `useStoryboardRowsDensity`）：
 * 宽 900（1440 视口 + Agent 面板）是宽档；最小窗口 1100×690 + Agent 面板时表格只有 664 宽，是窄档。
 * 窄档里视觉列整只缩到 176/240、参考缩略图从 36 缩到 28 并折成「+N」——省下的宽度给内容列，
 * 保证底栏「模型 · 参数汇总 · 生成」一行放得下（英文也放得下）。
 *
 * 740 = 两侧内边距 24 + 行首 14 + 两个列间距 24 + 横版预览 240 + 底栏一行的最小宽 ≈ 440（英文实测）。
 */
export const STORYBOARD_ROW_NARROW_BELOW = 740

export function storyboardRowIsNarrow(rowWidth: number | null): boolean {
  return rowWidth !== null && rowWidth < STORYBOARD_ROW_NARROW_BELOW
}

export const StoryboardRowNarrowContext = React.createContext(false)

/**
 * 档位的**唯一测量点**：在行的容器上量一次（分镜表行区、参考卡行区、设计实验室的取景框），
 * 容器用 `StoryboardRowNarrowContext.Provider` 把结果递给里面的每一行。
 *
 * 为什么不让每行量自己：同一个容器里每一行都一样宽（行是容器的块级子元素，宽 = 容器内宽），
 * 量 N 次得到 N 个相同的数——而每次都是一条布局读取（clientWidth）加一个 ResizeObserver。
 * 2026-10-16 的 320 镜打开剖析里，逐行这一读自身占了可归因样本的 17.7%（C-trace storyboard-plan-open）。
 * 行于是只读 context（`useStoryboardRowNarrow`），不再碰 `useElementWidth`。
 */
export function useStoryboardRowsDensity(containerRef: React.RefObject<HTMLElement | null>): boolean {
  return storyboardRowIsNarrow(useElementWidth(containerRef))
}

export function useStoryboardRowNarrow(): boolean {
  return React.useContext(StoryboardRowNarrowContext)
}

/**
 * 一个「行容器」：一只 div，量自己一次、把档位递给里面的每一行。参考卡行区与设计实验室的取景框用它；
 * 分镜表的行区自己还要别的 ref（定位、窗口化），直接调 `useStoryboardRowsDensity` + Provider，同一个判据。
 */
export function StoryboardRowsBox({ children, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const narrow = useStoryboardRowsDensity(ref)
  return React.createElement('div', { ...rest, ref },
    React.createElement(StoryboardRowNarrowContext.Provider, { value: narrow }, children))
}
