/**
 * 「成组处理」这一族画布动作：编组 / 解组 / 连到组 / 生成总览图。
 *
 * 批量生成只有组工具条的「生成整组」（useCanvasFrameActions.runFrameAction），这里不再放生成入口。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { reportCanvasFeedback } from './canvasFeedback'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { buildContactSheetNode, contactSheetSources } from '../nodes/buildContactSheetNode'
import { withProjectAction } from '../../project/projectCanvasReadSurface'
import { selectCanvasNodeById } from '../store/canvasNodeGenerationIndex'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { GenerationCanvasState } from '../store/canvasStoreTypes'

/**
 * 选中里已出图的张数（<2 就没有总览图可生成，多选浮条上那个钮不出现）。按 id 查选中的那几张，
 * 不整表订阅 nodes：别的卡写进度时结果不变，订阅它的组件就不重渲。
 */
export function selectSelectedContactSheetCount(state: Pick<GenerationCanvasState, 'nodes' | 'edges' | 'selectedNodeIds'>): number {
  if (state.selectedNodeIds.length < 2) return 0
  const selected = state.selectedNodeIds.flatMap((id): GenerationCanvasNode[] => {
    const node = selectCanvasNodeById(state, id)
    return node ? [node] : []
  })
  return contactSheetSources(state.selectedNodeIds, selected).length
}

export function useCanvasGroupActions(params: {
  activeCategoryId: string
  selectedGroupIds: string[]
}): {
  handleGroupSelectedNodes: () => void
  handleUngroupSelectedNodes: () => void
  handleConnectToGroup: (groupId: string) => void
  handleBuildContactSheet: () => void
} {
  const { activeCategoryId, selectedGroupIds } = params
  const { t } = useTranslation()
  const groupSelectedNodes = useGenerationCanvasStore((state) => state.groupSelectedNodes)
  const ungroupGroups = useGenerationCanvasStore((state) => state.ungroupGroups)

  const handleGroupSelectedNodes = React.useCallback(() => {
    groupSelectedNodes(activeCategoryId)
    // 编组结果即时显示为画布上的组框 → 成功 toast 是噪音（弹窗审计 R2）。
  }, [activeCategoryId, groupSelectedNodes])

  const handleUngroupSelectedNodes = React.useCallback(() => {
    if (!selectedGroupIds.length) return
    ungroupGroups(selectedGroupIds)
    // 解组结果画布即时可见 → 成功 toast 是噪音（弹窗审计 R2）。
  }, [selectedGroupIds, ungroupGroups])

  // 连到组：给组内每个成员各连一根真边（图结构不变）。被能力校验跳过的必须说清，不许静默丢。
  const handleConnectToGroup = React.useCallback((groupId: string) => {
    const report = (message: string) => reportCanvasFeedback(message, 'warning', { projectId: withProjectAction((project) => project.binding.projectId) ?? '', identity: `group:${groupId}`, reason: 'connect', nodeIds: useGenerationCanvasStore.getState().groups.find((group) => group.id === groupId)?.nodeIds })
    const result = useGenerationCanvasStore.getState().connectToGroup(groupId)
    if (result.ok) {
      if (result.skipped > 0) {
        report(t('generationCommon.canvas.group.connectedWithSkips', {
          connected: result.connected,
          skipped: result.skipped,
        }))
      }
      return
    }
    if (result.reason === 'all_skipped') {
      report(t('generationCommon.canvas.group.connectAllSkipped', { count: result.skipped }))
    } else if (result.reason === 'group_empty') {
      report(t('generationCommon.canvas.group.connectEmpty'))
    }
  }, [t])

  // 总览图：把选中的成图排成一张，给客户/团队看整场戏。产物是普通图片节点（不新增节点 kind）。
  // 选区在点下去那一刻读（不订阅）：画布壳不因选中重渲；可生成张数由浮条那一层用 selectSelectedContactSheetCount 订阅。
  const handleBuildContactSheet = React.useCallback(() => {
    const selectedNodeIds = [...useGenerationCanvasStore.getState().selectedNodeIds]
    const projectId = withProjectAction((project) => project.binding.projectId) ?? ''
    void buildContactSheetNode(selectedNodeIds, (message) => reportCanvasFeedback(message, 'error', { projectId, identity: `contact-sheet:${selectedNodeIds.slice().sort().join(':')}`, reason: 'build', nodeIds: selectedNodeIds }))
  }, [])

  return {
    handleGroupSelectedNodes,
    handleUngroupSelectedNodes,
    handleConnectToGroup,
    handleBuildContactSheet,
  }
}
