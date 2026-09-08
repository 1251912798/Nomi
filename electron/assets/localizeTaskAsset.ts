import type { Vendor } from "../catalog/types";
import { trustedLocalOutputOrigin } from "../catalog/assetLocalization";
import { scheduleTechnicalReview } from "../review/reviewTrace";
import { importRemoteAsset } from "./projectAssetStore";
import { broadcastAssetLocalizationStarted } from "./assetEvents";
import { localizedTaskAssetFileName, probeLocalizedDurationSeconds } from "./localizedAsset";

export async function localizeTaskAsset(
  projectId: string,
  assetUrl: string,
  type: "image" | "video" | "audio" | "model3d",
  nodeId?: string, vendor?: Pick<Vendor, "key" | "baseUrlHint" | "network">,
  certificationEvidence?: import("../providerAdapter/certificationMedia").CertificationMediaEvidence,
) {
  if (nodeId) await broadcastAssetLocalizationStarted({ projectId, nodeId });
  const imported = (await importRemoteAsset({
    projectId,
    url: assetUrl,
    kind: "generated",
    ownerNodeId: nodeId || null,
    fileName: localizedTaskAssetFileName(type, assetUrl),
  }, {
    trustedPrivateOrigin: trustedLocalOutputOrigin(vendor) || undefined,
    ...(certificationEvidence ? { certificationEvidence } : {}), ...(vendor?.network ? { providerNetwork: vendor.network } : {}),
  })) as { id?: string; name?: string; data?: { url?: string; absolutePath?: string } };
  const durationSeconds = await probeLocalizedDurationSeconds(type, imported.data?.absolutePath);
  if (type === "image" || type === "video")
    scheduleTechnicalReview({
      projectId,
      nodeId,
      absolutePath: String(imported.data?.absolutePath || ""),
      assetUrl: String(imported.data?.url || assetUrl),
      type,
    }); // S4-2b:落地技术自检,仅图像/视频（3D 模型不送 VLM）
  return {
    type,
    url: String(imported.data?.url || assetUrl),
    thumbnailUrl: type === "image" ? String(imported.data?.url || assetUrl) : null,
    assetId: imported.id || null,
    assetName: imported.name || null,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    // 原始 CDN URL 留存：任何 vendor 都能直接使用，不需要再上传或转 base64。
    providerUrl: /^https?:\/\//i.test(assetUrl) ? assetUrl : null,
  };
}

