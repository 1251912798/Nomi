import React, { type JSX } from 'react'
import { IconPackage } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { useRemoteExampleMedia } from '../../media/remoteExampleMedia'

/**
 * 库条目的媒体件（技能封面、提示词封面、Agent「/」行与芯片上的小图都走它，一份）。
 *
 * - 示意插画（`illustration`，数据里 `curation.preview.provenance === 'illustration'`）在暗色下换成「暗纸底 + 浅线」：
 *   反相 0.9 再把色相转回 180°（两者对灰轴可交换，蓝色点缀仍是蓝），用户 10-24 拍板 Q8；照片 / 视频一律不动。
 * - 视频不播放时只取首帧：首帧没出来之前（或永远出不来）显示视频占位，不再是一张白卡（LibraryStates 板）。
 * - 第三方示例地址失效：同一份会话记账（remoteExampleMedia.ts），占位 + 可选「已失效」。
 */
export function SkillMedia({ cover, preview, play = false, controls = false, className, iconSize = 28, fallback, illustration = false, expiredLabel, preferCover = false }: {
  fallback?: React.ReactNode
  cover?: string
  preview?: { url: string; type: 'image' | 'video' }
  play?: boolean
  controls?: boolean
  className?: string
  /**
   * 没图时那个图标画多大。默认 28 是画廊卡的尺寸；**16px 的 chip 必须自己传**，
   * 否则图标比框还大，溢出去糊在 chip 的字上（chip 上没图时用户看到的是「一坨」）。
   */
  iconSize?: number
  /** 示意插画：暗色下换暗纸底 + 浅线。 */
  illustration?: boolean
  /** 地址失效时占位下面写的一句（如「已失效」）；不给就只放图标。 */
  expiredLabel?: string
  /** 有静态封面就用封面（小卡不必为一张缩略图去拉视频）。 */
  preferCover?: boolean
}): JSX.Element {
  const url = preferCover && cover ? cover : preview?.url || cover
  const isVideo = Boolean(url) && url === preview?.url && preview?.type === 'video'
  // 公开示例的媒体地址归第三方站点：失效与提示词卡片同一份会话记账（同一地址不反复请求）。
  const { broken, onError } = useRemoteExampleMedia(url)
  const [frameReady, setFrameReady] = React.useState(false)
  React.useEffect(() => setFrameReady(false), [url])
  const illustrationClass = illustration ? 'dark:invert-[.9] dark:hue-rotate-180' : undefined
  const placeholder = (expired: boolean) => (
    <span className={cn('grid place-content-center justify-items-center gap-1 bg-nomi-ink-05 text-nomi-ink-30', className)} data-skill-media="placeholder">
      {fallback ?? <IconPackage size={iconSize} stroke={1.5} />}
      {expired && expiredLabel ? <span className="text-micro text-nomi-ink-40" data-example-media-expired>{expiredLabel}</span> : null}
    </span>
  )
  if (!url || broken) return placeholder(broken)
  if (isVideo && !play) {
    // 只要首帧：首帧到之前（没有静态封面可当 poster 时）叠一层视频占位（同一个盒子，不跳尺寸）。
    const pending = !frameReady && !cover
    return (
      <span className={cn('relative block overflow-hidden bg-nomi-ink-05', className)} data-skill-media="video">
        <video src={url} poster={cover} muted playsInline preload="metadata" onError={onError} onLoadedData={() => setFrameReady(true)}
          className={cn('absolute inset-0 size-full object-cover', illustrationClass, pending && 'invisible')} />
        {pending ? <span className="absolute inset-0 grid place-items-center text-nomi-ink-30" data-skill-media-pending>{fallback ?? <IconPackage size={iconSize} stroke={1.5} />}</span> : null}
      </span>
    )
  }
  if (isVideo) return <video src={url} poster={cover} muted loop autoPlay controls={controls} playsInline preload="metadata" onError={onError} className={cn(className, illustrationClass)} data-skill-media="video" />
  return <img src={url} alt="" loading="lazy" decoding="async" onError={onError} className={cn('block', className, illustrationClass)} data-skill-media="image" />
}
