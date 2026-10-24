import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconChevronRight } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { libraryRows, type LibrarySectionView } from './libraryLayout'
import type { LibraryFaceSize } from './LibraryEntryFace'

/** 一种卡在一种宿主里的排法（量自拍板图）。 */
export type LibraryGridSpec = Readonly<{
  minCardWidth: number
  maxColumns: number
  columnGap: number
  rowGap: number
  sectionGap: number
  /** 给定卡宽时一行卡的估计高度（不含行距）；真实高度由虚拟列表量。 */
  cardHeight: (cardWidth: number) => number
}>

/**
 * 分组的虚拟列表（两个库共用一份；替换原来技能库的原生 details 折叠 + 提示词库自带的那份虚拟网格，E-09 三套收一套）。
 * 收起的组、屏外的卡都不挂载 → 不发媒体请求（设计卡 ★7）。滚动容器归它，宿主只给尺寸。
 */
export function LibrarySectionList<T>({ views, width, columns, spec, size, keyOf, renderItem, onShowAll, showCounts, scrollRef, className, children, footer }: {
  views: readonly LibrarySectionView<T>[]
  width: number
  columns: number
  spec: LibraryGridSpec
  size: LibraryFaceSize
  keyOf: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  /** 组头「全部 N ›」：选中这一组（同左侧分类）。 */
  onShowAll: (sectionId: string) => void
  /** 选了分类 / 在搜：组头直接写这一组的条数。 */
  showCounts: boolean
  scrollRef: (element: HTMLDivElement | null) => void
  className?: string
  /** 列表上方、同一个滚动容器里的东西（例如空态）；列表为空时只画它。 */
  children?: React.ReactNode
  /** 列表下方、同一个滚动容器里的东西（例如「公开库还在读 / 没读到」——我的那段照常列在它上面）。 */
  footer?: React.ReactNode
}): JSX.Element {
  const { t } = useTranslation()
  const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null)
  const rows = React.useMemo(() => libraryRows(views, columns, keyOf), [views, columns, keyOf])
  const cardWidth = columns > 0 && width > 0 ? (width - (columns - 1) * spec.columnGap) / columns : spec.minCardWidth
  const headerHeight = size === 'page' ? 32 : 28
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => rows[index].key,
    estimateSize: (index) => {
      const row = rows[index]
      if (row.kind === 'header') return headerHeight + (row.first ? 0 : spec.sectionGap - spec.rowGap)
      return spec.cardHeight(cardWidth) + spec.rowGap
    },
    overscan: 4,
  })
  // 列数 / 卡宽变了（拖宽抽屉、缩窗口）：估计高度跟着变，重量一次。
  React.useEffect(() => { virtualizer.measure() }, [virtualizer, columns, cardWidth, rows])
  const attach = React.useCallback((element: HTMLDivElement | null) => {
    setScrollElement(element)
    scrollRef(element)
  }, [scrollRef])
  return (
    <div ref={attach} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)} data-library-scroll>
      {children}
      {rows.length ? (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.kind === 'header' ? (
                  <div style={{ paddingTop: row.first ? 0 : spec.sectionGap - spec.rowGap }} data-library-section={row.section.id}>
                    <div className={cn('flex items-baseline gap-2', size === 'page' ? 'h-6 pb-2 box-content' : 'h-[22px] pb-1.5 box-content')}>
                      <h3 className={cn('m-0 truncate font-semibold text-nomi-ink', size === 'page' ? 'text-body-sm' : 'text-caption')}>{row.section.label}</h3>
                      {row.section.truncated ? (
                        <button
                          type="button"
                          onClick={() => onShowAll(row.section.id)}
                          data-library-show-all={row.section.id}
                          className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-caption text-nomi-ink-60 hover:text-nomi-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomi-ink"
                        >
                          {t('libraries.layout.showAll', { count: row.section.total })}
                          <IconChevronRight size={12} stroke={2} aria-hidden="true" />
                        </button>
                      ) : showCounts ? (
                        <span className="text-caption tabular-nums text-nomi-ink-40">{row.section.total}</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: spec.columnGap, paddingBottom: spec.rowGap }}
                  >
                    {row.items.map((item) => <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
      {footer}
    </div>
  )
}
