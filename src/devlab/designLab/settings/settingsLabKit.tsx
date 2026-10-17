// 设计实验室 · 屏「设置 · 隐私与诊断」的取景台。
//
// 这一格和前两屏的差别：它渲染的组件**只在有 desktop bridge 时才出现**
// （`TelemetrySection` / `DiagnosticsBundleSection` 拿不到 bridge 就返回空片段——
// 那是给浏览器构建准备的正确降级）。所以取景台的活儿就是：在组件渲染之前，
// 往 `window.nomiDesktop` 上装一个**确定性的假桥**。
//
// 假桥全部同步结算（Promise.resolve / 永不结算），不碰网络、不碰定时器：
// 视觉基线只能建在「同一份代码永远画出同一张图」上，任何墙钟或网络都会让它随机翻红。
//
// 灌桥用 `useMemo` 而不是 `useEffect`：晚一帧灌，组件第一次渲染时 bridge 还是 null，
// 会先画一帧空片段——截图捕到那一帧就成了「这一格什么都没有」的假证据
// （同 agentPanelKit.ShellStage / editingLabKit.useLabTimeline 的理由）。
import React, { type JSX } from 'react'
import type { DiagnosticsExportResult } from '../../../../electron/shared/contracts/diagnostics'

/** 取景宽 = 设置弹窗内容区的实际可用宽（760 外框 − 196 侧栏 − 24×2 内边距）。 */
export const SETTINGS_CELL_WIDTH = 516
export const SETTINGS_CELL_HEIGHT = 600

/** 导出行为：结算成什么、还是一直转圈（「正在打包」那一格）。 */
export type LabExportBehavior = DiagnosticsExportResult | 'never-settles'

function installLabBridge(behavior: LabExportBehavior, legacyConsent: boolean): void {
  const exportBundle = (): Promise<DiagnosticsExportResult> =>
    behavior === 'never-settles' ? new Promise<DiagnosticsExportResult>(() => {}) : Promise.resolve(behavior)
  ;(window as unknown as { nomiDesktop?: unknown }).nomiDesktop = {
    settings: {
      telemetry: {
        get: () =>
          Promise.resolve({
            schemaVersion: 1,
            enabled: legacyConsent,
            endpointMode: 'nomi',
            consentedAt: legacyConsent ? '2026-09-20T00:00:00.000Z' : null,
            installSessionId: null,
            scopeVersion: legacyConsent ? 1 : 2,
            endpointConfigured: legacyConsent,
            status: legacyConsent ? 'configured' : 'disabled',
          }),
        set: () => new Promise(() => {}),
        summary: () =>
          Promise.resolve({ pending: [], sent: [], pendingCount: 0, sentCount: 0, failedCount: 0, endpointConfigured: false }),
        deleteAll: () => Promise.resolve({ deletedCount: 0 }),
      },
      diagnostics: { exportBundle },
    },
  }
}

/**
 * 设置内容区的取景框：白纸 + 与真实弹窗一致的内边距。
 * `behavior` 决定这一格里「导出诊断包」按下去会得到什么。
 */
export function SettingsStage({
  behavior,
  autoExport = false,
  legacyConsent = false,
  children,
}: {
  behavior: LabExportBehavior
  /** 遥测开着、但同意的还是旧告知范围（要再确认）。默认关。 */
  legacyConsent?: boolean
  /** 结果行/进行态那几格：挂载后自动点一次导出，把组件推到那个状态。 */
  autoExport?: boolean
  children: React.ReactNode
}): JSX.Element {
  React.useMemo(() => installLabBridge(behavior, legacyConsent), [behavior, legacyConsent])
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!autoExport) return
    ref.current?.querySelector<HTMLButtonElement>('[data-settings-section="diagnostics"] button')?.click()
  }, [autoExport])
  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-nomi border border-nomi-line bg-nomi-paper p-6"
      style={{ width: SETTINGS_CELL_WIDTH, height: SETTINGS_CELL_HEIGHT }}
      data-design-lab-stage="settings"
    >
      {children}
    </div>
  )
}
