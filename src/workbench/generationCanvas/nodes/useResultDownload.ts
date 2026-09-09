import React from 'react'
import { useTranslation } from 'react-i18next'
import { getDesktopBridge } from '../../../desktop/bridge'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'

// 下载结果到本地：图片/视频/素材统一一条路径——把 result.url（本地 nomi-local 或远端 http）另存到用户选定位置。
// 从节点 UI 抽出成 hook，供图片浮动工具条按钮与视频浮条按钮共用（单一来源，P1）。
// 文件名由节点标题 derive，扩展名由主进程按 url/类型补全（不在这里钉死最终名）。
export function useResultDownload(node: GenerationCanvasNode, reportFeedback: (message: string) => void, targetResult: GenerationNodeResult | undefined = node.result): {
  canDownload: boolean
  downloading: boolean
  download: () => void
} {
  const { t } = useTranslation()
  const [downloading, setDownloading] = React.useState(false)
  const url = targetResult?.url
  const type = targetResult?.type
  const canDownload = Boolean(url) && type !== 'text'

  const download = React.useCallback(() => {
    reportFeedback('')
    if (!url) return
    const bridge = getDesktopBridge()
    if (!bridge) return
    const defaultName = type === 'video'
      ? t('generationCommon.resultDownload.defaultVideoName')
      : type === 'audio'
        ? t('generationCommon.resultDownload.defaultAudioName')
        : type === 'model3d'
          ? t('generationCommon.resultDownload.defaultModel3dName')
          : t('generationCommon.resultDownload.defaultImageName')
    const base = (node.title || '').trim() || defaultName
    const extension = type === 'video' ? '.mp4' : type === 'audio' ? '.mp3' : type === 'model3d' ? '.glb' : '.png'
    const urlExt = /\.[a-z0-9]{1,5}(?:$|\?)/i.test(url) ? '' : extension
    setDownloading(true)
    void bridge.assets
      .download({ url, suggestedName: base + urlExt })
      .then((res) => {
        if (res.ok) reportFeedback(t('generationCommon.resultDownload.saved'))
        else if (!res.canceled) reportFeedback(t('generationCommon.resultDownload.failed'))
      })
      .catch((error: unknown) =>
        reportFeedback(error instanceof Error ? error.message : t('generationCommon.resultDownload.failed')),
      )
      .finally(() => setDownloading(false))
  }, [url, type, t, node.title, reportFeedback])

  return { canDownload, downloading, download }
}
