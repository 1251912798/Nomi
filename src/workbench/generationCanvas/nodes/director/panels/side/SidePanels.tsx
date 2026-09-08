/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../utils/cn、./SceneObjectsTab、./AssetsTab、../inspector/ContextInspector、../EditorSplit
 * [OUTPUT]: 对外提供 SidePanels：右栏 = 上半（场景对象 / 资产库 标签页）+ 下半（属性检查器），中间可拖分栏
 * [POS]: director/panels/side 的右栏装配（清单 §3 + §4 的容器）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../../../utils/cn'
import { EditorSplit } from '../EditorSplit'
import { ContextInspector } from '../inspector/ContextInspector'
import { AssetsTab } from './AssetsTab'
import { SceneObjectsTab } from './SceneObjectsTab'

export function SidePanels(): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = React.useState<'objects' | 'assets'>('objects')
  return (
    <EditorSplit direction="vertical" storageKey="director.side" defaultRatio={0.5} minRatio={0.2} maxRatio={0.8}>
      <div className="flex h-full flex-col overflow-hidden border-l border-nomi-line bg-nomi-paper">
        <div className="flex gap-1 border-b border-nomi-line-soft px-2 pt-2 text-body-sm" role="tablist">
          {(['objects', 'assets'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={cn('border-b-2 px-2 pb-1 transition-colors', tab === value ? 'border-nomi-accent text-nomi-ink' : 'border-transparent text-nomi-ink-60 hover:text-nomi-ink')}
              onClick={() => setTab(value)}
            >
              {value === 'objects' ? t('director.regions.sceneObjects') : t('director.regions.assets')}
            </button>
          ))}
        </div>
        {tab === 'objects' ? <SceneObjectsTab /> : <AssetsTab />}
      </div>
      <div className="flex h-full flex-col overflow-hidden border-l border-nomi-line bg-nomi-paper">
        <ContextInspector />
      </div>
    </EditorSplit>
  )
}
