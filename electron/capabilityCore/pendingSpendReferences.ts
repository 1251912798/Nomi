import { iterateProjectAssets } from '../assets/assetReferenceIdentity';
import type { GenerationReference } from '../shared/agentCapabilities/generationPlanSchemas';
import { listProjectAssets, resolveProjectAssetReferenceIdentity } from '../assets/projectAssetStore';

// 一条钉住的参考（素材号 + 内容哈希 + 版本）此刻在项目素材库里的预览地址。落画布（候选参考投影到节点）与文稿方案的参考
// 预览都读它；钉住的版本对不上就拒，不拿一张已经换过的图冒充。D2 第③步之后付费卡上不再有参考（卡读节点本身），卡那一侧的
// 解析与预览随旧卡删掉。

type IndexedAsset = { id: string; data: Record<string, unknown> };
export type SpendReferenceAssets = Readonly<{
  list: (projectId: string) => readonly IndexedAsset[];
  identity: (projectId: string, assetId: string) => Readonly<{ contentHash: string; version: number }> | undefined;
}>;
export const projectSpendReferenceAssets: SpendReferenceAssets = {
  list: projectId => [...iterateProjectAssets(cursor => listProjectAssets({ projectId, limit: 500, cursor }))],
  identity: resolveProjectAssetReferenceIdentity,
};

/** Read-only URL projection; validates the pinned version against the existing asset index. */
export function resolveIndexedReferencePreview(projectId: string, reference: GenerationReference, assets: SpendReferenceAssets = projectSpendReferenceAssets): string {
  const identity = assets.identity(projectId, reference.assetId);
  const asset = assets.list(projectId).find(value => value.id === reference.assetId);
  if (!identity || identity.contentHash !== reference.contentHash || identity.version !== reference.version || typeof asset?.data.url !== 'string') throw new Error('storyboard_reference_asset_unavailable');
  return asset.data.url;
}
