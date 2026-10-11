// 截帧与剪辑共用一个实验室播放器，切换操作时保留原卡和已创建结果。
import React from 'react'
import type { VnLocale } from './videoNodeNextCopy'
import { VideoEditStage } from './VideoEditStage'
export function FrameCaptureStage({ locale, initial = 'ready', narrow = false }: { locale: VnLocale; initial?: 'ready' | 'done' | 'error'; narrow?: boolean }): React.JSX.Element {
  return <VideoEditStage locale={locale} initial={initial === 'done' ? 'capture-done' : initial === 'error' ? 'capture-error' : 'capture'} narrow={narrow} />
}
