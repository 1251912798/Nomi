/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../../design 的 NomiSegmented / WorkbenchIconButton、../../../../../../vendor/tablerIcons、
 *          ../../DirectorEditorContext、../../model/hotkeys（DIRECTOR_HOTKEYS / formatHotkey）、../../model/directorStore 的 TransformMode
 *          onCancelCreation 回调：点击任意工具前取消角色/方块/路径创建模式
 * [OUTPUT]: 对外提供 ViewportToolbar：统一标题栏里居中的纯图标工具条——重置视角 ｜ 选择 / 移动 / 旋转 / 缩放 ｜ 手绘画线 / 逐点 ｜ 退出导演台
 * [POS]: director/panels/viewport 的顶部工具条（图标 + tooltip 带快捷键，2026-09-04 用户拍板改进 DirectorEditor 的一整行标题栏，不再悬浮压视口）；
 *        画线 / 逐点是模式不是 gizmo 工具，进模式时关 gizmo。编辑模式提示不在这里，住检查器「空间变换」卡。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSegmented, WorkbenchIconButton } from '../../../../../../design'
import { IconArrowsMove, IconPencil, IconPointer, IconRefresh, IconResize, IconRotate, IconRoute, IconX } from '../../../../../../vendor/tablerIcons'
import { useDirectorStore } from '../../DirectorEditorContext'
import type { TransformMode } from '../../model/directorStore'
import { DIRECTOR_HOTKEYS, formatHotkey } from '../../model/hotkeys'

type ToolKey = 'select' | 'translate' | 'rotate' | 'scale' | 'drawPencil' | 'waypoint'

const TOOL_ICONS: Record<ToolKey, React.ReactNode> = {
  select: <IconPointer size={16} stroke={1.9} />,
  translate: <IconArrowsMove size={16} stroke={1.9} />,
  rotate: <IconRotate size={16} stroke={1.9} />,
  scale: <IconResize size={16} stroke={1.9} />,
  drawPencil: <IconPencil size={16} stroke={1.9} />,
  waypoint: <IconRoute size={16} stroke={1.9} />,
}
const TOOL_ORDER: ToolKey[] = ['select', 'translate', 'rotate', 'scale', 'drawPencil', 'waypoint']

export function ViewportToolbar({ onResetView, onExit, onCancelCreation }: { onResetView: () => void; onExit: () => void; onCancelCreation?: () => void }): JSX.Element {
  const { t } = useTranslation()
  const transformMode = useDirectorStore((state) => state.transformMode)
  const drawMode = useDirectorStore((state) => state.drawMode)
  const setTransformMode = useDirectorStore((state) => state.setTransformMode)
  const setDrawMode = useDirectorStore((state) => state.setDrawMode)
  const toolValue: ToolKey = drawMode === 'pencil' ? 'drawPencil' : drawMode === 'waypoint' ? 'waypoint' : transformMode ?? 'select'

  const onToolChange = (value: string) => {
    onCancelCreation?.()
    if (value === 'drawPencil' || value === 'waypoint') {
      setTransformMode(null)
      setDrawMode(value === 'drawPencil' ? 'pencil' : 'waypoint')
      return
    }
    setDrawMode(null)
    setTransformMode(value === 'select' ? null : (value as TransformMode))
  }

  return (
    <div
      className="flex items-center gap-1"
      role="toolbar"
      aria-label={t('director.topbar.toolsAria')}
      data-testid="director-viewport-toolbar"
    >
      <WorkbenchIconButton size="sm" icon={<IconRefresh size={16} stroke={1.9} />} label={`${t('director.topbar.resetCamera')} (${formatHotkey(DIRECTOR_HOTKEYS.resetCamera)})`} onClick={onResetView} />
      <span className="mx-0.5 h-4 w-px bg-nomi-line" aria-hidden />
      <NomiSegmented
        ariaLabel={t('director.topbar.toolsAria')}
        density="compact"
        fit="content"
        value={toolValue}
        options={TOOL_ORDER.map((key) => ({
          value: key,
          label: <span className="inline-flex items-center justify-center px-0.5">{TOOL_ICONS[key]}</span>,
          title: `${t(`director.topbar.${key}`)} (${formatHotkey(DIRECTOR_HOTKEYS[key])})`,
        }))}
        onChange={onToolChange}
      />
      <span className="mx-0.5 h-4 w-px bg-nomi-line" aria-hidden />
      <WorkbenchIconButton size="sm" icon={<IconX size={16} stroke={1.9} />} label={t('director.editor.exit')} data-testid="director-exit" onClick={onExit} />
    </div>
  )
}
