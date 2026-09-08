/**
 * [INPUT]: 依赖 react、react-i18next、../../../../design 的 NomiSegmented / WorkbenchIconButton、../../../../vendor/tablerIcons、../DirectorEditorContext、
 *          ../model/directorTypes 的 DirectorModelDisplayMode
 * [OUTPUT]: 对外提供 ModelDisplayModeSwitch：实体 / 半透 / 白模 三态 ｜ 偏好设置 / 帮助入口
 * [POS]: director/panels 的视口右下显示模式开关（清单 §2.4 V6）：改的是当前图层的 modelDisplayMode（只影响几何体，不影响角色/外部模型）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSegmented, WorkbenchIconButton } from '../../../../../design'
import { IconHelp, IconSettings } from '../../../../../vendor/tablerIcons'
import { useDirectorStore } from '../DirectorEditorContext'
import type { DirectorModelDisplayMode } from '../model/directorTypes'

const MODES: DirectorModelDisplayMode[] = ['solid', 'translucent', 'clay']

export function ModelDisplayModeSwitch({ onOpenSettings, onOpenHelp }: { onOpenSettings?: () => void; onOpenHelp?: () => void }): JSX.Element {
  const { t } = useTranslation()
  const mode = useDirectorStore((state) => state.activeScene().sceneConfig.modelDisplayMode)
  const patchSceneConfig = useDirectorStore((state) => state.patchSceneConfig)
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-nomi-lg border border-nomi-line bg-nomi-paper/95 p-1 shadow-nomi-md backdrop-blur" data-testid="director-display-mode">
      <NomiSegmented
        ariaLabel={t('director.displayMode.aria')}
        density="compact"
        fit="content"
        value={mode}
        options={MODES.map((value) => ({ value, label: t(`director.displayMode.${value}`), title: t(`director.displayMode.${value}Hint`) }))}
        onChange={(value) => patchSceneConfig({ modelDisplayMode: value as DirectorModelDisplayMode })}
      />
      {onOpenSettings || onOpenHelp ? <span className="mx-0.5 h-4 w-px bg-nomi-line" aria-hidden /> : null}
      {onOpenSettings ? <WorkbenchIconButton size="sm" icon={<IconSettings size={16} stroke={1.9} />} label={t('director.settings.title')} onClick={onOpenSettings} /> : null}
      {onOpenHelp ? <WorkbenchIconButton size="sm" icon={<IconHelp size={16} stroke={1.9} />} label={t('director.topbar.help')} data-testid="director-help" onClick={onOpenHelp} /> : null}
    </div>
  )
}
