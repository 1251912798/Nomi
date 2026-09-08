/**
 * [INPUT]: 依赖 react、react-i18next、../../../../design 的 WorkbenchIconButton / WorkbenchButton / NomiSegmented、../../../../vendor/tablerIcons、./Popover、
 *          ../DirectorEditorContext、../OutputsContext 的 useOutputs、../model/hotkeys、../model/directorTypes（导出画幅 / 分辨率枚举）、./fields/SliderNumberField、
 *          ./fields/FieldPrimitives 的 ToggleField、./outputs/OutputsPopover、./imageFile、./usePanoramaImport
 * [OUTPUT]: 对外提供 BottomBar：视口底部居中的一条图标胶囊——撤销 / 重做 ｜ 导入全景 / 群众矩阵 / 骨骼与 IK 把手 / 画幅 / AI 搭场景 / 截图 / 产出
 * [POS]: director/panels 的视口底栏（纯图标 + tooltip，分隔线分组，不带簇名）；截图与产出从时间轴头部挪到这里。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSegmented, WorkbenchButton, WorkbenchIconButton } from '../../../../../design'
import { IconArrowBackUp, IconArrowForwardUp, IconAspectRatio, IconCamera, IconLink, IconPhoto, IconSparkles, IconUsersGroup } from '../../../../../vendor/tablerIcons'
import { useDirectorStore, useDirectorStoreApi } from '../DirectorEditorContext'
import { DIRECTOR_EXPORT_RATIOS, DIRECTOR_EXPORT_RESOLUTIONS, type DirectorExportRatio, type DirectorExportResolution } from '../model/directorTypes'
import { DIRECTOR_HOTKEYS, formatHotkey } from '../model/hotkeys'
import { useOutputs } from '../OutputsContext'
import { ToggleField } from './fields/FieldPrimitives'
import { SliderNumberField } from './fields/SliderNumberField'
import { PANORAMA_ACCEPT } from './imageFile'
import { OutputsPopover } from './outputs/OutputsPopover'
import { Popover } from './Popover'
import { usePanoramaImport } from './usePanoramaImport'

function resolutionLabel(resolution: DirectorExportResolution): string {
  return resolution === '4k' ? '4K' : `${resolution}p`
}

function Divider(): JSX.Element {
  return <span className="mx-0.5 h-4 w-px bg-nomi-line" aria-hidden />
}

export function BottomBar({ aiOpen, onToggleAi }: { aiOpen: boolean; onToggleAi: () => void }): JSX.Element {
  const { t } = useTranslation()
  const store = useDirectorStoreApi()
  const outputs = useOutputs()
  const canUndo = useDirectorStore((state) => state.undoStack.length > 0)
  const canRedo = useDirectorStore((state) => state.redoStack.length > 0)
  const selectedCharacter = useDirectorStore((state) => {
    const object = state.findObject(state.selection.objectId)
    return object?.type === 'character' ? object : null
  })
  const exportRatio = useDirectorStore((state) => state.project.exportRatio)
  const exportResolution = useDirectorStore((state) => state.project.exportResolution)
  const showRuleOfThirds = useDirectorStore((state) => state.activeScene().sceneConfig.showRuleOfThirds)
  const showSkeleton = useDirectorStore((state) => state.activeScene().sceneConfig.showSkeleton)
  const [crowdOpen, setCrowdOpen] = React.useState(false)
  const { importPanoramaFile } = usePanoramaImport()
  const panoramaInputRef = React.useRef<HTMLInputElement | null>(null)
  const [aspectOpen, setAspectOpen] = React.useState(false)
  const [rows, setRows] = React.useState(2)
  const [cols, setCols] = React.useState(3)
  const [spacing, setSpacing] = React.useState(2)

  const generateCrowd = () => {
    if (!selectedCharacter) return
    store.getState().batchCreateCrowd(selectedCharacter.id, rows, cols, spacing, t('director.bottomBar.crowdGroupName', { name: selectedCharacter.name }))
    setCrowdOpen(false)
  }
  const pressed = (on: boolean) => (on ? 'bg-nomi-accent-soft text-nomi-accent' : '')

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-nomi-lg border border-nomi-line bg-nomi-paper/95 p-1 shadow-nomi-md backdrop-blur" data-testid="director-bottom-bar">
      <WorkbenchIconButton size="sm" icon={<IconArrowBackUp size={16} stroke={1.9} />} label={`${t('director.bottomBar.undo')} (${formatHotkey(DIRECTOR_HOTKEYS.undo)})`} disabled={!canUndo} onClick={() => store.getState().undo()} />
      <WorkbenchIconButton size="sm" icon={<IconArrowForwardUp size={16} stroke={1.9} />} label={`${t('director.bottomBar.redo')} (${formatHotkey(DIRECTOR_HOTKEYS.redo)})`} disabled={!canRedo} onClick={() => store.getState().redo()} />
      <Divider />
      <WorkbenchIconButton size="sm" icon={<IconPhoto size={16} stroke={1.9} />} label={t('director.bottomBar.panoramaImport')} title={t('director.bottomBar.panoramaImportHint')} onClick={() => panoramaInputRef.current?.click()} />
      <input
        ref={panoramaInputRef}
        type="file"
        accept={PANORAMA_ACCEPT}
        className="hidden"
        aria-label={t('director.bottomBar.panoramaImport')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) importPanoramaFile(file)
        }}
      />
      <Popover
        open={crowdOpen}
        onClose={() => setCrowdOpen(false)}
        panelClassName="w-[240px] p-3"
        trigger={
          <span title={selectedCharacter ? undefined : t('director.bottomBar.crowdNeedsCharacter')}>
            <WorkbenchIconButton size="sm" icon={<IconUsersGroup size={16} stroke={1.9} />} label={t('director.bottomBar.crowd')} disabled={!selectedCharacter} onClick={() => setCrowdOpen((value) => !value)} />
          </span>
        }
      >
        <div className="mb-2 text-caption font-semibold text-nomi-ink-80">{t('director.bottomBar.crowdTitle')}</div>
        <SliderNumberField label={t('director.bottomBar.crowdRows')} value={rows} min={1} max={10} step={1} onChange={setRows} />
        <SliderNumberField label={t('director.bottomBar.crowdCols')} value={cols} min={1} max={10} step={1} onChange={setCols} />
        <SliderNumberField label={t('director.bottomBar.crowdSpacing')} value={spacing} min={0.5} max={5} step={0.1} unit="m" onChange={setSpacing} />
        <WorkbenchButton size="sm" variant="primary" className="mt-2 w-full" onClick={generateCrowd}>
          {t('director.bottomBar.crowdConfirm')}
        </WorkbenchButton>
      </Popover>
      <WorkbenchIconButton
        size="sm"
        icon={<IconLink size={16} stroke={1.9} />}
        label={t('director.bottomBar.skeleton')}
        title={t('director.bottomBar.skeletonHint')}
        aria-pressed={showSkeleton}
        className={pressed(showSkeleton)}
        onClick={() => store.getState().patchSceneConfig({ showSkeleton: !showSkeleton })}
      />
      <Popover
        open={aspectOpen}
        onClose={() => setAspectOpen(false)}
        panelClassName="w-[320px] p-3"
        trigger={
          <WorkbenchIconButton
            size="sm"
            icon={<IconAspectRatio size={16} stroke={1.9} />}
            label={`${t('director.aspect.title')} · ${exportRatio === 'free' ? t('director.aspect.free') : exportRatio} · ${resolutionLabel(exportResolution)}`}
            aria-pressed={aspectOpen}
            className={pressed(aspectOpen)}
            onClick={() => setAspectOpen((value) => !value)}
          />
        }
      >
        <div className="mb-1 text-caption font-semibold text-nomi-ink-80">{t('director.aspect.ratio')}</div>
        <NomiSegmented
          ariaLabel={t('director.aspect.ratio')}
          density="compact"
          value={exportRatio}
          options={DIRECTOR_EXPORT_RATIOS.map((ratio) => ({ value: ratio, label: ratio === 'free' ? t('director.aspect.free') : ratio }))}
          onChange={(value) => store.getState().setExportRatio(value as DirectorExportRatio)}
        />
        <div className="mb-1 mt-3 text-caption font-semibold text-nomi-ink-80">{t('director.aspect.resolution')}</div>
        <NomiSegmented
          ariaLabel={t('director.aspect.resolution')}
          density="compact"
          value={exportResolution}
          options={DIRECTOR_EXPORT_RESOLUTIONS.map((resolution) => ({ value: resolution, label: resolutionLabel(resolution) }))}
          onChange={(value) => store.getState().setExportResolution(value as DirectorExportResolution)}
        />
        <div className="mt-2">
          <ToggleField label={t('director.aspect.thirds')} hint={t('director.aspect.thirdsHint')} checked={showRuleOfThirds} onChange={(showRuleOfThirds) => store.getState().patchSceneConfig({ showRuleOfThirds })} />
        </div>
      </Popover>
      <WorkbenchIconButton
        size="sm"
        icon={<IconSparkles size={16} stroke={1.9} />}
        label={t('director.ai.toggle')}
        title={t('director.ai.toggleHint')}
        aria-pressed={aiOpen}
        className={pressed(aiOpen)}
        onClick={onToggleAi}
      />
      <WorkbenchIconButton
        size="sm"
        icon={<IconCamera size={16} stroke={1.9} />}
        label={`${t('director.bottomBar.screenshot')} (${formatHotkey(DIRECTOR_HOTKEYS.screenshot)})`}
        data-testid="director-screenshot"
        onClick={() => void outputs.takeScreenshot()}
      />
      <OutputsPopover />
    </div>
  )
}
