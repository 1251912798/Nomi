/**
 * 全局截图（默认关，设置里开）在画布这一侧的接线：
 * 热键抓完整屏 → 主进程落素材 → 这里收到事件、弹选区面板 → 框完落节点（见 ScreenshotCropOverlay）。
 *
 * 三条消息都要接：抓到了 / 没权限 / 抓失败。**「按了没反应」是最糟的形态**，
 * 尤其未授权那条——macOS 的屏幕录制权限没法程序化申请，不说用户根本不知道要去哪开。
 *
 * 顺带把当前项目 id 报给主进程：抓屏要往项目里落素材，主进程不自己猜是哪个项目。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { notify } from '../../../ui/notificationPolicy'
import { getDesktopBridge } from '../../../desktop/bridge'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import { ScreenshotCropOverlay } from './ScreenshotCropOverlay'

export type ScreenshotCapture = { url: string; width: number; height: number }

/**
 * 订阅 + 挂载一起给（同 useNodeMediaPreview 的写法）：调用方只要把 `screenshotOverlay` 塞进 JSX 就行，
 * 不必再各自管一份 state 和条件渲染 —— GenerationCanvas.tsx 常年顶着 800 行上限，能少一行是一行。
 */
export function useCanvasScreenshotCapture(params: {
  readOnly: boolean
  getInsertPosition: () => { x: number; y: number }
  categoryId?: string
}): { screenshotOverlay: JSX.Element | null } {
  const { t } = useTranslation()
  const [screenshotCapture, setScreenshotCapture] = React.useState<ScreenshotCapture | null>(null)

  React.useEffect(() => {
    const bridge = getDesktopBridge()?.screenshot
    if (!bridge) return undefined
    const projectId = getActiveWorkbenchProjectId()
    if (projectId) void bridge.setProjectId?.(projectId).catch(() => undefined)
    const offCaptured = bridge.onCaptured?.((payload) => {
      if (payload?.url) setScreenshotCapture(payload)
    })
    const offDenied = bridge.onDenied?.(() => {
      notify({ identity: 'global-screenshot', reason: 'permission', level: 'background', type: 'error', message: t('generationCommon.screenshot.denied'), actionLabel: t('settings.tab.general'), onAction: () => { window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'general' } })) } })
    })
    const offFailed = bridge.onFailed?.((payload) => {
      notify({
        identity: 'global-screenshot', reason: payload?.reason ?? 'capture', level: 'background', type: 'error',
        message: payload?.reason === 'no-project' ? t('generationCommon.screenshot.noProject') : t('generationCommon.screenshot.failed'),
        actionLabel: t('settings.tab.general'),
        onAction: () => { window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'general' } })) },
      })
    })
    return () => { offCaptured?.(); offDenied?.(); offFailed?.() }
  }, [t])

  const clearScreenshotCapture = React.useCallback(() => setScreenshotCapture(null), [])
  const screenshotOverlay = screenshotCapture && !params.readOnly ? (
    <ScreenshotCropOverlay
      capture={screenshotCapture}
      basePosition={params.getInsertPosition()}
      categoryId={params.categoryId}
      onClose={clearScreenshotCapture}
    />
  ) : null
  return { screenshotOverlay }
}
