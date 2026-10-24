// 技能库面板的数据 hook：列出技能（内置+用户合并）、删除/导入/导出。
// 列表与导出是异步 IPC（目录由 pi 的加载器给）；导入/删除仍是同步回执。
import React from 'react'
import {
  deleteWorkbenchSkill,
  exportWorkbenchSkill,
  importWorkbenchSkill,
  listWorkbenchSkills,
  type SkillListItemDto,
} from '../api/skillApi'
import { onSkillLibraryChanged } from './skillLibraryChanged'

export type UseWorkbenchSkills = {
  items: SkillListItemDto[]
  reload: () => void
  remove: (dirName: string) => { ok: boolean; error?: string }
  importPackage: (payload: unknown) => { ok: boolean; skillName?: string; error?: string }
  exportPackage: (dirName: string) => Promise<unknown>
}

export function useWorkbenchSkills(opened: boolean): UseWorkbenchSkills {
  const [items, setItems] = React.useState<SkillListItemDto[]>([])

  const reload = React.useCallback(() => {
    listWorkbenchSkills()
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  React.useEffect(() => {
    if (!opened) return
    reload()
    // 别的面板（或本面板的另一个实例）写了技能盘就重读——列表只有一个真相源在盘上。
    return onSkillLibraryChanged(reload)
  }, [opened, reload])

  const remove = React.useCallback(
    (dirName: string) => {
      // 不在这里派发：技能盘的变更信号由主进程写盘那一层统一发出（`skillLibraryBroadcast.ts`），
      // 渲染层再喊一次就是第二个来源——它会在「Agent 写的技能」那条路上继续缺席。
      const res = deleteWorkbenchSkill(dirName)
      return { ok: res.ok, error: res.error }
    },
    [],
  )

  const importPackage = React.useCallback(
    (payload: unknown) => {
      const res = importWorkbenchSkill(payload)
      return { ok: res.ok, skillName: res.skillName, error: res.error }
    },
    [],
  )

  const exportPackage = React.useCallback((dirName: string) => exportWorkbenchSkill(dirName), [])

  return { items, reload, remove, importPackage, exportPackage }
}
