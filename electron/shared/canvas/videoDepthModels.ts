/**
 * 深度视频节点 —— 本地模型权重清单（白名单，唯一 owner）。
 *
 * 用户拍板①：权重**不进安装包**，第一次用这个节点时才下载（约 50MB，带进度）。
 * 用户拍板②：深度只做 Depth Anything V2 **Small**（Apache-2.0）。Base 是 CC-BY-NC，
 * 商用授权不干净，一条都不列——不是「先不做」，是不进清单，避免有人顺手把它加回来。
 *
 * ── 每条为什么长这样 ────────────────────────────────────────────────────────────
 * · URL 钉在**不可变的版本**上：HuggingFace 用 commit sha（不是 `resolve/main`，
 *   分支会前进，会把 sha256 钉死变成「哪天突然全员下载失败」）；MediaPipe 用
 *   `float16/1/`（不是 `latest/`，同理）。两处都用**官方端点**，不用 hf-mirror
 *   之类第三方镜像——镜像换一个字节我们看不见。
 * · `sha256` 是**实下载一次算出来的**（2026-09-07，见下方每条注释），不是抄的。
 *   下载完不匹配 = 删文件 + 报错，**没有** "首下即信任" 的自举分支（R28：
 *   安全关键依赖不许用「登记」代替防线）。
 * · `sizeBytes` 是精确值不是约数：它同时是进度条分母和「响应体是不是被中间人换了」的第一道判据。
 */

export type VideoDepthModelRole = "depth" | "pose";

export type VideoDepthModelAsset = Readonly<{
  id: string;
  role: VideoDepthModelRole;
  /** 落在 userData/models/ 下的文件名（同时是 nomi-local://model/<fileName> 的白名单键）。 */
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  /** 许可证——列出来是为了让「能不能商用」这件事在代码里可查，不用回头翻文档。 */
  license: string;
  sourcePage: string;
}>;

export const VIDEO_DEPTH_MODEL_MANIFEST: readonly VideoDepthModelAsset[] = [
  {
    id: "depth_anything_v2_small_fp16",
    role: "depth",
    fileName: "depth-anything-v2-small-fp16.onnx",
    // commit 4472b7362082ad9968fee890ca0f1e5aca36b93d（2026-09-07 实查）——钉 commit 不钉 main。
    downloadUrl:
      "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_fp16.onnx",
    sizeBytes: 49_642_442,
    // 2026-09-07 从上面这条官方 URL 实下载后 `shasum -a 256` 得到；
    // 与 HF 自己回的 x-linked-etag 逐字节相同（两个独立来源对上）。
    sha256: "2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04",
    license: "Apache-2.0",
    sourcePage: "https://huggingface.co/onnx-community/depth-anything-v2-small",
  },
  {
    id: "mediapipe_pose_landmarker_full",
    role: "pose",
    fileName: "pose-landmarker-full-float16.task",
    // `/1/` 是不可变版本目录（`latest/` 会跟着上游走）。
    downloadUrl:
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    sizeBytes: 9_398_198,
    // 2026-09-07 实下载后 `shasum -a 256`。
    sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
    license: "Apache-2.0",
    sourcePage: "https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker",
  },
];

export function videoDepthModelById(id: string): VideoDepthModelAsset | undefined {
  return VIDEO_DEPTH_MODEL_MANIFEST.find((asset) => asset.id === id);
}

export function videoDepthModelByFileName(fileName: string): VideoDepthModelAsset | undefined {
  return VIDEO_DEPTH_MODEL_MANIFEST.find((asset) => asset.fileName === fileName);
}

export function videoDepthModelForRole(role: VideoDepthModelRole): VideoDepthModelAsset {
  const asset = VIDEO_DEPTH_MODEL_MANIFEST.find((entry) => entry.role === role);
  // 清单是编译期常量，两个角色都必然存在；缺了是构建被改坏，早崩比静默降级好。
  if (!asset) throw new Error(`video depth model manifest is missing role: ${role}`);
  return asset;
}

/**
 * 某次运行真正需要下载哪些权重。
 * 纯深度模式**不碰** pose——不下载、不加载、不提示，用户为骨架付的钱是零。
 */
export function videoDepthRequiredAssets(needDepth: boolean, needPose: boolean): readonly VideoDepthModelAsset[] {
  const assets: VideoDepthModelAsset[] = [];
  if (needDepth) assets.push(videoDepthModelForRole("depth"));
  if (needPose) assets.push(videoDepthModelForRole("pose"));
  return assets;
}

/** 清单里所有下载源的 origin——`check:outbound-policy` 与出站分类共用的白名单。 */
export function videoDepthModelOrigins(): readonly string[] {
  return [...new Set(VIDEO_DEPTH_MODEL_MANIFEST.map((asset) => new URL(asset.downloadUrl).origin))];
}
