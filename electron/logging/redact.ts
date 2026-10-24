// 日志脱敏 —— **第二道网**。
//
// 第一道网是 `logger.ts` 的 API 形状：提示词、密钥、素材路径压根没有能通过的参数位
// （R28：防线建在最早能拦住的那层）。但「没有参数位」拦不住有人把它们拼进 `event` 串、
// 或塞进一个名字无害的字段里，所以每一个进日志的字符串都还要过这里。
//
// 两层判据：
//   ① **字段名**黑名单 —— 名字就说明了里面装的是什么（prompt / apiKey / path / url…），
//      整段替换成 `<omitted:字段名>`。日志里保留字段名本身是有意的：排查时"这里有个被略掉的
//      提示词"和"这里什么都没有"是两件事。
//   ② **值形状** —— 绝对路径、URL 的 path/query（签名 URL 的凭据全在 query 里）、
//      密钥形串、data: URI、超长值。
//
// 刻意不做的事：**不试图用正则识别"这是不是一段提示词"**。提示词没有可匹配的特征，
// 靠内容检测去拦它只会给出一种「已经防住了」的错觉。真正防住它的是 ①，以及值长度上限。
import { diskSafeErrorFacts } from "./diskSafeFailure";

const MAX_VALUE_CHARS = 200;
const MAX_LINE_CHARS = 2000;

/**
 * 字段名归一：去掉分隔符、转小写。`api_key` / `apiKey` / `API-KEY` 是同一个东西，
 * 黑名单不该被写法绕过。
 */
function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** 整名命中就整段略掉。这些字段名意味着里面装的是创作内容、凭据或本机路径。 */
const DENIED_FIELD_NAMES = new Set([
  "prompt", "prompts", "systemprompt", "negativeprompt", "userinput", "input", "output",
  "text", "content", "body", "payload", "caption", "description", "title", "name", "label",
  "key", "apikey", "token", "secret", "password", "auth", "authorization", "cookie", "credential",
  "path", "filepath", "file", "filename", "dir", "directory", "url", "uri", "src", "href",
  "asset", "assetpath", "asseturl", "projectname", "projectpath",
]);

/** 名字里含这些词根的一律略掉（`vendorApiKey` / `xUserPrompt` / `refreshToken` 这类拼法）。 */
const DENIED_FIELD_STEMS = [
  "prompt", "apikey", "accesskey", "secretkey", "password", "token", "secret",
  "credential", "authorization", "cookie", "passphrase",
];

export function isDeniedFieldName(key: string): boolean {
  const normalized = normalizeKey(key);
  if (DENIED_FIELD_NAMES.has(normalized)) return true;
  return DENIED_FIELD_STEMS.some((stem) => normalized.includes(stem));
}

/**
 * 值级脱敏。顺序有意义：先认整体形状（data: URI / URL），再认路径，最后认密钥形串——
 * 反过来做的话，`https://host/a/b` 会先被当成路径吃掉一半，剩下的 host 也就没了。
 */
export function redactLogValue(input: string): string {
  let value = input;

  // data: / blob: —— 整条就是内容本身，一个字都不留。
  value = value.replace(/\b(?:data|blob):[^\s"']+/gi, "<blob>");

  // http(s) —— 留 scheme+host（"打的是哪家"是排查必需），砍掉 path 与 query。
  // 签名素材 URL 的凭据全在 query 里，而 path 里常常带项目/素材名。
  value = value.replace(
    /\b(https?):\/\/([^\s/"']+)(\/[^\s"']*)?/gi,
    (_match, scheme: string, host: string, rest: string | undefined) =>
      rest ? `${scheme}://${host}/<path>` : `${scheme}://${host}`,
  );

  // 本机路径的三种写法：file:// / nomi-local:// / 裸绝对路径 / Windows 盘符路径。
  value = value.replace(/\bfile:\/\/[^\s"']+/gi, "<path>");
  value = value.replace(/\bnomi-local:\/\/[^\s"']+/gi, "<path>");
  // 路径里**带空格**的那一族要先整段认掉，再走下面按空格断开的规则——否则只抹得掉空格前半段，
  // 剩下的正好是项目名：默认项目根叫 `Nomi Projects`，`…/Nomi Projects/猫咪短片/…` 会漏成
  // `<path> Projects/猫咪短片/…`（2026-09-24 实测；项目名在字段黑名单里本来就是要略掉的东西）。
  //   ① 引号里的绝对路径：Node 的 fs 错误一律是 `open '<路径>'`，引号就是边界，里面有空格也整段抹；
  value = value.replace(/(['"])((?:[A-Za-z]:[\\/]|\/)[^'"\n]*)\1/g, "$1<path>$1");
  //   ② Windows 盘符路径：以反斜杠/斜杠分段，段内允许空格（段内不可能出现 `:`，据此收住右边界）；
  //      前面不许紧跟字母，免得把 `https://` 的 `s:/` 当盘符。
  value = value.replace(/(?<![A-Za-z])[A-Za-z]:[\\/](?![\\/])(?:[^\\/\n"'<>|?*:]*[\\/])*[^\s"'()\\/<>|?*:]*/g, "<path>");
  //   ③ 用户内容常住的 POSIX 根下（/Users、/home…）：同样按段认，段内允许空格。
  //      只对这些根放开空格，`GET /v1/videos 502` 这类接口路径仍走下面按空格断开的老规则，不会连带吃掉后文。
  value = value.replace(
    /(^|[\s"'(=[])\/(?:Users|home|Volumes|private|tmp|var|Applications|opt|mnt|media|root|srv|data)\/(?:[^/\n"'():\]]*\/)*[^\s"'():\]/]*/g,
    (_match, lead: string) => `${lead}<path>`,
  );
  // 裸绝对路径：至少两段（`/a/b`），且前面不是别的路径分隔或冒号，避免把
  // 已经处理过的 `<path>` 或 `2026/09/06` 这类东西再切一刀。
  value = value.replace(/(^|[\s"'(=[])(\/[^\s"'):\]]*\/[^\s"'):\]]*)/g, (_match, lead: string) => `${lead}<path>`);

  // 密钥形串：常见前缀 + Bearer + 够长的连续无分隔串（base64/hex 形）。
  value = value.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "<redacted>");
  // 刻意不含 api / key 两个前缀：它们信号最弱，却正好吃掉 `api-key-decrypt-failed`
  // 这类合法事件名——把日志抹成 <redacted> 比漏抹更糟（证据没了，还看不出是被抹的）。
  // 真正带 api key 的**字段**由字段名黑名单挡住，长 token 由下面的 base64 规则兜底。
  value = value.replace(/\b(?:sk|pk|rk|ghp|gho|xox[abps])[-_][A-Za-z0-9._-]{8,}/gi, "<redacted>");
  value = value.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, "<redacted>");
  value = value.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, "<redacted>");

  // 控制字符会把一行日志撑成好几行，破坏「一行一条」这件事。
  value = value.replace(/\p{Cc}/gu, " ").trim();

  if (value.length > MAX_VALUE_CHARS) {
    return `${value.slice(0, MAX_VALUE_CHARS)}…(+${value.length - MAX_VALUE_CHARS})`;
  }
  return value;
}

/** 一个字段的最终形态：先看名字，再看值。 */
export function redactField(key: string, value: unknown): string {
  if (isDeniedFieldName(key)) return `<omitted:${normalizeKey(key)}>`;
  if (value === null || value === undefined) return "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return redactLogValue(String(value));
}

/**
 * 错误对象 → 一行**能落盘**的文本（日志文件与崩溃日志两扇门共用）。
 *
 * 只写结构事实，**不写错误原文**（G-redact-owner，方向检查 docs/audit/2026-10-22-redact-owner-direction.md）：
 * 原文可能是上游原话，连同它回显的凭据——任何一层都可能把它拼进 message，有的连 cause 都不留，
 * 到这里已认不出来源；日志又会随诊断包 / 反馈包出机。所以这里写的是：
 *   · 类名、错误码；
 *   · 我们自己的码形 message 原样，其余只给 `msg#<8 位指纹>`（同一句话同一个指纹，重复失败照样能归并）；
 *   · cause 链上供应商失败的类别 / 状态码 / 上游自己的码；
 *   · 栈帧（逐帧剥路径——帧里有价值的是文件名与行号，不是装在谁的硬盘哪个目录下）。
 * 原文要看：开发态终端（`describeErrorForDevTerminal` → `logger.logDevDetail`，打包版是空操作）。
 */
export function redactError(error: unknown): string {
  const facts = diskSafeErrorFacts(error);
  const parts = [facts.message ? `${facts.name} ${facts.message}` : facts.name];
  if (facts.code !== undefined) parts.push(`code=${facts.code}`);
  if (facts.errno !== undefined) parts.push(`errno=${facts.errno}`);
  if (facts.exitCode !== undefined) parts.push(`exitCode=${facts.exitCode}`);
  if (facts.signal) parts.push(`signal=${facts.signal}`);
  if (facts.vendor) {
    const vendor = facts.vendor;
    parts.push(`vendor=${vendor.vendorKey} category=${vendor.category}`);
    if (vendor.httpStatus !== undefined) parts.push(`http=${vendor.httpStatus}`);
    if (vendor.upstreamCode) parts.push(`upstreamCode=${vendor.upstreamCode}`);
    if (vendor.reasonCode) parts.push(`reason=${vendor.reasonCode}`);
  }
  let frames: string[] = [];
  try {
    if (error instanceof Error) frames = stackFrames(error);
  } catch {
    /* instanceof 本身也可能抛（Proxy）：没有帧照样写这一行 */
  }
  if (frames.length) parts.push(`| ${frames.map((frame) => redactLogValue(frame)).join(" < ")}`);
  return parts.join(" ");
}

/** 栈帧（不含首部的 message 行——message 可能跨行，跨出来的行不许冒充帧混进日志）。 */
function stackFrames(error: Error): string[] {
  let stack: string;
  let header: string;
  try {
    stack = typeof error.stack === "string" ? error.stack : "";
    header = error.message ? `${String(error.name)}: ${String(error.message)}` : String(error.name);
  } catch {
    return []; // 读栈都会抛的错误对象：不记帧，也绝不让日志道跟着抛
  }
  const body = stack.startsWith(header) ? stack.slice(header.length) : stack.split("\n").slice(1).join("\n");
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, 8)
    // 帧里只留「函数名 (文件名:行:列)」——目录部分是本机路径，不进日志。
    .map((line) => line.replace(/\(?([^\s()]*[/\\])([^\s()/\\]+:\d+:\d+)\)?/g, "($2)"));
}

/** 开发态终端用的完整一行（含原文，仍剥路径 / 密钥形串）。**不许**交给任何落盘写手。 */
export function describeErrorForDevTerminal(error: unknown): string {
  try {
    if (!(error instanceof Error)) return redactLogValue(String(error));
    return redactLogValue(`${String(error.name)}: ${String(error.message)}`);
  } catch {
    return "<unreadable error>";
  }
}

/** 一整行的兜底上限——单值上限之外再兜一次，免得字段多到把文件撑爆。 */
export function capLogLine(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line;
}
