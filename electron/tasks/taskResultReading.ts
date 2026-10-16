// 异步任务「这次成没成、结果在哪」的**唯一读法**（#1213 收口）。
//
// 两台引擎都调它：引擎 A（画布 / 单镜 Run 走的 runtime.buildProfileTaskResult）、引擎 B（制作 Run / Agent
// 走的目录执行器 queryTask / materialize）。以前各读各的：A 用 response_mapping + 一份 12 条路径的兜底并集，
// B 完全不看 mapping、只认 data.result.{images,videos,audios}。同一份上游响应，两边取出的东西不一样。
//
// 读法的合同：
//   1. **先按通道声明的合同**（mapping.response_mapping 的 assets / image_url / video_url / audio_url / model_url）。
//   2. 合同读不到 → **通用规则**：在响应里按「结果字段名」找地址（result_url / video_url / url / output / fileUrl …，
//      含 content.* / data.* / output.* / results[*] / videos[*] 等嵌套，以及被当字符串二次嵌套的 JSON），
//      只收 http(s) / data: / nomi-local: 地址，**按期望的媒体类型核扩展名**，**排除本次请求回显的参考地址**，
//      并排除缩略图 / 封面 / 尾帧 / 参考这类字段。只取排名最高的那一处（同一张列表里的兄弟一起），并说出用的是哪条规则。
//   3. 状态由共享词表判（resolveTaskStatus → shared/taskStatusVocabulary），产物作硬证据参与判定。
// 下载那一步还会按 content-type / 字节再核一次（assets/generatedMediaDecode），这里只做便宜的第一道。
import type { JsonRecord } from "../jsonUtils";
import { isJsonRecord } from "../jsonUtils";
import { collectAssetUrls, maybeParseJsonString, resolveTaskStatus, valuesFromMapping, type TaskStatus } from "./responseParsing";
import { extractAssetUrl } from "./assetUrlExtract";

export type ExpectedMediaKind = "image" | "video" | "audio" | "model3d";

/** 用了哪条规则取到地址：`contract` = 通道声明的位置；`generic:<路径>` = 通用规则在那个位置找到；`none` = 没取到。 */
export type ResultReadRule = "contract" | `generic:${string}` | "none";

export type TaskResponseReading = {
  status: TaskStatus;
  /** 上游给了、但谁都认不得的原始动词（空 = 认得或没给）。 */
  unrecognizedStatus: string;
  assetUrls: string[];
  rule: ResultReadRule;
};

/** 任务种类 → 期望的产物媒体类型（文本等没有媒体产物的种类 → null，不按类型过滤）。 */
export function expectedMediaKind(kind: string | null | undefined): ExpectedMediaKind | null {
  return kind === "image" || kind === "video" || kind === "audio" || kind === "model3d" ? kind : null;
}

const CONTRACT_ASSET_KEYS = ["assets", "image_url", "video_url", "audio_url", "model_url"] as const;

const EXTENSIONS: Record<ExpectedMediaKind, readonly string[]> = {
  video: ["mp4", "mov", "webm", "m4v", "mkv", "avi", "m3u8"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"],
  model3d: ["glb", "gltf", "obj", "fbx", "usdz", "stl", "ply"],
};
const ALL_KNOWN_EXTENSIONS = new Set(Object.values(EXTENSIONS).flat());

/** 「这是结果」的字段名，按可信度排（越靠前越像结果）。 */
const RESULT_KEY_RANK = [
  "result_url", "resulturl", "resulturls", "video_url", "videourl", "image_url", "imageurl", "audio_url", "audiourl",
  "model_url", "file_url", "fileurl", "output_url", "outputurl", "download_url", "downloadurl", "url", "uri", "output", "outputs",
  "result", "results", "fail_reason",
] as const;
/** 明显不是本次产物的字段：缩略图 / 封面 / 尾帧 / 头像 / 参考 / 输入 / 回调。 */
const EXCLUDED_KEY = /thumb|poster|cover|preview|avatar|icon|logo|last_frame|first_frame|frame_url|reference|ref_|input|prompt|callback|webhook|mask|source|origin/i;
const MAX_DEPTH = 7;

function isAssetUrl(value: string): boolean {
  return /^(https?:\/\/|data:|nomi-local:\/\/)/i.test(value.trim());
}

/** 地址的媒体类型证据：data: 看 mime；http 看路径扩展名；看不出 → null（不拒，交给下载那一步核）。 */
export function mediaKindOf(url: string): ExpectedMediaKind | null {
  const text = url.trim();
  const dataMime = /^data:([a-z]+)\//i.exec(text)?.[1]?.toLowerCase();
  if (dataMime) return dataMime === "image" || dataMime === "video" || dataMime === "audio" ? dataMime : dataMime === "model" ? "model3d" : null;
  const pathname = (() => {
    try {
      return new URL(text).pathname;
    } catch {
      return "";
    }
  })();
  const ext = /\.([a-z0-9]{2,5})$/i.exec(pathname)?.[1]?.toLowerCase();
  if (!ext || !ALL_KNOWN_EXTENSIONS.has(ext)) return null;
  return (Object.keys(EXTENSIONS) as ExpectedMediaKind[]).find((kind) => EXTENSIONS[kind].includes(ext)) ?? null;
}

type Candidate = { url: string; path: string; rank: number; typed: boolean };

function keyRank(key: string): number {
  const normalized = key.toLowerCase().replace(/\[\*\]$/, "");
  const index = (RESULT_KEY_RANK as readonly string[]).indexOf(normalized);
  return index >= 0 ? index : RESULT_KEY_RANK.length;
}

/** 深度扫响应里的地址，记下路径与它所在字段的可信度。数组里的字符串归属最近的字段名。 */
function scanCandidates(value: unknown, path: string, key: string, depth: number, out: Candidate[], excluded: boolean): void {
  if (depth > MAX_DEPTH) return;
  const node = maybeParseJsonString(value);
  if (typeof node === "string") {
    if (!excluded && isAssetUrl(node)) out.push({ url: node.trim(), path, rank: keyRank(key), typed: false });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => scanCandidates(item, `${path}.${index}`, key, depth + 1, out, excluded));
    return;
  }
  if (!isJsonRecord(node)) return;
  for (const [childKey, child] of Object.entries(node)) {
    // 子对象自己没有结果字段名时（如 videos[0] = {url}），沿用父字段的名字定可信度。
    const effectiveKey = keyRank(childKey) < RESULT_KEY_RANK.length ? childKey : key;
    scanCandidates(child, path ? `${path}.${childKey}` : childKey, effectiveKey, depth + 1, out, excluded || EXCLUDED_KEY.test(childKey));
  }
}

/**
 * 通用规则：合同读不到时，在响应里找**一个**最像本次产物的地址。
 * 期望类型对不上的（扩展名是图却要视频）不要；回显的参考地址不要；排除字段下的不要。
 */
export function findResultUrlByGenericRule(
  response: unknown,
  wantedKind: ExpectedMediaKind | null,
  echoUrls: ReadonlySet<string> = new Set(),
): { urls: string[]; path: string } | null {
  // 已知形状先认：同步接口的 b64_json（转 data: 地址）、chat/completions 里内联的图（markdown / 多模态数组）
  // 这些不是「字段里的地址」，深扫看不见；extractAssetUrl 是它们的唯一解码处。
  const known = extractAssetUrl(response);
  if (known && !echoUrls.has(known.trim())) {
    const kind = mediaKindOf(known);
    if (!(kind && wantedKind && kind !== wantedKind)) return { urls: [known.trim()], path: "known-shape" };
  }
  const found: Candidate[] = [];
  scanCandidates(response, "", "", 0, found, false);
  const usable = found
    .filter((candidate) => !echoUrls.has(candidate.url))
    .map((candidate) => {
      const kind = mediaKindOf(candidate.url);
      return { ...candidate, typed: Boolean(kind && wantedKind && kind === wantedKind), mismatch: Boolean(kind && wantedKind && kind !== wantedKind) };
    })
    .filter((candidate) => !candidate.mismatch && candidate.rank < RESULT_KEY_RANK.length);
  if (!usable.length) return null;
  // 先看字段名可信度，再看扩展名是否对上期望类型（对上的优先），最后保持出现顺序。
  usable.sort((a, b) => a.rank - b.rank || Number(b.typed) - Number(a.typed));
  // 同一张列表里的兄弟（videos.0.url / videos.1.url）是同一批产物，一起取；别处的地址不搭车。
  const listPattern = (path: string) => path.replace(/\.\d+(?=\.|$)/g, ".*");
  const best = usable[0];
  const pattern = listPattern(best.path);
  const urls = Array.from(new Set(usable.filter((candidate) => candidate.rank === best.rank && listPattern(candidate.path) === pattern).map((candidate) => candidate.url)));
  return { urls, path: pattern };
}

/** 本次请求里出现过的地址（参考图 / 首帧 / 参考视频……）：上游常把它们原样回显，绝不能当产物。 */
export function requestEchoUrls(extras: unknown): Set<string> {
  const urls = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (depth > MAX_DEPTH) return;
    if (typeof value === "string") {
      if (isAssetUrl(value)) urls.add(value.trim());
      return;
    }
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    if (isJsonRecord(value)) for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(extras, 0);
  return urls;
}

/** 读一份异步任务响应：状态 + 结果地址 + 用了哪条规则。两台引擎的唯一读法。 */
export function readTaskResponse(input: {
  response: unknown;
  responseMapping: JsonRecord | null;
  statusMapping: Record<string, string[]> | undefined;
  wantedKind: ExpectedMediaKind | null;
  echoUrls?: ReadonlySet<string>;
}): TaskResponseReading {
  const contractUrls = Array.from(new Set(
    CONTRACT_ASSET_KEYS.flatMap((key) => valuesFromMapping(input.response, input.responseMapping, key)).flatMap(collectAssetUrls),
  ));
  if (contractUrls.length > 0) {
    const resolved = resolveTaskStatus(input.response, input.responseMapping, input.statusMapping, contractUrls);
    return { ...resolved, assetUrls: contractUrls, rule: "contract" };
  }
  const generic = findResultUrlByGenericRule(input.response, input.wantedKind, input.echoUrls);
  const assetUrls = generic ? generic.urls : [];
  const resolved = resolveTaskStatus(input.response, input.responseMapping, input.statusMapping, assetUrls);
  // 通用规则找到的地址只在上游说成功（或动词认不出、靠这份产物作证据）时才算数：
  // 「进行中」的响应里出现的地址多半是占位 / 预览，不能拿去落盘。
  if (generic && resolved.status === "succeeded") return { ...resolved, assetUrls, rule: `generic:${generic.path}` };
  return { ...resolved, assetUrls: [], rule: "none" };
}
