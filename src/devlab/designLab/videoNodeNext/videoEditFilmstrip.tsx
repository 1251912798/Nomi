import React from 'react'
import { NomiImage } from '../../../design/media'
import { VideoTrimFilmstrip } from '../../../workbench/generationCanvas/nodes/VideoTrimFilmstrip'
import type { VnLocale } from './videoNodeNextCopy'

export function EditFilmstrip({ thumbs, locale, ...props }: Omit<React.ComponentProps<typeof VideoTrimFilmstrip>, 'children' | 'labels'> & { thumbs: string[]; locale: VnLocale }): React.JSX.Element {
  return <VideoTrimFilmstrip {...props} labels={locale === 'zh-CN' ? { seek: '定位画面', start: '入点', end: '出点' } : { seek: 'Seek in filmstrip', start: 'In point', end: 'Out point' }}>
    {thumbs.map((url) => <NomiImage key={url} src={url} alt="" className="h-full min-w-0 flex-1 object-cover" />)}
  </VideoTrimFilmstrip>
}
