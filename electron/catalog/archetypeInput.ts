// 内置档案的**参考输入构建**（评审 M5：input-builder 放 electron/catalog，不喂大 runtime.ts）。
//
// 把 TaskRequest.extras 里的参考字段（camelCase，渲染层投影出来的当前模式键）翻译成**通用 snake
// 参数键**——单图首/尾帧 + 多参考数组（image/video/audio）。这些是供应商无关的中间键；各供应商
// mapping body 再把它们映射到自己真正的 input 键（如 kie 的 `reference_video_urls ` 含尾随空格，
// §2 坑1，只在 kieSeedance body 写一次 = M1 单源）。
//
// **M2 互斥**：camelCase 只投影非空值；显式 snake 槽值原样保留（null 表示该槽空着）。
// 当前方式没声明的参考键不许进 body，两道守：
//   ① 渲染层 catalogTaskActions.buildReferenceExtras 对有档案的模型，把 GENERIC_REFERENCE_KEYS 里当前方式没声明的键显式置 undefined；
//   ② 主进程 runTask 入口先过 stripReferenceResidue（下面），不信①——带档案投影的请求，通用参考键里凡是
//      不在 archetypeInput 里的地址一律剥掉（开发态在终端记一条诊断）。
// 两道都由 referenceSentWithinInUse.property.test.ts 钉住（全部档案 × 每个方式，中转 / APIMart 真请求体）。
import { firstString, isJsonRecord, type JsonRecord } from "../jsonUtils";
import { readParameterReferenceSlotsContract, readSelectedComfyReferenceContract, type ParameterReferenceSelection } from "./parameterReferenceContract";
import { GENERIC_REFERENCE_KEYS } from "../shared/contracts/referenceKeys";

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function collectStrings(value: unknown, into: Set<string>): Set<string> {
  if (typeof value === "string") {
    if (value.trim()) into.add(value.trim());
  } else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, into));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, into));
  return into;
}

/**
 * 主进程这道守（契约②，见文件头）：带档案投影（`extras.archetypeInput`）的请求，渲染层已按**当前方式**把每个
 * 声明槽的值打进 archetypeInput；通用参考键里凡是不在它里面的地址，就是别的方式 / 旧工程 / MCP metadata 留下的
 * 残留——界面上没在用，发出去就是花错钱。这里把它们剥掉：字符串整键删，数组只留在用的那几张。
 *
 * 不带档案投影的请求（无档案模型、ComfyUI 参数契约、headless 调用方显式给的参考）不动：那里没有「当前方式」可比。
 * 显式参数参考槽（参数契约声明的键）也不动：它们的值本来就不进 archetypeInput。
 *
 * 热修期只剥不拒：剥了什么交给 `report`（runtime 记开发态诊断），不把今天能出片的流程打挂。
 */
export function stripReferenceResidue(extras: JsonRecord, report?: (stripped: string[]) => void): JsonRecord {
  if (!isJsonRecord(extras.archetypeInput)) return extras;
  const inUse = collectStrings(extras.archetypeInput, new Set());
  const declaredParameterKeys = new Set(readParameterReferenceSlotsContract(extras).map((slot) => slot.key));
  const stripped: string[] = [];
  for (const key of GENERIC_REFERENCE_KEYS) {
    if (declaredParameterKeys.has(key) || !Object.prototype.hasOwnProperty.call(extras, key)) continue;
    const value = extras[key];
    if (typeof value === "string") {
      if (value.trim() && !inUse.has(value.trim())) {
        delete extras[key];
        stripped.push(key);
      }
    } else if (Array.isArray(value)) {
      const kept = value.filter((item) => typeof item !== "string" || !item.trim() || inUse.has(item.trim()));
      if (kept.length === value.length) continue;
      if (kept.length) extras[key] = kept;
      else delete extras[key];
      stripped.push(key);
    }
  }
  if (stripped.length) report?.(stripped);
  return extras;
}

/**
 * 从 extras 构建参考相关的 snake 参数：聚合兜底 < 显式槽值 < 档案投影。
 *
 * 认得档案的模型：renderer 已据当前模式把完整 snake input 打好放进 `extras.archetypeInput`
 * （含 per-mode enum + 互斥投影，见 archetypeMeta.buildArchetypeInputParams）——这里**原样采用**，
 * 是单一来源。非档案模型：从 camelCase extras 现场映射（兼容既有 onboarding 模型，不破坏）。
 */
export function referenceInputParams(extras: JsonRecord, selected?: ParameterReferenceSelection): JsonRecord {
  const out: JsonRecord = {};
  const firstFrame = firstString(extras.firstFrameUrl);
  const lastFrame = firstString(extras.lastFrameUrl);
  if (firstFrame) out.first_frame_url = firstFrame;
  if (lastFrame) out.last_frame_url = lastFrame;

  const imageUrls = stringArray(extras.referenceImageUrls);
  const videoUrls = stringArray(extras.referenceVideoUrls);
  const audioUrls = stringArray(extras.referenceAudioUrls);
  if (imageUrls.length) out.reference_image_urls = imageUrls;
  if (videoUrls.length) {
    out.reference_video_urls = videoUrls;
    // 单源视频的标准键（与 first_frame_url 同构）：「视频进视频出」的工作流（补帧/视频超分/
    // 视频去背景）只吃一条源视频，模板引用它比引用数组第 0 项直白得多。
    out.source_video_url = videoUrls[0];
  }
  if (audioUrls.length) out.reference_audio_urls = audioUrls;

  out.reference_images = Array.isArray(extras.referenceImages) ? extras.referenceImages : [];
  // 已按声明槽分配的值不能被数组顺序覆盖；显式 null 也不能借用另一槽的素材。
  // image_url 同样在此叠加，覆盖 taskTemplateParams 的单图聚合兜底。
  const exactComfy = Boolean(readSelectedComfyReferenceContract(extras, selected));
  for (const key of ["image_url", "first_frame_url", "last_frame_url", "source_video_url", "reference_images", "reference_image_urls", "reference_video_urls", "reference_audio_urls"]) {
    const value = extras[key];
    const nonEmpty = (typeof value === "string" && Boolean(value.trim()))
      || (Array.isArray(value) && value.length > 0)
      || (value !== null && typeof value === "object" && Object.keys(value as object).length > 0);
    const exactEmpty = exactComfy && (value === null || (Array.isArray(value) && value.length === 0));
    // Non-empty explicit snake values remain valid for every vendor. Empty/null slot authority belongs only to
    // the selected Comfy contract, so a default [] cannot erase a populated legacy aggregate.
    if (Object.prototype.hasOwnProperty.call(extras, key) && (nonEmpty || exactEmpty)) out[key] = value;
  }
  // 档案投影**叠加**在标准键之上（同名键档案权威）——绝不替代整包。旧实现 archetypeInput 独占返回，
  // 标准键（reference_images/chat_image_parts 的原料/first_frame_url）被吞 → 通用中转模板拿不到参考：
  // multipart 改图空图被拒、chat 多模态丢图、i2v 首帧到不了 wire（2026-07-24 群反馈根因）。
  // 内置家零影响：它们的 body 只引用各自声明的键（input_urls/volcengine_* …），多出的标准键不进 body。
  if (isJsonRecord(extras.archetypeInput)) {
    Object.assign(out, extras.archetypeInput);
  }
  return out;
}
