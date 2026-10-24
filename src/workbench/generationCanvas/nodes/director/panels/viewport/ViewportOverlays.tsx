/**
 * [INPUT]: 依赖 react、react-i18next、../../scene/LabelProjector 的 ProjectedLabel、../../scene/character/characterLabel 的名牌排版、
 *          ../../scene/creation 三个 hook 的 API 类型、../topbar/topChrome 的 DIRECTOR_TOP_CHROME_PX
 * [OUTPUT]: 对外提供 ViewportLabels（角色名标签层）、PlacementHud（放置 / 画框模式提示条）、PathDrawHud（画线 / 逐点模式提示条）
 * [POS]: director/panels/viewport 的叠加层（清单 §2.4 V6）：纯 DOM，绝对定位在视口之上，pointer-events 关闭不挡视口。
 *        三条提示条共用一个位置（HudBar）：顶部让开悬浮顶栏（DIRECTOR_TOP_CHROME_PX，和属性卡 / POV 卡同一条线），
 *        横向在属性卡左边剩下的那块里居中（属性卡出现时写 --nomi-director-side-width；画线 / 逐点的钮住在卡头，画线时卡一定开着），
 *        窄了就折行，不钻到卡底下。以前各写 top-3，正好压在顶栏正中的「导演 | 精修」底下（2026-10-24 走查 ⑥）；
 *        视口里写死顶部位置 = PipViewport.test.ts 的结构门岗红。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectedLabel } from '../../scene/LabelProjector'
import { estimateLabelWidth, layoutCharacterLabels, VIEWPORT_LABEL_METRICS as LABEL } from '../../scene/character/characterLabel'
import type { BoxDrawApi } from '../../scene/creation/useBoxDraw'
import type { CharacterPlacementApi } from '../../scene/creation/useCharacterPlacement'
import type { PathDrawApi } from '../../scene/creation/usePathDraw'
import { DIRECTOR_TOP_CHROME_PX } from '../topbar/topChrome'

const EDGE = 12

export function ViewportLabels({ labels }: { labels: ProjectedLabel[] }): JSX.Element {
  // 与截图 / 录像烧进画面的名牌同一个排版函数：投影后重合的名牌往上错开，谁也不盖住谁
  const placed = React.useMemo(() => layoutCharacterLabels(labels.map((label) => ({
    ...label, y: label.y - LABEL.lift, width: estimateLabelWidth(label.name, LABEL.fontPx, LABEL.paddingX), height: LABEL.height,
  })), 2), [labels])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {placed.map((label) => (
        <div
          key={label.id}
          className="absolute -translate-x-1/2 select-none rounded-nomi-sm border border-nomi-line bg-nomi-paper/90 px-1.5 py-0.5 text-micro font-semibold leading-4 text-nomi-ink shadow-nomi-sm backdrop-blur"
          style={{ left: label.x, top: label.top }}
        >
          {label.name}
        </div>
      ))}
    </div>
  )
}

/** 三条模式提示条共用的位置与外形：顶栏之下、属性卡左边那块里居中，窄了折行。 */
function HudBar({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute flex justify-center"
      style={{ top: DIRECTOR_TOP_CHROME_PX, left: EDGE, right: `calc(var(--nomi-director-side-width, 0px) + ${EDGE}px)` }}
    >
      <div
        className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-nomi-line bg-nomi-paper/95 px-3 py-1 text-caption text-nomi-ink shadow-nomi-sm"
        data-testid="director-viewport-hud"
      >
        {children}
      </div>
    </div>
  )
}

export function PlacementHud({ placement, boxDraw }: { placement: CharacterPlacementApi; boxDraw: BoxDrawApi }): JSX.Element | null {
  const { t } = useTranslation()
  if (placement.active) {
    return (
      <HudBar>
        <span className="text-nomi-ink-40">{t('director.hud.placementLabel')}</span>
        <span className="font-semibold">{placement.crowd ? t('director.creation.crowd') : placement.gender === 'female' ? t('director.creation.female') : t('director.creation.male')}</span>
        <span className="text-nomi-ink-40">{t('director.hud.placementHint', { heading: placement.headingDeg.toFixed(0) })}</span>
      </HudBar>
    )
  }
  if (boxDraw.active) {
    const { width, depth, height } = boxDraw.dimensions
    return (
      <HudBar>
        <span className="text-nomi-ink-40">{t('director.hud.boxSize')}</span>
        <span className="font-nomi-mono font-semibold">
          {t('director.hud.boxDims', { width: width.toFixed(2), depth: depth.toFixed(2) })}
          {boxDraw.step === 'extruding_height' ? t('director.hud.boxHeight', { height: height.toFixed(2) }) : ''}
        </span>
        <span className="text-nomi-ink-40">
          {boxDraw.step === 'extruding_height' ? t('director.hud.boxConfirmHint') : boxDraw.step === 'dragging_base' ? t('director.hud.boxExtrudeHint') : t('director.hud.boxStartHint')}
        </span>
      </HudBar>
    )
  }
  return null
}

// 画路径模式提示条（T3/T4）：模式名 + 手势说明 + 已画点数
export function PathDrawHud({ pathDraw }: { pathDraw: PathDrawApi }): JSX.Element | null {
  const { t } = useTranslation()
  if (!pathDraw.active) return null
  const pencil = pathDraw.mode === 'pencil'
  return (
    <HudBar>
      <span className="font-semibold">{pencil ? t('director.topbar.drawPencil') : t('director.topbar.waypoint')}</span>
      <span className="text-nomi-ink-40">{pencil ? t('director.trajectory.pencilHint') : t('director.trajectory.waypointHint')}</span>
      {pathDraw.pointCount > 0 ? <span className="font-nomi-mono">{t('director.trajectory.pointCount', { count: pathDraw.pointCount })}</span> : null}
    </HudBar>
  )
}
