/**
 * [INPUT]: 依赖 react、react-i18next、../../DirectorEditorContext、./CharacterInspector、./CameraInspector、./LightInspector、./PrimitiveInspector、./SceneLayerInspector
 * [OUTPUT]: 对外提供 ContextInspector：按选中类型切换检查器（时间轴片段 / 关键帧优先、整块替换；否则 角色 / 机位 / 灯 / 几何体·组；无选中 → 场景图层配置）
 * [POS]: director/panels/inspector 的分发器（清单 §4 I1–I13；片段/路标检查器 S2 加入）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useDirectorStore } from '../../DirectorEditorContext'
import { CameraInspector } from './CameraInspector'
import { CharacterInspector } from './CharacterInspector'
import { LightInspector } from './LightInspector'
import { PrimitiveInspector } from './PrimitiveInspector'
import { SceneLayerInspector } from './SceneLayerInspector'
import { useTimelineSelectionCard } from './TimelineSelectionCards'

export function ContextInspector(): JSX.Element {
  const { t } = useTranslation()
  const object = useDirectorStore((state) => state.findObject(state.selection.objectId) ?? null)
  const camera = useDirectorStore((state) => state.findCamera(state.selection.cameraId) ?? null)
  const light = useDirectorStore((state) => state.findLight(state.selection.lightId) ?? null)
  const sceneName = useDirectorStore((state) => state.activeScene().name)

  // 时间轴上选中片段 / 关键帧时，检查器只显示那一张卡（标题也换成它的）
  const timelineCard = useTimelineSelectionCard(object ?? camera ?? null)

  let title: string
  let body: React.ReactNode
  if (timelineCard) {
    title = timelineCard.title
    body = timelineCard.node
  } else if (object?.type === 'character') {
    title = t('director.inspector.characterTitle', { name: object.name })
    body = <CharacterInspector object={object} />
  } else if (object) {
    title = t('director.inspector.objectTitle', { name: object.name })
    body = <PrimitiveInspector object={object} />
  } else if (camera) {
    title = t('director.inspector.cameraTitle', { name: camera.name })
    body = <CameraInspector camera={camera} />
  } else if (light) {
    title = t('director.inspector.lightTitle', { name: light.name })
    body = <LightInspector light={light} />
  } else {
    title = t('director.inspector.sceneTitle', { name: sceneName })
    body = <SceneLayerInspector />
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="director-inspector">
      <div className="border-b border-nomi-line-soft px-3 py-2 text-body-sm font-medium text-nomi-ink">{title}</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {body}
      </div>
    </div>
  )
}
