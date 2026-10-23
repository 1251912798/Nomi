// 「已提交、没取回」那一类错误卡的主按钮按任务来源分（⑬，协调 10-22）：
// 画布任务回到可找回面板「去重新取回」；制作 Run 保留「查看制作任务」。画布任务上写「查看制作任务」会误导。
import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import i18n from '../../../i18n'
import { tagNomiError } from '../../../../electron/shared/nomiErrorCodes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { reopenRecoverableNode } from '../runner/recoverTaskActions'
import { NodeErrorReport } from './NodeErrorReport'

const RETRIEVAL_FAILURE = tagNomiError('retrieval-query', '取回卡在「查询任务」这一步：socket hang up')

function canvasNode(taskId?: string): string {
  const store = useGenerationCanvasStore.getState()
  const node = store.addNode({ kind: 'video', prompt: '镜头 1', meta: { modelVendor: 'apimart', modelKey: 'video-model' } })
  store.appendNodeRun(node.id, { id: 'run-1', status: 'running', startedAt: 1, updatedAt: 1, ...(taskId ? { taskId } : {}) })
  store.setNodeStatus(node.id, 'error', RETRIEVAL_FAILURE)
  return node.id
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
})

describe('「已提交、没取回」错误卡的主按钮按任务来源分', () => {
  for (const lang of ['zh-CN', 'en'] as const) {
    it(`${lang} · 画布任务（有 taskId）：主按钮是「去重新取回」，不是「查看制作任务」`, async () => {
      await i18n.changeLanguage(lang)
      const nodeId = canvasNode('task-paid-1')
      const markup = renderToStaticMarkup(<NodeErrorReport message={RETRIEVAL_FAILURE} nodeId={nodeId} taskId="task-paid-1" meta={{}} onRetry={() => {}} />)
      expect(markup).toContain(i18n.t('generationCommon.observability.action.openRecoverable.main'))
      expect(markup).not.toContain(i18n.t('generationCommon.observability.action.viewTask.main'))
    })
  }

  it('制作 Run 的镜：保留「查看制作任务」', () => {
    const nodeId = canvasNode('task-paid-2')
    const markup = renderToStaticMarkup(<NodeErrorReport message={RETRIEVAL_FAILURE} nodeId={nodeId} taskId="task-paid-2" meta={{ productionRunId: 'run-x', productionShotId: 's1' }} onRetry={() => {}} />)
    expect(markup).toContain(i18n.t('generationCommon.observability.action.viewTask.main'))
    expect(markup).not.toContain(i18n.t('generationCommon.observability.action.openRecoverable.main'))
  })

  it('画布任务没有 taskId（回不到可找回）：不给一颗按不动的「去重新取回」，退回原动作', () => {
    const nodeId = canvasNode()
    const markup = renderToStaticMarkup(<NodeErrorReport message={RETRIEVAL_FAILURE} nodeId={nodeId} meta={{}} onRetry={() => {}} />)
    expect(markup).not.toContain(i18n.t('generationCommon.observability.action.openRecoverable.main'))
  })

  it('点「去重新取回」：节点回到可找回态，错误原话留着（面板照样给技术详情）', () => {
    const nodeId = canvasNode('task-paid-3')
    expect(reopenRecoverableNode(nodeId)).toBe(true)
    expect(useGenerationCanvasStore.getState().nodes.find((node) => node.id === nodeId)).toMatchObject({ status: 'recoverable', error: RETRIEVAL_FAILURE })
    expect(reopenRecoverableNode(canvasNode())).toBe(false)
  })
})
