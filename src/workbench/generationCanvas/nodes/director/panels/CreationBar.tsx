/**
 * [INPUT]: 依赖 react、react-i18next、../../../../design 的 WorkbenchIconButton、../../../../vendor/tablerIcons、./Popover、../DirectorEditorContext、../model/cameraPresets、
 *          ../model/directorIds、../model/directorTypes、../scene/ViewportApiContext、../scene/creation 的两个 hook 类型
 *          ../model/cameraCoordinateSpace / sceneObjectGraph：当前视角和选中主体按完整层级转换，角色/方块创建入口互斥
 * [OUTPUT]: 对外提供 CreationBar：视口左缘竖向图标条——角色（女人 / 男人 → 放置模式）、机位（14 预设，相对选中主体）、灯光（3 种）、方块（画框模式），菜单向右弹出
 * [POS]: director/panels 的创建栏（左缘竖条 + 右弹菜单，机位菜单头「相对主体：X」）；只发意图，落地 / 画框由 scene/creation hooks 执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { WorkbenchIconButton } from '../../../../../design'
import { IconBulb, IconCube, IconMan, IconUser, IconVideo, IconWoman } from '../../../../../vendor/tablerIcons'
import { useDirectorStore, useDirectorStoreApi } from '../DirectorEditorContext'
import { CAMERA_PRESETS, buildCameraFromPreset } from '../model/cameraPresets'
import { createCameraId } from '../model/directorIds'
import { transformCameraPose } from '../model/cameraCoordinateSpace'
import { frameTransform, invertFrame, objectWorldFrame, sceneFrame } from '../model/sceneObjectGraph'
import type { DirectorLightType } from '../model/directorTypes'
import type { BoxDrawApi } from '../scene/creation/useBoxDraw'
import type { CharacterPlacementApi } from '../scene/creation/useCharacterPlacement'
import { useViewportApi } from '../scene/ViewportApiContext'
import { Popover, PopoverItem } from './Popover'

const LIGHT_TYPES: DirectorLightType[] = ['directional', 'point', 'spot']

function RailButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }): JSX.Element {
  return <WorkbenchIconButton size="sm" icon={icon} label={label} aria-pressed={active} className={active ? 'bg-nomi-accent-soft text-nomi-accent' : ''} onClick={onClick} />
}

export function CreationBar({ placement, boxDraw }: { placement: CharacterPlacementApi; boxDraw: BoxDrawApi }): JSX.Element {
  const { t } = useTranslation()
  const store = useDirectorStoreApi()
  const apiRef = useViewportApi()
  const [open, setOpen] = React.useState<'character' | 'camera' | 'light' | null>(null)
  const subject = useDirectorStore((state) => state.findObject(state.selection.objectId) ?? null)

  const addCameraFromPreset = (presetId: string) => {
    const preset = CAMERA_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const state = store.getState()
    const count = state.activeScene().cameras.length + 1
    const view = apiRef.current?.getViewPose()
    // 预设机位直接叫预设名（「正面中景」），只有「当前视角」叫「机位 N」
    const camera = buildCameraFromPreset({
      preset,
      id: createCameraId(),
      name: preset.isCurrent ? t('director.creation.cameraName', { index: count }) : t(`director.cameraPreset.${preset.id}`),
      subject: subject ? frameTransform(objectWorldFrame(state.activeScene().objects, subject.id)) : null,
      currentView: view ? transformCameraPose(view, invertFrame(sceneFrame(state.activeScene().sceneConfig))) : null,
    })
    const id = state.addCamera(camera)
    // 新机位同时成为预览机位（画中画切过去），主体取消选中
    state.setPreviewCamera(id)
    state.select({ cameraId: id, objectId: null, lightId: null, multiObjectIds: [] })
    setOpen(null)
  }

  const addLight = (type: DirectorLightType) => {
    const state = store.getState()
    const count = state.activeScene().lights.filter((light) => light.type === type).length + 1
    state.addLight(type, t(`director.creation.lightName.${type}`, { index: count }))
    setOpen(null)
  }

  const cameraLabel = subject ? `${t('director.creation.camera')} · ${t('director.creation.relativeTo', { name: subject.name })}` : t('director.creation.camera')

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-nomi-lg border border-nomi-line bg-nomi-paper/95 p-1 shadow-nomi-md backdrop-blur" data-testid="director-creation-bar">
      <Popover
        open={open === 'character'}
        onClose={() => setOpen(null)}
        side="right"
        align="start"
        trigger={<RailButton icon={<IconUser size={16} stroke={1.9} />} label={t('director.creation.character')} active={placement.active} onClick={() => setOpen(open === 'character' ? null : 'character')} />}
      >
        <PopoverItem onClick={() => { boxDraw.cancel(); placement.start('female'); setOpen(null) }}>
          <IconWoman size={16} stroke={1.9} />
          {t('director.creation.female')}
        </PopoverItem>
        <PopoverItem onClick={() => { boxDraw.cancel(); placement.start('male'); setOpen(null) }}>
          <IconMan size={16} stroke={1.9} />
          {t('director.creation.male')}
        </PopoverItem>
      </Popover>
      <Popover
        open={open === 'camera'}
        onClose={() => setOpen(null)}
        side="right"
        align="start"
        panelClassName="w-[200px] max-h-[380px] overflow-auto"
        trigger={<RailButton icon={<IconVideo size={16} stroke={1.9} />} label={cameraLabel} onClick={() => setOpen(open === 'camera' ? null : 'camera')} />}
      >
        <div className="px-2 py-1 text-caption font-semibold text-nomi-accent" data-testid="director-camera-subject">
          {subject ? t('director.creation.relativeTo', { name: subject.name }) : t('director.creation.relativeToOrigin')}
        </div>
        {/* 没选中主体时只给「当前视角」，预设都是相对主体的 */}
        {CAMERA_PRESETS.filter((preset) => subject || preset.isCurrent).map((preset) => (
          <PopoverItem key={preset.id} onClick={() => addCameraFromPreset(preset.id)}>
            {t(`director.cameraPreset.${preset.id}`)}
          </PopoverItem>
        ))}
      </Popover>
      <Popover
        open={open === 'light'}
        onClose={() => setOpen(null)}
        side="right"
        align="start"
        trigger={<RailButton icon={<IconBulb size={16} stroke={1.9} />} label={t('director.creation.light')} onClick={() => setOpen(open === 'light' ? null : 'light')} />}
      >
        {LIGHT_TYPES.map((type) => (
          <PopoverItem key={type} onClick={() => addLight(type)}>
            {t(`director.lightType.${type}`)}
          </PopoverItem>
        ))}
      </Popover>
      <RailButton icon={<IconCube size={16} stroke={1.9} />} label={t('director.creation.box')} active={boxDraw.active} onClick={() => { placement.cancel(); if (boxDraw.active) boxDraw.cancel(); else boxDraw.start() }} />
    </div>
  )
}
