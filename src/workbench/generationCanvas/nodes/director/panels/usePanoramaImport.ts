/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../ui/toast、../../../../api/assetUploadApi（importWorkbenchLocalAssetFile / hostedAssetUrl）、
 *          ./panoramaImport（PANORAMA_IMPORT_MAX_BYTES / isStandardPanoramaDimensions）、./imageFile、../DirectorEditorContext
 * [OUTPUT]: 对外提供 usePanoramaImport() → importPanoramaFile(file)
 * [POS]: director/panels 的 720 全景导入流程（清单 §2.3 V5 场景簇；与 V1 环境面板同一套校验与落盘）：图片类型 / 80MB 上限 → 读尺寸（非 2:1 软警告不拒收）
 *        → 先用 object URL 立刻上球预览 → 资产桥落盘换成托管 url → 落盘不可用（无桌面运行时）退回 data URL 并提示「临时」。写入走 patchPanoramaConfig（可撤销）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { hostedAssetUrl, importWorkbenchLocalAssetFile } from '../../../../api/assetUploadApi'
import { toast } from '../../../../../ui/toast'
import { isStandardPanoramaDimensions, PANORAMA_IMPORT_MAX_BYTES, type ImageDimensions } from './panoramaImport'
import { useDirectorStoreApi } from '../DirectorEditorContext'
import { readFileAsDataUrl, readImageDimensions } from './imageFile'

const PREVIEW_URL_TTL_MS = 30_000

export function usePanoramaImport(): { importPanoramaFile: (file: File) => void } {
  const { t } = useTranslation()
  const store = useDirectorStoreApi()
  const runRef = React.useRef(0)

  const importPanoramaFile = React.useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast(t('director.environment.imageOnly'), 'warning')
        return
      }
      if (file.size > PANORAMA_IMPORT_MAX_BYTES) {
        toast(t('director.environment.fileTooLarge'), 'warning')
        return
      }
      const previewUrl = URL.createObjectURL(file)
      const runId = runRef.current + 1
      runRef.current = runId
      const stillCurrent = () => runRef.current === runId
      const apply = (url: string) => {
        const state = store.getState()
        state.saveState()
        state.patchPanoramaConfig({ url })
      }
      void (async () => {
        try {
          let dimensions: ImageDimensions
          try {
            dimensions = await readImageDimensions(previewUrl)
          } catch {
            toast(t('director.environment.dimensionsUnreadable'), 'warning')
            return
          }
          if (!stillCurrent()) return
          // 非 2:1 不拒收（等距柱状贴图对任意比例渲染安全），降级为「可能拉伸」提示照常导入
          const standardRatio = isStandardPanoramaDimensions(dimensions)
          if (!standardRatio) toast(t('director.environment.nonStandardImported', { width: dimensions.width, height: dimensions.height }), 'warning')
          apply(previewUrl)
          try {
            const asset = await importWorkbenchLocalAssetFile(file, file.name || 'panorama')
            const hostedUrl = hostedAssetUrl(asset)
            if (!hostedUrl) throw new Error('panorama asset missing url')
            if (!stillCurrent()) return
            store.getState().patchPanoramaConfig({ url: hostedUrl })
            if (standardRatio) toast(t('director.environment.imported'), 'success')
          } catch {
            // 没有桌面运行时（devlab / 网页）或落盘失败：退回 data URL，工程还能重开，但明说是临时的
            const dataUrl = await readFileAsDataUrl(file)
            if (!stillCurrent()) return
            store.getState().patchPanoramaConfig({ url: dataUrl })
            toast(t('director.environment.importedTemporary'), 'info')
          }
        } catch {
          if (stillCurrent()) toast(t('director.environment.importFailed'), 'error')
        } finally {
          window.setTimeout(() => URL.revokeObjectURL(previewUrl), PREVIEW_URL_TTL_MS)
        }
      })()
    },
    [store, t],
  )

  return { importPanoramaFile }
}
