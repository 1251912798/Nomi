/**
 * F1 图标四档的唯一尺寸 / 描边真相源。
 *
 * 图标多大由**容器**说了算（用户 2026-10-24 拍板「按钮说了算」）：
 * - `WorkbenchButton` / `WorkbenchIconButton` 收 `iconTier`，按钮把 `ICON_TIER_CLASSES[iconTier]` 挂在自己身上，
 *   里面的图标不传 size / stroke（`check:icon-semantics` 规则四守）；
 * - 其它自带图标槽的容器（空态图标盘、顶栏图标钮）同样挂 `ICON_TIER_CLASSES`；
 * - 只有不在任何容器里的裸图标，才把 `ICON_TIERS` 的数值传给 Tabler。
 */
export const ICON_TIERS = {
  corner: { size: 13, stroke: 1.8 },
  tool: { size: 16, stroke: 2 },
  bar: { size: 18, stroke: 1.8 },
  empty: { size: 24, stroke: 1.5 },
} as const

export type IconTier = keyof typeof ICON_TIERS

/** Tailwind 需要看到完整的静态 class，不能由数值运行时拼接。`tool` 就是工作区按钮一直以来的 16 / 2。 */
export const ICON_TIER_CLASSES: Record<IconTier, string> = {
  corner: '[&>svg]:size-[13px] [&>svg]:stroke-[1.8]',
  tool: '[&>svg]:size-4 [&>svg]:stroke-2',
  bar: '[&>svg]:size-[18px] [&>svg]:stroke-[1.8]',
  empty: '[&>svg]:size-6 [&>svg]:stroke-[1.5]',
}

/**
 * 按钮尾部的下拉箭头槽：恒为角标档（§6 D3「下拉箭头 = 角标 13 / 1.8」），由按钮自己画、自己定尺寸。
 * 选择器 `[&>[data-button-chevron]]` 比 `[&>svg]` 高一级特异度，所以按钮主图标是哪一档都盖不到它，
 * 一个按钮里两档图标不需要任何包裹层。
 */
export const ICON_TIER_CHEVRON_CLASS = '[&>[data-button-chevron]]:size-[13px] [&>[data-button-chevron]]:stroke-[1.8]'
