// 通用参考键全集（单一真相源，渲染层和主进程共用）——**推导**出来，不手写（#1269 条件 2，2026-10-23）。
//
// 这些键可能躺在节点 meta 里（上传、旧工程、MCP canvas.write 的 metadata 原样透传），又会经 `...meta` → extras →
// taskTemplateParams 的 `...extras` 一路进请求体，或被主进程当参考翻译（referenceInputParams / firstReferenceImage /
// projectReferencesOntoBodyKeys / APIMart 引擎 B 的别名投影）。所以「当前方式没声明、界面没在用就不许发」这条规矩
// 必须对**整张表**生效：渲染层 buildReferenceExtras 先把整张表置 undefined、只填唯一推导出的在用值；主进程
// assertNoReferenceResidueBeforeSend 按整张表拒发。
//
// 以前是手写的 29 个键，漏了请求体直接读的 image_urls / first_frame_image / image_with_roles / video_list … 共 30 个
// （验收 V-b1a-r3 的夹带探针就从这里过去）——10-22 方向检查第 2 节预言过：按键过滤的黑名单，每多一个读口就多一个漏点。
// 现在由四处**声明**合成，加档案、加槽、加别名都自动进表：
//   ① TRANSLATED_REFERENCE_INPUT_KEYS：主进程把参考翻成请求体之前读的标准输入键（不是请求体键）；
//   ② 每个档案每个方式的参考槽 inputKey 与合并键 combineSlotsInto.key——按 M1 合同，请求体就是从这些键读参考；
//   ③ APIMART_REFERENCE_PARAMETER_ALIASES：APIMart 引擎 B 认的参考别名（capabilityCore/apimartGenerationProjection 从这里取）；
//   ④ 档案的 headlessReferenceKeys：请求体认、生成框没有控件的参考输入（KIE Gemini Omni 的 video_list…、fal 改图的 mask_url）；
//   ⑤ REFERENCE_PARKED_KEY：节点上「先放一边」的旧工程残留（不是请求输入，但装的是图）。
// 完整性门：referenceSentWithinInUse.property.test.ts「键表完整性」——内置目录每条请求体读的键都要能归类，
// 新请求体多读一个参考键而没进这张表，那里先红。
import { MODEL_ARCHETYPES } from "./index";

/** ① 主进程翻译读的标准参考输入键（referenceInputParams / firstReferenceImage / jsonImageEditInput / 旧的按槽存键与影子）。 */
export const TRANSLATED_REFERENCE_INPUT_KEYS: readonly string[] = [
  "image", "image_url", "imageUrl",
  "referenceImages", "referenceImageUrl", "referenceImageUrls", "referenceImageRef", "referenceImageRefs",
  "reference_images", "reference_image_urls",
  "firstFrameUrl", "firstFrameRef", "firstFrameReference", "first_frame_url",
  "lastFrameUrl", "lastFrameRef", "lastFrameReference", "last_frame_url",
  "referenceVideoUrls", "reference_video_urls", "sourceVideoUrl", "source_video_url", "video_url",
  "referenceAudioUrls", "reference_audio_urls",
  "styleReferenceImages", "characterReferenceImages", "compositionReferenceImages",
  "upstreamResultUrls",
];

/**
 * ⑤ 节点上存着图、但不是请求输入的键：「先放一边」的旧工程残留（src/workbench/generationCanvas/nodes/controls/referenceList.ts
 * 的 PARKED_KEY 就是它，#1269 条件 4）。它们照样是图——随 `...meta` 进了 extras 会被当成上传白名单（activeAssetUrls）托管出去，
 * 所以同样进表：渲染层清掉，主进程见到就拒。
 */
export const REFERENCE_PARKED_KEY = "referenceParkedUrls";

/** ③ APIMart 引擎 B 的参考别名：请求体键 → 它认的同义参数键（原在 capabilityCore/apimartGenerationProjection）。 */
export const APIMART_REFERENCE_PARAMETER_ALIASES = {
  image_urls: ["image_urls", "imageUrls", "input_urls", "inputUrls", "reference_image_urls", "referenceImageUrls"],
  image_with_roles: ["image_with_roles", "imageWithRoles"],
  video_urls: ["video_urls", "videoUrls", "reference_video_urls", "referenceVideoUrls"],
  audio_urls: ["audio_urls", "audioUrls", "reference_audio_urls", "referenceAudioUrls"],
  first_frame_image: ["first_frame_image", "firstFrameImage", "first_frame_url", "firstFrameUrl"],
  last_frame_image: ["last_frame_image", "lastFrameImage", "last_frame_url", "lastFrameUrl"],
} as const;

/** ② + ④ 档案声明出来的参考键：每个方式的槽 inputKey、合并键，和档案级的 headlessReferenceKeys。 */
function archetypeDeclaredReferenceKeys(): string[] {
  return MODEL_ARCHETYPES.flatMap((archetype) => [
    ...(archetype.headlessReferenceKeys ?? []),
    ...archetype.modes.flatMap((mode) => [
      ...mode.slots.flatMap((slot) => (slot.inputKey ? [slot.inputKey] : [])),
      ...(mode.combineSlotsInto ? [mode.combineSlotsInto.key] : []),
    ]),
  ]);
}

export const GENERIC_REFERENCE_KEYS: ReadonlySet<string> = new Set([
  ...TRANSLATED_REFERENCE_INPUT_KEYS,
  REFERENCE_PARKED_KEY,
  ...archetypeDeclaredReferenceKeys(),
  ...Object.values(APIMART_REFERENCE_PARAMETER_ALIASES).flat(),
]);
