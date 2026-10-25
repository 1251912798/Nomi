// 参考的协议造型（主进程派生载体的唯一造型处）：taskTemplateParams 把标准参考输入 reference_images 交给这里，
// 造成供应商协议要的形状——chat/completions content 的 image_url 项、JSON image-edits 的 image / images。
// 造出来的键（chat_image_parts / json_edit_image / json_edit_images）在 shared/modelArchetypes/referenceKeys.ts 的
// ⑥ DERIVED_REFERENCE_CARRIER_KEYS 登记：承载力、拒发、普查都认它们是图片参考位，headless 投影不往里填。

/** 参考图 URL 数组 → chat/completions content 的 image_url 项数组。非字符串/空 URL 剔除。 */
export function chatImageParts(referenceImages: unknown): Array<{ type: "image_url"; image_url: { url: string } }> {
  if (!Array.isArray(referenceImages)) return [];
  return referenceImages
    .filter((u): u is string => typeof u === "string" && u.trim() !== "")
    .map((url) => ({ type: "image_url", image_url: { url } }));
}

export type JsonImageEditReference = { type: "image_url"; url: string };

/** JSON image-edits 输入造型：1 张走 image，2~3 张走 images；保序、去空、按官方上限截断。 */
export function jsonImageEditInput(referenceImages: unknown): { image?: JsonImageEditReference; images?: JsonImageEditReference[] } {
  if (!Array.isArray(referenceImages)) return {};
  const refs = referenceImages
    .filter((url): url is string => typeof url === "string" && url.trim() !== "")
    .slice(0, 3)
    .map((url) => ({ type: "image_url" as const, url }));
  if (refs.length === 1) return { image: refs[0] };
  return refs.length > 1 ? { images: refs } : {};
}
