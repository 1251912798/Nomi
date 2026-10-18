import { getDesktopBridge, type DesktopBridge } from '../../desktop/bridge'
import type { TaskKind } from './taskApi'
import type { AssetKind } from '../assets/assetTypes'
import type { ProjectBinding } from '../../../electron/shared/projectBinding'
import { unwrapAssetImportResult } from '../../../electron/shared/contracts/assetImportResult'
import { canvasPreviewFieldsFromReceipt, type CanvasPreviewFields } from '../../../electron/shared/canvas/canvasMediaPreview'

export type WorkbenchAssetDto = {
  id: string
  name: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
  userId: string
  projectId?: string | null
}

/** 从落盘资产 DTO 取可持久化 URL（nomi-local://）；无则空串。单一实现，别在各 adapter 各抄一份（P1）。 */
export function hostedAssetUrl(asset: WorkbenchAssetDto | null | undefined): string {
  return typeof asset?.data?.url === 'string' ? asset.data.url.trim() : ''
}

/**
 * 落盘回执 → 画布结果的预览两栏（独立小图 + 预览事实）。渲染层所有「拿到落盘资产就往画布结果里写」的入口
 * 只用这一个，不再各自读 thumbnailUrl、更不许没有小图时把源地址填进去（见 shared/canvas/canvasMediaPreview）。
 */
export function hostedAssetCanvasPreview(
  asset: WorkbenchAssetDto | null | undefined,
  type: string | undefined,
): CanvasPreviewFields {
  return canvasPreviewFieldsFromReceipt(type, asset?.data, hostedAssetUrl(asset))
}

/**
 * 目标项目只能是发起动作签发的完整绑定（withProjectAction 的 context.binding + assertCurrent）。
 * 没有「缺省落当前项目」：后台产物本地化走 resultAssetLocalization，带任务自己的 projectId。
 */
export type UploadWorkbenchAssetMeta = {
  projectBinding: ProjectBinding
  assertCurrent: () => void
  prompt?: string | null
  vendor?: string | null
  modelKey?: string | null
  taskKind?: TaskKind | string | null
  ownerNodeId?: string | null
} & (
  /** 资产分桶：用户上传='upload'（默认）。 */
  | { kind?: 'upload'; expectedKind?: never }
  /**
   * 生成结果补救本地化='generated'（与主进程 localizeTaskAsset 同桶）。必须说清它该是哪一类：主进程落盘关口按字节核，
   * 对不上就不收（V-1213：视频任务落进一张参考图）。
   */
  | { kind: 'generated'; expectedKind: AssetKind }
)

function requireDesktopRuntime(feature: string): DesktopBridge {
  const desktop = getDesktopBridge()
  if (!desktop) throw new Error(`${feature} requires the Electron desktop runtime`)
  return desktop
}

export function buildWorkbenchAssetImportRequestKey(
  file: File,
  name?: string,
  meta?: UploadWorkbenchAssetMeta,
): string {
  const fileName = typeof file.name === 'string' ? file.name.trim() : ''
  const fileSize = typeof file.size === 'number' && Number.isFinite(file.size) ? String(file.size) : ''
  const lastModified =
    typeof file.lastModified === 'number' && Number.isFinite(file.lastModified)
      ? String(file.lastModified)
      : ''
  const fileType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : ''
  const uploadName = typeof name === 'string' ? name.trim() : ''
  const projectId = meta?.projectBinding?.projectId?.trim() ?? ''
  const ownerNodeId = typeof meta?.ownerNodeId === 'string' ? meta.ownerNodeId.trim() : ''
  return [fileName, fileSize, lastModified, fileType, uploadName, projectId, ownerNodeId].join('|')
}

export async function importWorkbenchLocalAssetFile(
  file: File,
  name: string | undefined,
  meta: UploadWorkbenchAssetMeta,
): Promise<WorkbenchAssetDto> {
  meta.assertCurrent()
  const desktop = requireDesktopRuntime('local asset import')
  const request = {
    projectId: meta.projectBinding.projectId,
    projectBinding: meta.projectBinding,
    fileName: name || file.name || 'asset',
    contentType: file.type || 'application/octet-stream',
    kind: 'upload' as const,
    // 导入进度广播的收件人：主进程按它把「已拷贝字节 / 总字节」回报给画布上那张卡。
    ownerNodeId: meta?.ownerNodeId || null,
  }
  if (desktop.assets.importNativeFile) {
    const imported = await desktop.assets.importNativeFile(file, request)
    meta.assertCurrent()
    if (imported) return unwrapAssetImportResult(imported) as WorkbenchAssetDto
  }
  const arrayBuffer = await file.arrayBuffer()
  meta.assertCurrent()
  const imported = await desktop.assets.importFile({
    ...request,
    bytes: arrayBuffer,
  })
  meta.assertCurrent()
  return unwrapAssetImportResult(imported) as WorkbenchAssetDto
}

export async function importWorkbenchRemoteAssetUrl(
  url: string,
  name: string | undefined,
  meta: UploadWorkbenchAssetMeta,
): Promise<WorkbenchAssetDto> {
  meta.assertCurrent()
  const desktop = requireDesktopRuntime('remote asset import')
  const imported = await desktop.assets.importRemoteUrl({
    projectId: meta.projectBinding.projectId,
    projectBinding: meta.projectBinding,
    url,
    kind: meta.kind || 'upload',
    expectedKind: meta.kind === 'generated' ? meta.expectedKind : null,
    fileName: name,
    ownerNodeId: meta.ownerNodeId || null,
  })
  meta.assertCurrent()
  return unwrapAssetImportResult(imported) as WorkbenchAssetDto
}

export async function recoverImportedWorkbenchLocalAssetFile(_file: File): Promise<WorkbenchAssetDto | null> {
  return null
}
