/**
 * F1 图标四档的唯一尺寸 / 描边真相源。
 *
 * 组件可以把数值传给 Tabler，也可以把对应的 class 交给包裹层；两种出口都
 * 从这里取，调用处不再各自写一套「差不多」的 size / stroke。
 */
export const ICON_TIERS = {
  corner: { size: 13, stroke: 1.8 },
  tool: { size: 16, stroke: 2 },
  bar: { size: 18, stroke: 1.8 },
  empty: { size: 24, stroke: 1.5 },
} as const

export type IconTier = keyof typeof ICON_TIERS

/** Tailwind 需要看到完整的静态 class，不能由数值运行时拼接。 */
export const ICON_TIER_CLASSES: Record<IconTier, string> = {
  corner: '[&>svg]:size-[13px] [&>svg]:stroke-[1.8]',
  tool: '[&>svg]:size-4 [&>svg]:stroke-2',
  bar: '[&>svg]:size-[18px] [&>svg]:stroke-[1.8]',
  empty: '[&>svg]:size-6 [&>svg]:stroke-[1.5]',
}
