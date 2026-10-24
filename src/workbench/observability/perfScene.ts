// 「当前是什么场景」：画布规模 / 有没有生成在跑 / 所在页。只读 store 的当前值，取一次，不订阅。
// 只回数量和枚举，不回节点内容、标题、id。
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { useWorkbenchStore } from '../workbenchStore'
import { setPerfScene, type PerfScene } from './perfCollector'

export function readPerfScene(): PerfScene {
  const nodes = useGenerationCanvasStore.getState().nodes
  let imageNodes = 0
  let generating = false
  for (const node of nodes) {
    if (node.kind === 'image') imageNodes += 1
    if (node.status === 'queued' || node.status === 'running') generating = true
  }
  return { page: useWorkbenchStore.getState().workspaceMode, nodes: nodes.length, imageNodes, generating }
}

/** WorkbenchShell 挂载时调用；返回清理函数。没有场景源 = 在项目库。 */
export function bindPerfScene(): () => void {
  setPerfScene(readPerfScene)
  return () => setPerfScene(null)
}
