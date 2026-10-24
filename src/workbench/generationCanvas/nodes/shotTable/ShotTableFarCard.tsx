import { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShotTableRowView } from './selectShotTableRows'

/** 关键帧条最多放几张（拍板稿图 4 远档：一行小图，够认出是哪条片子就行）。 */
const STRIP_FRAMES = 6
/**
 * 远档时画布已缩到 < 45%（最小 CANVAS_MIN_ZOOM = 20%）。内容按档位中段 30% 放大一次：
 * 档内屏幕字号约 9–20px（14px 标题在 45% 处 21px、30% 处 14px、20% 处 9px），不订阅每帧缩放——穿过档位才重渲。
 * 放大后宽 = FAR_CARD_WIDTH / 0.3 ≈ 870，落在 920 宽的节点里。
 */
const FAR_CARD_ZOOM = 0.3
const FAR_CARD_WIDTH = 260

/** 拆解表远档卡片（拍板稿图 4）：标题 · 镜数 · 时长 · 没读出几镜 · 关键帧条。 */
export function ShotTableFarCard({ title, rows, totalSeconds }: { title: string; rows: ShotTableRowView[]; totalSeconds?: number }): JSX.Element {
  const { t } = useTranslation()
  const unread = rows.filter(row => row.visionFailed).length
  const meta = [
    t('shotTable.count', { count: rows.length }),
    totalSeconds !== undefined ? t('shotTable.duration', { duration: totalSeconds }) : null,
    unread ? t('shotTable.node.farUnread', { count: unread }) : null,
  ].filter(Boolean).join(' · ')
  return <div data-testid="shot-table-far-card" className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
    <div className="flex flex-col gap-2.5" style={{ width: FAR_CARD_WIDTH, transform: `scale(${1 / FAR_CARD_ZOOM})` }}>
      <span className="truncate text-body font-medium">{title}</span>
      <span className={unread ? 'text-caption text-nomi-danger' : 'text-caption text-nomi-ink-60'}>{meta}</span>
      {rows.length > 0 && <div className="flex gap-1">{rows.slice(0, STRIP_FRAMES).map(row => row.thumbnail
        ? <img key={row.id} src={row.thumbnail} alt="" className="h-5 w-9 rounded-nomi-sm object-cover" />
        : <div key={row.id} className="h-5 w-9 rounded-nomi-sm bg-nomi-ink-05" />)}</div>}
    </div>
  </div>
}
