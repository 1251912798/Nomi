import React, { type JSX } from 'react'

import { useTranslation } from 'react-i18next'
import { cn } from '../../utils/cn'
import { AssetThumb } from './AssetTile'
import { ReferenceNamesContext } from './referenceNames'
import type { AssetKind, AssetRef } from './assetTypes'

// @ 内联媒体引用 chip 的 nodeview 组件:句中「16px 小图 + 名字」（B3：不写图1、图2）。
// 名字由宿主经 ReferenceNamesContext 给（画布生成框 / 分镜行）；没有登记的地方（Agent 消息、旧引用）仍回落到「图片N」。
// 单独成文件,让 AssetMentionNode 只导出 Tiptap Node(非组件)——避免 react-refresh/only-export-components 警告。
export default function AssetInlineReference({ url, index: suppliedIndex, kind: suppliedKind = 'image' }: { url: string; index?: number; kind?: 'image' | 'video' | 'audio' }): JSX.Element {
  const { t } = useTranslation()
  const index = Number(suppliedIndex)
  const kind: AssetKind = suppliedKind
  const indexedKey = kind === 'video'
    ? 'assetLibrary.referenceVideoIndexed'
    : kind === 'audio'
      ? 'assetLibrary.referenceAudioIndexed'
      : 'assetLibrary.referenceImageIndexed'
  const fallbackKey = kind === 'video'
    ? 'assetLibrary.referenceVideo'
    : kind === 'audio'
      ? 'assetLibrary.referenceAudio'
      : 'assetLibrary.referenceImage'
  const names = React.useContext(ReferenceNamesContext)
  const label = names?.[url] || (Number.isInteger(index) && index > 0 ? t(indexedKey, { index }) : t(fallbackKey))
  const asset: AssetRef = {
    id: url,
    kind,
    name: label,
    renderUrl: url,
    source: 'project',
    origin: { source: 'project', projectId: '', relativePath: '' },
  }
  const [hoverPreview, setHoverPreview] = React.useState(false)
  const timerRef = React.useRef<number | null>(null)
  const onEnter = (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setHoverPreview(true), 280)
  }
  const onLeave = (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setHoverPreview(false)
  }
  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])
  return (
    <span
      data-storyboard-mention-chip="true"
      aria-label={label}
      className={cn('relative inline-flex align-[-4px] h-[22px] items-center gap-[4px] mx-[2px] pl-[3px] pr-[8px] rounded-pill bg-nomi-accent-soft cursor-pointer')}
      contentEditable={false}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onDoubleClick={() => window.dispatchEvent(new CustomEvent('nomi:asset-mention-preview', { detail: { url, kind, label } }))}
    >
      <span className={cn('relative w-4 h-4 overflow-hidden rounded-nomi-sm bg-nomi-ink-05 shrink-0 flex items-center justify-center')} aria-hidden>
        <AssetThumb asset={asset} playSize={8} />
      </span>
      <span className={cn('text-caption font-medium leading-none text-nomi-ink whitespace-nowrap')}>{label}</span>
      {hoverPreview ? (
        <span className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 w-40 overflow-hidden rounded-nomi-sm border border-nomi-line bg-nomi-paper p-1 shadow-nomi-md" data-storyboard-mention-preview="true">
          <AssetThumb asset={asset} playSize={12} />
        </span>
      ) : null}
    </span>
  )
}
