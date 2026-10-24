import React, { type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon3dCubeSphere, IconPlayerPlayFilled, IconPlus, IconX } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { NomiImage } from '../../design/media'
import { ICON_TIERS } from '../../design/iconTiers'
import { AssetVideoCover } from './AssetVideoCover'
import type { AssetRef } from './assetTypes'

// hover 放大浮层（#52 群反馈「鼠标放置参考图自动弹出放大图片」）：参考块太小（56px）看不清细节，
// 悬停延迟后在块旁弹一张放大图。延迟 450ms 防「划过」误触；浮层 pointer-events-none 不拦鼠标；
// 贴边时翻到另一侧。图/视频（视频用首帧 thumbUrl）才弹，音频无缩略图跳过。
const HOVER_ZOOM_MAX = 320
const HOVER_ZOOM_DELAY_MS = 450

/** 放大浮层定位：默认贴块右侧；右边放不下就翻到左侧；上边贴顶/下边溢出都夹回视口内。纯函数便于单测。 */
export function computeHoverZoomPosition(
  rect: { left: number; right: number; top: number },
  viewport: { width: number; height: number },
  size = HOVER_ZOOM_MAX,
): { left: number; top: number } {
  const left =
    viewport.width - rect.right > size + 24 ? rect.right + 8 : Math.max(8, rect.left - size - 8)
  const top = Math.max(8, Math.min(rect.top, viewport.height - size - 16))
  return { left, top }
}

/** 悬停的两个阶段（B3n）：刚停上去 = 小提示（名字 + 来源）；停满 450ms = 大图出现、小提示收掉、名字和来源挪到大图下面。 */
function useHoverPreview(zoomSrc: string | undefined): {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
  /** null = 没悬停；false = 小提示；true = 大图。 */
  zoomed: boolean | null
  rect: DOMRect | null
} {
  const [state, setState] = React.useState<{ zoomed: boolean; rect: DOMRect } | null>(null)
  const timerRef = React.useRef<number | undefined>(undefined)
  const clear = React.useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])
  React.useEffect(() => clear, [clear])
  const onMouseEnter = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    clear()
    setState({ zoomed: false, rect: box })
    if (zoomSrc) timerRef.current = window.setTimeout(() => setState({ zoomed: true, rect: box }), HOVER_ZOOM_DELAY_MS)
  }, [zoomSrc, clear])
  const onMouseLeave = React.useCallback(() => {
    clear()
    setState(null)
  }, [clear])
  return { onMouseEnter, onMouseLeave, zoomed: state?.zoomed ?? null, rect: state?.rect ?? null }
}

function HoverLayer({ zoomed, rect, zoomSrc, name, source, tip }: {
  zoomed: boolean | null; rect: DOMRect | null; zoomSrc: string | undefined; name: string; source?: string | undefined; tip?: string | undefined
}): JSX.Element | null {
  if (zoomed === null || !rect) return null
  if (!zoomed) {
    // 小提示在缩略图上方，深底白字（和 Tooltip 同一档），不拦鼠标。
    return createPortal(
      <div
        role="tooltip"
        data-asset-tile-tip="true"
        className="pointer-events-none whitespace-nowrap rounded-nomi-sm bg-nomi-ink px-2.5 py-1.5 text-caption leading-snug text-nomi-paper"
        style={{ position: 'fixed', zIndex: 10000, left: Math.max(8, rect.left - 4), top: Math.max(8, rect.top - 36) }}
      >
        {tip ?? (source ? `${name} · ${source}` : name)}
      </div>,
      document.body,
    )
  }
  if (!zoomSrc) return null
  return createPortal(
    <div
      data-asset-tile-zoom="true"
      className="pointer-events-none flex flex-col gap-1.5 rounded-nomi border border-nomi-line bg-nomi-paper p-1.5 shadow-nomi-lg"
      style={{
        position: 'fixed',
        zIndex: 10000,
        ...computeHoverZoomPosition(rect, { width: window.innerWidth, height: window.innerHeight }),
        maxWidth: HOVER_ZOOM_MAX + 12,
      }}
    >
      <img src={zoomSrc} alt="" className="block rounded-nomi-sm object-contain" style={{ maxWidth: HOVER_ZOOM_MAX, maxHeight: HOVER_ZOOM_MAX }} />
      <span className="flex flex-col gap-0.5 px-0.5 text-caption leading-tight">
        <span className="truncate font-medium text-nomi-ink">{name}</span>
        {source ? <span className="truncate text-micro text-nomi-ink-60">{source}</span> : null}
      </span>
    </div>,
    document.body,
  )
}

// 通用素材块（B3）。形态自明 > 文字解释，平时只有小图，没有序号、没有 ×：
//   图  → 缩略图铺满
//   视频 → 缩略图(或暗块)+ 暗蒙层 + 居中播放三角
//   音频 → 整块波形(音频无缩略图,波形本身就是它的形态语言)
// 40px 正方形（统一规则 4：参考图小图 32–40px）。悬停才出 ×（角上）和名字 + 来源的小提示，停满约 0.45 秒出大图（B3n）。
// 提示词里引用靠「小图 + 名字」，不再靠序号，所以这里没有编号徽标。token + Tabler,无 emoji。

type AssetTileProps = {
  asset: AssetRef
  /** 角上的小字签（如「首帧」），放在左下角;不传 = 不显示。 */
  tag?: string
  /** 来源（画布节点 / 素材库 / 上传）：悬停小提示与大图下方的第二行。 */
  sourceLabel?: string
  /** 完整的小提示文案（覆盖默认「名字 · 来源」；连线来的图写「…· 点 × 断开连线」）。 */
  tipText?: string
  /** × 的名字（连线来的图叫「断开连线」）。缺省 = 「移除 {名字}」。 */
  removeLabel?: string
  /** 传了才有删除「×」。 */
  onRemove?: () => void
  /** 传了则可点(hover 高亮)。 */
  onClick?: () => void
  /** 拖拽重排用:spread 到根 div(draggable + onDragStart/onDragOver/onDrop)。 */
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
  /** 淡显：这张图此刻用不上（模型不收 / 当前方式没用到），仍留在这里，切回去还在。 */
  dimmed?: boolean
  className?: string
}

// 音频波形:固定高度图案(我们不分析音频,波形是纯形态符号)。
const WAVE_HEIGHTS = [8, 16, 22, 12, 18, 9]

function TagBadge({ tag }: { tag: string }): JSX.Element {
  return (
    <span
      data-asset-tile-tag="firstFrame"
      className="absolute bottom-[3px] left-[3px] z-[2] flex h-4 items-center justify-center rounded-nomi-sm bg-[oklch(0.18_0.01_80/0.64)] px-1 text-micro leading-none text-white"
    >
      {tag}
    </span>
  )
}

/** ×：悬停（或键盘聚焦）才出现，挂在缩略图右上角外侧；点击区 28px，圆点 16px。 */
function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      data-asset-tile-remove="true"
      className={cn(
        'absolute -right-[10px] -top-[10px] z-[3] flex size-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0',
        'opacity-0 transition-opacity duration-nomi-fast group-hover/tile:opacity-100 focus-visible:opacity-100 group-focus-within/tile:opacity-100',
      )}
      onClick={(event) => { event.stopPropagation(); onRemove() }}
    >
      <i className="flex size-4 items-center justify-center rounded-full bg-nomi-ink text-nomi-paper" aria-hidden>
        <IconX size={12} stroke={2.67} />
      </i>
    </button>
  )
}

// 形态自明的内层渲染,被 56px 参考块和 48px picker 项共用(单一真相源,避免两份渲染逻辑)。
export function AssetThumb({ asset, playSize = 22 }: { asset: AssetRef; playSize?: number }): JSX.Element {
  const { t } = useTranslation()
  if (asset.kind === 'audio') {
    return (
      <span className={cn('flex items-center gap-[2px] h-[22px]')} aria-hidden>
        {WAVE_HEIGHTS.map((h, i) => (
          <i key={i} className={cn('w-[2px] rounded-nomi-sm bg-nomi-ink-40')} style={{ height: `${h}px` }} />
        ))}
      </span>
    )
  }
  if (asset.kind === 'video') {
    return (
      <>
        <AssetVideoCover asset={asset} />
        <span className={cn('absolute inset-0 bg-[oklch(0.2_0.01_80/0.28)]')} aria-hidden />
        <span className={cn('absolute inset-0 flex items-center justify-center z-[1]')} aria-hidden>
          {/* 不加 drop-shadow：底下已有暗色遮罩托住对比度；CSS 滤镜在 Windows（ANGLE/D3D11）上每次启动首次绘制都要现编译着色器，
              实测 @ 列表首次打开那一帧因此多约 70 ms（2026-09-25，trace 见 docs/research/2026-09-25-canvas-follow-hand）。 */}
          <IconPlayerPlayFilled size={playSize} className={cn('text-nomi-paper')} />
        </span>
      </>
    )
  }
  if (asset.kind === 'model3d') {
    return <Icon3dCubeSphere size={playSize + 4} stroke={1.5} className="text-nomi-ink-40" aria-hidden="true" />
  }
  return (
    <NomiImage
      className={cn('w-full h-full object-cover')}
      thumbnailSrc={asset.thumbUrl}
      src={asset.renderUrl}
      alt={asset.name}
      // 参考语境的失效占位说「怎么办」：泛化的「加载失败」会被当成无害缩略图问题忽略，
      // 而这张图随后就是发不出去（预览与发送同一份 URL 口径）。
      fallbackLabel={t('assetLibrary.expiredReference')}
      fallbackTitle={t('assetLibrary.expiredReferenceDetail', { url: asset.renderUrl })}
    />
  )
}

export default function AssetTile({ asset, tag, sourceLabel, tipText, removeLabel, onRemove, onClick, dragProps, dimmed, className }: AssetTileProps): JSX.Element {
  const { t } = useTranslation()
  const clickable = Boolean(onClick)
  // 图用原图、视频用首帧缩略图放大；音频无缩略图不弹（只有小提示）。
  const zoomSrc = asset.kind === 'audio' || asset.kind === 'model3d' ? undefined : asset.kind === 'video' ? asset.thumbUrl : asset.renderUrl
  const hover = useHoverPreview(zoomSrc)
  return (
    <>
      <div
        className={cn(
          'group/tile relative h-10 w-10 shrink-0',
          clickable && 'cursor-pointer',
          dimmed && 'opacity-40',
          dragProps?.draggable && 'data-[dragover=true]:outline data-[dragover=true]:outline-2 data-[dragover=true]:outline-nomi-ink-40',
          className,
        )}
        // 稳定走查锚点（同 AssetAddTile 的理由）：按 kind 数 tile 才能验「视频进视频桶、没污染图片桶」。
        data-asset-tile={asset.kind}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? asset.name : undefined}
        onClick={onClick}
        onKeyDown={clickable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick?.() } } : undefined}
        {...dragProps}
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
      >
        <span className={cn('relative flex size-full items-center justify-center overflow-hidden rounded-nomi-sm bg-nomi-ink-05', clickable && 'group-hover/tile:ring-2 group-hover/tile:ring-nomi-ink-30 group-hover/tile:ring-offset-1')}>
          <AssetThumb asset={asset} />
          {tag ? <TagBadge tag={tag} /> : null}
        </span>
        {onRemove ? <RemoveButton label={removeLabel ?? t('assetLibrary.removeNamed', { name: asset.name })} onRemove={onRemove} /> : null}
      </div>
      <HoverLayer zoomed={hover.zoomed} rect={hover.rect} zoomSrc={zoomSrc} name={asset.name} source={sourceLabel} tip={tipText} />
    </>
  )
}

/** 40×40 浅底方块：画布点选与「+」都是它，只换图标和动作（参考入口，图标条档 18 / 1.8，见 §6；无虚线）。 */
export function AssetActionTile({ selected, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }): JSX.Element {
  return <button type="button" {...props} className={cn(
    'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-nomi-sm border-0 bg-nomi-ink-05 p-0 text-nomi-ink-80 hover:bg-nomi-ink-10 disabled:cursor-not-allowed disabled:opacity-50',
    selected && 'bg-nomi-ink-10',
    className,
  )}>{children}</button>
}

// 空态/添加块:浅底「+」，点开统一选择器。
export function AssetAddTile({ onClick, selected, label, className }: { onClick: () => void; selected?: boolean; label?: string; className?: string }): JSX.Element {
  const { t } = useTranslation()
  return <AssetActionTile data-asset-add-tile="true" aria-label={label ?? t('assetLibrary.addReference')}
    onClick={onClick} selected={selected} className={className}>
    <IconPlus size={ICON_TIERS.bar.size} stroke={ICON_TIERS.bar.stroke} />
  </AssetActionTile>
}
