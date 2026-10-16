// 生成产物落盘的第一步：异步准备「已校验暂存件」（2026-10-16 方向 B，用户拍板）。
//
// 为什么分两步：解码校验要等 ffmpeg，主进程不能同步等（0.23.1 卡顿）；但共享的同步写入边界（writeAsset /
// moveAssetFile ……）有十几扇门，每个调用方都靠「返回时文件已经落好」安排时序、原子性和清理——把整个边界改成异步，
// 契约就对所有调用方一起变了（独立验收 V-1208 连着三轮冒同类回归，复盘见
// docs/engineering/direction-checks/2026-10-16-main-process-sync-child-wait.md「第二次复盘」）。
// 所以异步的只有这一步：
//   ① 进门（任何 await 之前）钉住调用方字节的一份拷贝；捕获项目身份（AssetWriteContext）；
//   ② 把字节 / 源文件**异步**写进本项目根下的私有暂存（与正式路径同卷）；
//   ③ 在**暂存文件**上做内容校验和异步解码——暂存只有这里持有，校验的就是之后发布的那一份；
//   ④ 产出品牌类型 VerifiedStagedAsset。
// 第二步 publishVerifiedGeneratedAsset（projectAssetStore）同步：复验项目身份 → renameSync 原子发布 → sidecar → 广播。
// 任何一步失败都只清暂存，正式路径从不出现残片；进程中途退出留下的暂存由 reapAbandonedUploadStaging 回收。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { JsonRecord } from "../jsonUtils";
import type { CertificationMediaEvidence } from "../providerAdapter/certificationMedia";
import { copyFileWithProgress, type AssetCopyProgress } from "./assetImportProgress";
import { sanitizeAssetMetaForKind } from "./assetPaths";
import { captureAssetWriteContext, type AssetWriteContext } from "./assetWriteContext";
import { generatedMediaValidationError, verifyGeneratedMediaDecodes } from "./generatedMediaDecode";
import { contentTypeFromMagicBytes, isCertifiableMediaContentType, isMarkupMasquerade } from "./mediaTypes";
import { validateGlbStructure } from "./model3dValidation";
import { reapAbandonedUploadStaging, removeScratchAfterUse, UPLOAD_STAGING_PREFIX } from "./scratchCleanup";

const HEADER_BYTES = 4096;

export function isGeneratedAssetMeta(meta: JsonRecord): boolean {
  return String(meta.kind || "").toLowerCase() === "generated";
}

declare const verifiedStagedAsset: unique symbol;
/** 已通过校验、躺在本项目私有暂存里的生成产物。只有 prepareVerifiedGeneratedAsset 能产出；只有它能被发布。 */
export type VerifiedStagedAsset = Readonly<{
  [verifiedStagedAsset]: true;
  context: AssetWriteContext;
  stagingDir: string;
  stagedPath: string;
  fileName: string;
  declaredContentType: string;
  header: Buffer;
  meta: JsonRecord;
  contentHash: string;
  size: number;
}>;

export type GeneratedStagingSource =
  | Readonly<{ bytes: Uint8Array }>
  | Readonly<{ path: string; onCopyProgress?: AssetCopyProgress }>;

function generatedMediaKind(contentType: string): "image" | "video" | "audio" | "model3d" | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return contentType === "model/gltf-binary" ? "model3d" : null;
}

async function readHeader(filePath: string): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * Generated outputs are executable evidence, not ordinary user imports: fail closed before disk.
 * 判据与以前同步版完全一致（冒充网页 / 认不出字节 / 类型不符 / 格式不支持 / 认证证据不符 / GLB 结构 / 解码），
 * 只是读的是暂存文件：文件头决定类型，哈希按流算，GLB 才整份读入。
 */
async function verifyStagedGeneratedContent(meta: JsonRecord, declaredRaw: string, stagedPath: string, header: Buffer, size: number, contentHash: string): Promise<JsonRecord> {
  if (isMarkupMasquerade(header)) throw generatedMediaValidationError("markup_masquerade");
  const detected = header.byteLength >= 12 && header.subarray(0, 4).toString("ascii") === "glTF"
    ? "model/gltf-binary"
    : contentTypeFromMagicBytes(header);
  const normalizedDeclared = String(declaredRaw || "").toLowerCase().split(";", 1)[0].trim();
  const declared = !normalizedDeclared || normalizedDeclared === "application/octet-stream"
    ? detected || normalizedDeclared
    : normalizedDeclared;
  const expectedKind = generatedMediaKind(declared);
  if (!expectedKind) return meta;
  if (!detected) throw generatedMediaValidationError("unknown_bytes");
  const detectedKind = generatedMediaKind(detected);
  const ambiguousAudioContainer = expectedKind === "audio"
    && (declared === "audio/mp4" && detected === "video/mp4"
      || declared === "audio/webm" && detected === "video/webm");
  if (!detectedKind || (detectedKind !== expectedKind && !ambiguousAudioContainer)) {
    throw generatedMediaValidationError("kind_mismatch");
  }
  if (!isCertifiableMediaContentType(detected) && !ambiguousAudioContainer) {
    throw generatedMediaValidationError("unsupported_format");
  }
  const claimed = meta.certificationEvidence && typeof meta.certificationEvidence === "object"
    ? meta.certificationEvidence as Partial<CertificationMediaEvidence>
    : undefined;
  const cleanMeta = { ...meta };
  delete cleanMeta.certificationEvidence;
  if (claimed) {
    if (claimed.sha256 !== contentHash || claimed.byteLength !== size || claimed.kind !== expectedKind
      || claimed.contentType !== declared) throw generatedMediaValidationError("evidence_mismatch");
    // 认证证据只证明「字节没变」，GLB 的结构仍要过（以前由写入边界的 validateStructuredAsset 补这一道）。
    if (expectedKind === "model3d") validateGlbStructure(await fs.promises.readFile(stagedPath));
    return cleanMeta;
  }
  if (expectedKind === "model3d") {
    validateGlbStructure(await fs.promises.readFile(stagedPath));
    return cleanMeta;
  }
  // 「这份字节能不能解码」由 generatedMediaDecode 一处裁决（判据、超时、日志都在那里）；这里只问、不评。
  await verifyGeneratedMediaDecodes({ kind: expectedKind, stagedPath, byteLength: size, contentType: detected });
  return cleanMeta;
}

export async function prepareVerifiedGeneratedAsset(input: {
  projectId: string;
  source: GeneratedStagingSource;
  fileName: string;
  contentType: string;
  rawMeta: JsonRecord;
  context?: AssetWriteContext;
}): Promise<VerifiedStagedAsset> {
  // ① 钉字节必须在任何 await 之前：调用方之后改它自己的 Buffer，碰不到这份（V-1208-1）。
  const pinned = "bytes" in input.source ? Buffer.from(input.source.bytes) : undefined;
  const meta = sanitizeAssetMetaForKind(input.rawMeta);
  if (!isGeneratedAssetMeta(meta)) throw new Error("prepareVerifiedGeneratedAsset only stages generated outputs");
  const context = input.context ?? await captureAssetWriteContext(input.projectId);
  if (context.projectId !== input.projectId) throw Object.assign(new Error("project_binding_stale"), { code: "project_binding_stale" });
  context.assertCurrent();
  reapAbandonedUploadStaging(context.root);
  const stagingDir = await fs.promises.mkdtemp(path.join(context.root, UPLOAD_STAGING_PREFIX));
  const stagedPath = path.join(stagingDir, "content");
  try {
    // ② 大文件写盘都在这里、都是异步的；同步发布只剩 rename。
    if (pinned) await fs.promises.writeFile(stagedPath, pinned, { flag: "wx", mode: 0o600 });
    else if ("path" in input.source) await copyFileWithProgress(input.source.path, stagedPath, input.source.onCopyProgress);
    const [header, stat, contentHash] = await Promise.all([readHeader(stagedPath), fs.promises.stat(stagedPath), sha256OfFile(stagedPath)]);
    // ③ 在暂存文件上校验。
    const verifiedMeta = await verifyStagedGeneratedContent(meta, input.contentType, stagedPath, header, stat.size, contentHash);
    return Object.freeze({
      context, stagingDir, stagedPath, fileName: input.fileName, declaredContentType: input.contentType,
      header, meta: verifiedMeta, contentHash, size: stat.size,
    }) as VerifiedStagedAsset;
  } catch (error) {
    await removeScratchAfterUse(stagingDir);
    throw error;
  }
}
