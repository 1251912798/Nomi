// 生成产物落盘前的内容校验，和「校验过的就是要发布的」那份字节（从 projectAssetStore 拆出，2026-10-16）。
//
// 解码校验是异步的（主进程不能同步等 ffmpeg），等待期间调用方可以改写它的 Buffer、外部进程可以改写源文件
// （独立验收 V-1208-1）。所以这里把「要发布的字节」做成一个品牌类型：只有本模块的两个函数能产出它，
// 校验只收它，落盘也只写它——忘了钉住就校验 / 落盘，在类型上写不出来。
import crypto from "node:crypto";
import fs from "node:fs";
import type { JsonRecord } from "../jsonUtils";
import type { CertificationMediaEvidence } from "../providerAdapter/certificationMedia";
import { generatedMediaValidationError, verifyGeneratedMediaDecodes } from "./generatedMediaDecode";
import { contentTypeFromMagicBytes, isCertifiableMediaContentType, isMarkupMasquerade } from "./mediaTypes";
import { validateGlbStructure } from "./model3dValidation";

function generatedMediaKind(contentType: string): "image" | "video" | "audio" | "model3d" | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return contentType === "model/gltf-binary" ? "model3d" : null;
}

declare const pinnedAssetBytes: unique symbol;
/**
 * 写入边界**自己持有**的那一份字节：校验、嗅类型、哈希、发布都只吃它（独立验收 V-1208-1）。
 * 校验是异步的，等解码器的那段时间里调用方可以改写它传进来的 Buffer、外部进程可以改写源文件；
 * 只有边界自己的、别人拿不到引用的一份，才能保证「校验过的就是发布出去的」。只有下面两个函数能产出它。
 */
export type PinnedAssetBytes = Buffer & { readonly [pinnedAssetBytes]: true };

/** 进门就拷一份（同步、在任何 await 之前）：调用方之后怎么改自己的 Buffer 都碰不到这里。 */
export function pinAssetBytes(bytes: Uint8Array): PinnedAssetBytes {
  return Buffer.from(bytes) as PinnedAssetBytes;
}

/** 路径型入口：读出来的 Buffer 是新分配的、只有这里有引用；之后发布写的是它，不再回头读源文件。 */
export async function readPinnedAssetFile(sourcePath: string): Promise<PinnedAssetBytes> {
  return await fs.promises.readFile(sourcePath) as PinnedAssetBytes;
}

/**
 * Generated outputs are executable evidence, not ordinary user imports: fail closed before disk.
 * 异步：解码校验在异步子进程里跑，主进程等它的时候照常处理事件。调用方必须先 await 它、通过了才进落盘临界区；
 * 只收 PinnedAssetBytes——解码器校验的是这份字节自己的私有副本，不读任何调用方还能改的路径。
 */
export async function validatedGeneratedMeta(meta: JsonRecord, declaredRaw: string, bytes: PinnedAssetBytes): Promise<JsonRecord> {
  if (String(meta.kind || "").toLowerCase() !== "generated") return meta;
  if (isMarkupMasquerade(bytes)) {
    throw generatedMediaValidationError("markup_masquerade");
  }
  const detected = bytes.byteLength >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "glTF"
    ? "model/gltf-binary"
    : contentTypeFromMagicBytes(bytes);
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
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (claimed.sha256 !== digest || claimed.byteLength !== bytes.byteLength || claimed.kind !== expectedKind
      || claimed.contentType !== declared) throw generatedMediaValidationError("evidence_mismatch");
    return cleanMeta;
  }
  if (expectedKind === "model3d") {
    validateGlbStructure(bytes);
    return cleanMeta;
  }
  // 「这份字节能不能解码」由 generatedMediaDecode 一处裁决（判据、超时、日志都在那里）；这里只问、不评。
  await verifyGeneratedMediaDecodes({ kind: expectedKind, bytes, contentType: detected });
  return cleanMeta;
}
