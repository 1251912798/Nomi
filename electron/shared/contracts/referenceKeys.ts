// 通用参考键全集（单一真相源，纯数据，渲染层和主进程共用）。
//
// 这些键可能躺在节点 meta 里（上传、旧工程、MCP canvas.write 的 metadata 原样透传），又会被主进程当参考读：
// referenceInputParams 把 camel 键翻成 snake 键、firstReferenceImage 拿它们兜 image_url、
// projectReferencesOntoBodyKeys 把它们投到 body 的图片位。所以「当前方式没声明就不许发」这条规矩
// 必须对**整张表**生效，不能只管其中几个——2026-10-22 线上错花钱（文生被当图生发、首尾帧多带残留参考）
// 就是只清了首 / 尾帧两个键、其余照 `...meta` 原样带出去。
//
// 加新的参考键（新的别名、新的媒体种类）只改这里；渲染层 buildReferenceExtras 和主进程
// stripReferenceResidue 自动一起覆盖。
export const GENERIC_REFERENCE_KEYS: ReadonlySet<string> = new Set([
  "image", "image_url", "imageUrl",
  "referenceImages", "referenceImageUrl", "referenceImageUrls", "referenceImageRef", "referenceImageRefs",
  "reference_images", "reference_image_urls",
  "firstFrameUrl", "firstFrameRef", "firstFrameReference", "first_frame_url",
  "lastFrameUrl", "lastFrameRef", "lastFrameReference", "last_frame_url",
  "referenceVideoUrls", "reference_video_urls", "sourceVideoUrl", "source_video_url", "video_url",
  "referenceAudioUrls", "reference_audio_urls",
  "styleReferenceImages", "characterReferenceImages", "compositionReferenceImages",
  "upstreamResultUrls",
]);
