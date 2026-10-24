import React from 'react'
import { IconX } from '@tabler/icons-react'

/**
 * 参考行行尾的一句 12px 小字（统一规则 5：不写解释句、不放彩色提示条；有后果且一眼可见的说明才写）。
 * 优先级：模型不收参考图 > 渠道指路 > 首尾帧里用不到的图 > 「要不要当首尾帧」歧义提问。
 */
export default function referenceRowTail(t: (key: string, values?: Record<string, unknown>) => string, { refsUnsupported, unusedCount, framesOnly, arrayCount, guidanceNote, onSwitchToFirstLast, onDismissAmbiguity }: {
  refsUnsupported: boolean
  unusedCount: number
  framesOnly: boolean
  arrayCount: number
  guidanceNote: React.ReactNode
  /** 有值 = 当前正处在「只放了 1–2 张参考图、模型也有首尾帧」的歧义里。 */
  onSwitchToFirstLast?: (() => void) | undefined
  onDismissAmbiguity: () => void
}): React.JSX.Element | undefined {
  const count = (n: number) => t('assetLibrary.refRow.count', { count: n })
  const countNode = arrayCount > 0 ? <span>{count(arrayCount)}</span> : null
  if (refsUnsupported) return unusedCount > 0 ? <span>{count(unusedCount)} · {t('assetLibrary.refRow.unsupportedNote')}</span> : undefined
  if (guidanceNote) return <>{countNode}{guidanceNote}</>
  if (unusedCount > 0 && framesOnly) return <span>{t('assetLibrary.refRow.unusedNote')}</span>
  if (!onSwitchToFirstLast) return undefined
  return (
    <>
      {countNode}
      <span aria-hidden>·</span>
      <span>{t('assetLibrary.refRow.ambiguityHint')}</span>
      <button type="button" data-reference-hint-action="first-last" className="cursor-pointer border-0 bg-transparent p-0 text-caption text-nomi-ink underline underline-offset-2"
        onClick={onSwitchToFirstLast}>{t('assetLibrary.refRow.ambiguityAction')}</button>
      <button type="button" aria-label={t('assetLibrary.refRow.ambiguityDismiss')} title={t('assetLibrary.refRow.ambiguityDismiss')}
        className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-nomi-ink-40 hover:text-nomi-ink-60"
        onClick={onDismissAmbiguity}><IconX size={12} stroke={1.8} aria-hidden /></button>
    </>
  )
}
