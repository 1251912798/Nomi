// 渲染层的「这家这一行接不接受档案的型号名」查询口——只转述主进程随目录下发的结果（option.modelNameSource，
// 计算在 electron/catalog/modelNameSource.ts），给手里只有节点 meta（供应商 + 目录 key）、没有目录选项的档案解析用
// （发送路、连线、分镜……）。带着目录选项的解析（resolveArchetypeForOption）直接读 option，不经这里。
// 目录还没载入 → undefined：档案原样（与改前一致，不猜）。
import { installModelNameSourceLookup, type ModelNameSource } from '../../../../electron/shared/modelArchetypes/modelNameSource'
import type { NodeKind } from '../../../config/models'
import { peekCatalogModelOptions } from '../../../config/modelCatalogCache'

const CATALOG_KINDS: readonly NodeKind[] = ['video', 'image', 'imageEdit', 'audio', 'model3d', 'text']

function cachedModelNameSource(vendorKey: string, modelKey: string): ModelNameSource | undefined {
  for (const kind of CATALOG_KINDS) {
    const option = (peekCatalogModelOptions(kind) ?? []).find((candidate) => candidate.vendor === vendorKey
      && (candidate.modelKey === modelKey || candidate.value === modelKey || candidate.modelAlias === modelKey))
    if (option?.modelNameSource) return option.modelNameSource
  }
  return undefined
}

/** 渲染进程启动时装一次（src/main.tsx）。 */
export function installRendererModelNameSourceLookup(): () => void {
  return installModelNameSourceLookup(cachedModelNameSource)
}
