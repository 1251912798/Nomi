/**
 * [INPUT]: 依赖 react、react-i18next、../../scene/DirectorCanvas、../../scene/ViewCamera 的 DEFAULT_VIEW_SETTINGS / ViewSettings、
 *          ../../scene/sceneTheme、../../scene/creation 两个 hook、../../scene/LabelProjector 类型、../CreationBar、../BottomBar、
 *          ../ModelDisplayModeSwitch、./ViewportOverlays、../../DirectorEditorContext、../../model/directorTypes、../../scene/ViewportApiContext
 *          ../../useDirectorHotkeys 的共享输入归属；统一创建模式 Esc、工具切换取消与 Orbit 生命周期
 * [OUTPUT]: 对外提供 DirectorViewport：视口容器 —— 画布 + 标签层 + 模式提示 + 放置/画框 HUD + 创建栏 + 底部栏 + 显示模式；
 *           指针事件先给创建模式 hook，再落到画布拾取；悬浮态写入 hoveredRef / scopeRef
 * [POS]: director/panels/viewport 的视口装配（清单 §2 全部 DOM 侧），three 世界在 scene/DirectorCanvas。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useDirectorStore } from '../../DirectorEditorContext'
import { isDirectorKeyboardBlocked } from '../../useDirectorHotkeys'
import { useViewportApi } from '../../scene/ViewportApiContext'
import type { DirectorHotkeyScope } from '../../model/hotkeys'
import { toast } from '../../../../../../ui/toast'
import { useBoxDraw } from '../../scene/creation/useBoxDraw'
import { useCharacterPlacement } from '../../scene/creation/useCharacterPlacement'
import { usePathDraw } from '../../scene/creation/usePathDraw'
import { DirectorCanvas } from '../../scene/DirectorCanvas'
import type { ProjectedLabel } from '../../scene/LabelProjector'
import type { DirectorViewportTheme } from '../../scene/sceneTheme'
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '../../scene/viewSettings'
import { AiSceneBar } from '../ai/AiSceneBar'
import { BottomBar } from '../BottomBar'
import { CreationBar } from '../CreationBar'
import { ModelDisplayModeSwitch } from '../ModelDisplayModeSwitch'
import { useCameraRecorder } from '../../CameraRecorderContext'
import { exportAspectRatio } from '../../model/cameraLens'
import type { PipRect } from '../../scene/pipCamera'
import { AspectGuide } from './AspectGuide'
import { CameraPovHud } from './CameraPovHud'
import { PipViewport } from './PipViewport'
import { PathDrawHud, PlacementHud, ViewportLabels } from './ViewportOverlays'

export type DirectorViewportProps = {
  theme: DirectorViewportTheme
  viewSettings?: ViewSettings
  scopeRef: React.MutableRefObject<DirectorHotkeyScope>
  onOpenSettings?: () => void
  onOpenHelp?: () => void
  cancelCreationRef?: React.MutableRefObject<(() => void) | null>
}

export function DirectorViewport({ theme, viewSettings = DEFAULT_VIEW_SETTINGS, scopeRef, onOpenSettings, onOpenHelp, cancelCreationRef }: DirectorViewportProps): JSX.Element {
  const { t } = useTranslation()
  const hoveredRef = React.useRef(false)
  const apiRef = useViewportApi()
  const transformMode = useDirectorStore((state) => state.transformMode)
  const pickingEnabledRef = React.useRef(true)
  const hostRef = React.useRef<HTMLDivElement>(null)
  const pipRectRef = React.useRef<PipRect>(null)
  const recorder = useCameraRecorder()
  const [labels, setLabels] = React.useState<ProjectedLabel[]>([])
  const [aiOpen, setAiOpen] = React.useState(false)
  const exportRatio = useDirectorStore((state) => state.project.exportRatio)
  const reject = React.useCallback((key: string) => toast(t(key as 'director.reason.closeupLocked'), 'warning'), [t])
  const placement = useCharacterPlacement({ characterName: (index) => t('director.creation.characterName', { index }) })
  const boxDraw = useBoxDraw({ boxName: (index) => t('director.creation.boxName', { index }) })
  const pathDraw = usePathDraw({ notify: (key, params) => toast(t(key as 'director.trajectory.created', params), 'info') })
  const { cancel: cancelPlacement } = placement
  const { cancel: cancelBox } = boxDraw
  const { cancel: cancelPath } = pathDraw
  const modeActive = placement.active || boxDraw.active || pathDraw.active
  pickingEnabledRef.current = !modeActive

  const cancelCreation = React.useCallback(() => {
    cancelPlacement()
    cancelBox()
    cancelPath()
  }, [cancelPlacement, cancelBox, cancelPath])
  React.useEffect(() => {
    if (!cancelCreationRef) return
    cancelCreationRef.current = cancelCreation
    return () => { cancelCreationRef.current = null }
  }, [cancelCreation, cancelCreationRef])
  // 4/5 或 1/2/3 接管时，角色放置/画框必须退出；Orbit 的开关只由此聚合所有权控制。
  React.useEffect(() => {
    if (pathDraw.active || transformMode !== null) { cancelPlacement(); cancelBox() }
  }, [pathDraw.active, transformMode, cancelPlacement, cancelBox])
  React.useEffect(() => {
    const api = apiRef.current
    api?.setOrbitEnabled(!modeActive)
    return () => { api?.setOrbitEnabled(true) }
  }, [apiRef, modeActive])

  // Esc：先取消创建/画路径模式（O5 归属顺序里模式优先于选择/退出）
  React.useEffect(() => {
    if (!modeActive) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isDirectorKeyboardBlocked(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancelCreation()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [cancelCreation, modeActive])

  return (
    <div
      ref={hostRef}
      className={`relative h-full w-full overflow-hidden bg-nomi-bg ${modeActive ? 'cursor-crosshair' : ''}`}
      data-testid="director-viewport"
      data-nomi-director-creation-mode={modeActive ? 'active' : undefined}
      onPointerEnter={() => {
        hoveredRef.current = true
        scopeRef.current = 'viewport'
      }}
      onPointerLeave={() => {
        hoveredRef.current = false
        placement.onPointerLeave()
        pathDraw.onPointerLeave()
      }}
      onPointerDown={(event) => {
        if (placement.onPointerDown(event) || boxDraw.onPointerDown(event) || pathDraw.onPointerDown(event)) event.stopPropagation()
      }}
      onPointerMove={(event) => {
        if (placement.onPointerMove(event) || boxDraw.onPointerMove(event) || pathDraw.onPointerMove(event)) event.stopPropagation()
      }}
      onPointerUp={(event) => {
        if (placement.onPointerUp(event) || boxDraw.onPointerUp(event) || pathDraw.onPointerUp(event)) event.stopPropagation()
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        if (modeActive) {
          placement.cancel()
          boxDraw.cancel()
          pathDraw.cancel()
        }
      }}
    >
      <DirectorCanvas
        theme={theme}
        viewSettings={viewSettings}
        hoveredRef={hoveredRef}
        pickingEnabledRef={pickingEnabledRef}
        placementGhostRef={placement.ghostRef}
        boxGhostRef={boxDraw.ghostRef}
        pathGhostRef={pathDraw.ghostRef}
        recordingGhostRef={recorder.ghostRef}
        pipRectRef={pipRectRef}
        aspect={exportAspectRatio(exportRatio) ?? 16 / 9}
        onLabels={setLabels}
        onPovRejected={reject}
      />
      <AspectGuide pipRectRef={pipRectRef} />
      <ViewportLabels labels={labels} />
      <CameraPovHud />
      <PlacementHud placement={placement} boxDraw={boxDraw} />
      <PathDrawHud pathDraw={pathDraw} />
      <PipViewport rectRef={pipRectRef} canvasHostRef={hostRef} />
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
        <CreationBar placement={placement} boxDraw={boxDraw} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
        <AiSceneBar open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <BottomBar aiOpen={aiOpen} onToggleAi={() => setAiOpen((value) => !value)} />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3">
        <ModelDisplayModeSwitch onOpenSettings={onOpenSettings} onOpenHelp={onOpenHelp} />
      </div>
    </div>
  )
}
