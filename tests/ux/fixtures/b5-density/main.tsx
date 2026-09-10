// Isolated component evidence: synthetic props, actual production components; not a user journey.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/fraunces/wght.css'
import '@mantine/notifications/styles.css'
import '../../../../src/styles/index.css'
import { NomiAppProviders } from '../../../../src/NomiAppProviders'
import { NomiColorSchemeProvider } from '../../../../src/theme/NomiColorSchemeProvider'
import i18n from '../../../../src/i18n'
import { notify } from '../../../../src/ui/notificationPolicy'
import type { TaskCenterProjection } from '../../../../src/workbench/taskCenter/taskCenterProjection'
import { useTranslation } from 'react-i18next'

const query = new URLSearchParams(location.search)
const version = query.get('version') === 'before' ? 'before' : 'after'
const scene = query.get('scene') || 'dc22'
const modulePath = (current: string, baseline: string) => version === 'before' ? `/tests/ux/fixtures/b5-density/.baseline/${baseline}` : current
const { TaskRow } = await import(/* @vite-ignore */ modulePath('/src/workbench/taskCenter/TaskCenterPanel.tsx', 'TaskCenterPanel.tsx'))
const { buildExportJobTaskRows } = await import(/* @vite-ignore */ modulePath('/src/workbench/taskCenter/exportJobTaskCenter.ts', 'exportJobTaskCenter.ts'))
const { useNodeModelAutoSelect } = await import(/* @vite-ignore */ modulePath('/src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts', 'useNodeModelAutoSelect.ts'))
const { default: StoryboardPlanStrategyPanel } = await import(/* @vite-ignore */ modulePath('/src/workbench/creation/storyboard/StoryboardPlanStrategyPanel.tsx', 'StoryboardPlanStrategyPanel.tsx'))
if (version === 'before') {
  const { resources } = await import(/* @vite-ignore */ '/tests/ux/fixtures/b5-density/.baseline/resources.ts')
  i18n.addResourceBundle('zh-CN', 'translation', resources['zh-CN'].translation, true, true)
}
await i18n.changeLanguage('zh-CN')
const snapshot = { projectId: 'fixture-project', outputName: '海边日记', progress: { ratio: 1 }, error: { code: 'ENOSPC', message: 'private diagnostic must not render' } }
function ExportRows() {
  const { t } = useTranslation()
  const labels = { title: t('taskCenter.exportJob.title'), failed: t('taskCenter.exportJob.failed'), missingFile: t('taskCenter.exportJob.missingFile'), diskFull: t('taskCenter.exportJob.diskFull'), permissionDenied: t('taskCenter.exportJob.permissionDenied'), mediaUnreadable: t('taskCenter.exportJob.mediaUnreadable'), statuses: { succeeded: t('taskCenter.exportJob.statuses.succeeded'), failed: t('taskCenter.exportJob.statuses.failed') } }
  const rows = buildExportJobTaskRows([{ ...snapshot, id: 'success', status: 'succeeded', result: { relativeOutputPath: 'exports/final.mp4' } }, { ...snapshot, id: 'failure', status: 'failed' }], labels)
  return <div className="border border-nomi-line rounded-nomi-lg bg-nomi-paper" style={{ width: 380 }}>{rows.map((row: TaskCenterProjection) => <TaskRow key={row.id} row={row} onAction={() => {}} />)}</div>
}
const node = { id: 'component-evidence-image', kind: 'image', title: '海边日记', position: { x: 0, y: 0 }, status: 'error', error: '401 Unauthorized', meta: { modelKey: 'gpt-image-2', modelAlias: 'gpt-image-2', modelVendor: 'apimart', vendor: 'apimart' } }
const current = { value: 'gpt-image-2', modelKey: 'gpt-image-2', vendor: 'apimart', vendorName: 'Apimart', label: 'GPT Image 2' }
const options = [current, { ...current, vendor: 'code-newcli-com', vendorName: '我的中转' }]
function ProviderOffer() {
  const [writes, setWrites] = React.useState(0)
  const updateNode = React.useCallback(() => setWrites((count) => count + 1), [])
  useNodeModelAutoSelect({ node, modelOptions: options, selectedModelValue: 'gpt-image-2', selectedModelOption: current, archetype: null, isGenerationNode: true, isImageLike: true, isVideoLike: false, updateNode })
  return <p data-provider-writes={writes}>模型选择写入次数：{writes}（仅回调计数，不写入画布）</p>
}
function NotificationEvidence() {
  React.useEffect(() => {
    for (let i = 0; i < 2; i++) notify({ identity: 'component-export', reason: 'disk-full', level: 'background', message: '磁盘空间不足，请腾出空间后重新导出。', type: 'error', actionLabel: '返回导出', onAction: () => {} })
  }, [])
  return <p>同一个导出对象连续报告两次；由现役通知政策合并。</p>
}
function QuietStoryboard() { return <section data-quiet-storyboard><p className="text-caption mb-2">分镜方案：镜头时长与模型能力匹配</p><StoryboardPlanStrategyPanel plan={{ shots: [] }} state={{ status: 'ready', view: { blockers: [], requiredMerges: [], mergeSuggestions: [], splits: [] }, warnings: new Map() }} onChange={() => {}} /></section> }
function App() { return <NomiColorSchemeProvider><NomiAppProviders><main className="min-h-screen bg-nomi-paper text-nomi-ink p-8"><h1 className="text-title">B5 · {scene.toUpperCase()} · {version}</h1><p className="text-caption text-nomi-ink-60 mb-8">Electron component-evidence · 脱敏 props · 非真实用户端到端验收</p>{scene === 'dc22' ? <ExportRows /> : scene === 'b4' ? <ProviderOffer /> : scene === 'dc24' ? <QuietStoryboard /> : <NotificationEvidence />}</main></NomiAppProviders></NomiColorSchemeProvider> }
createRoot(document.getElementById('root')!).render(<App />)
