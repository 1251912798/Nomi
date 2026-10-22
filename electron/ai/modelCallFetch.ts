// 一次模型调用的传输包装：失败留证 + 记下「服务商到底回了什么」（2026-10-21，文本任务迁 pi-ai）。
//
// 为什么要它：pi 把 HTTP 失败压成一句字符串（`"<status>: <body>"`，pi-ai/dist/utils/error-body.js:111），状态码与原话
// 都在里面，但那是**它的显示格式**，不是契约——解析它就是在猜。我们自己在传输层把事实记下来：哪个状态码、服务商原话、
// 打的是哪个地址。错误分类（categorizeVendorFailure）读这份事实，不读 pi 的字符串。
// 过去 ai@4 那台发动机在 buildAiSdkModel 的 fetch 包装里做同样的留证，lane 这台一直没有（失败了日志里一个字都没有）；
// 现在两台合成一台，留证也只有这一份。
//
// 两条结构（独立验收 V-textmigrate 10-21 的 F1 / F2）：
//   · **每次尝试一份事实**：pi 在响应头之前会重试（429 → 再发一次），每发一次就是一次新尝试，开头先清掉上一次的事实；
//     对外只给最后那次尝试的事实（`lastAttempt()`）。以前「最后一次非 2xx」跨尝试留着，429 → 重试成功出字 → 断流，
//     断流被认成「429 额度问题」，渲染层自动重提、多生成一次。
//   · **秘密从实际发出去的请求里收集**，不从配置里枚举：每次尝试把真正上线的请求头（Request 或 init 写法、大小写不论）
//     里除公开系统头以外的值、查询串里的值都收进秘密集合（复用 requestPipeline 的「请求秘密 / 公开系统头」规则），整次调用
//     累计；响应体、连接异常、开发诊断、给用户看的错误文案都过 `redact()`，并认 JSON 转义 / URL 编码的回显。以前只认几个
//     固定鉴权头名 + 目录里那把 key，网关的自定义鉴权头（X-Relay-Token 之类）被上游回显进 401 正文就原样漏出去。
//   · URL 去掉查询串；请求头一个都不记。
import { appFetch } from "../appFetch";
import { logDevDetail, logVendorCall } from "../logging/logger";
import { redactLogValue } from "../logging/redact";
import { markPublicSystemRequestHeaders, redactRequestSecrets, sensitiveRequestHeaderValues } from "./requestPipeline";

/**
 * 一次尝试（一次真正发出去的 HTTP 请求）的事实：
 *   · response：拿到了 2xx 响应头（之后流里出什么事，由核心的看门狗 / 断流判断，不归传输层）；
 *   · http：服务商回了非 2xx——状态码、去查询串的地址、抹过密钥的原话；
 *   · thrown：压根没拿到响应（连不上 / 被掐 / DNS）——抹过密钥的原因。
 */
export type ModelCallAttempt =
  | { kind: "response"; status: number }
  | { kind: "http"; status: number; url: string; body: string }
  | { kind: "thrown"; reason: string };
export type ModelHttpFailure = Extract<ModelCallAttempt, { kind: "http" }>;

const MAX_BODY_CHARS = 2000;
/** SDK 自己生成的系统头（版本、平台、重试计数之类），不是凭据：不收进秘密集合（否则 "0"、"600" 这类值会把错误原话抹花）。 */
const SDK_SYSTEM_HEADER = /^(x-stainless-[a-z0-9-]+|anthropic-version|anthropic-beta|anthropic-dangerous-direct-browser-access|content-length|accept-encoding|connection)$/i;
/** requestPipeline 认的公开系统头（accept / content-type / user-agent）；其余一律当秘密。 */
const PUBLIC_HEADER_NAMES = ["accept", "content-type", "user-agent"];
const NON_ASCII = /[\u0080-￿]/g;

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return "?"; }
}

/** 地址只留到路径：查询串里可能就是密钥。 */
export function urlWithoutQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url.split(/[?#]/)[0] ?? "";
  }
}

/** 一种请求头写法 → 小写头名的条目（Headers / 数组 / 对象都认）。 */
function headerEntries(headers: HeadersInit | undefined): Array<[string, string]> {
  if (!headers) return [];
  const entries = headers instanceof Headers ? [...headers.entries()]
    : Array.isArray(headers) ? headers as Array<[string, string]>
      : Object.entries(headers);
  return entries
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, value]) => [name.toLowerCase(), value]);
}

/** 这次真正发出去的请求里的秘密：非公开头的值（另加去掉鉴权方案前缀的那段）、查询串里每一个值。 */
function secretsOfRequest(input: RequestInfo | URL, init: RequestInit | undefined): string[] {
  const url = input instanceof Request ? input.url : String(input);
  const sent: Record<string, string> = {};
  // fetch 的语义：init.headers 给了就整份替掉 Request 自带的；两份都收，宁多勿漏。
  const all = [...headerEntries(input instanceof Request ? input.headers : undefined), ...headerEntries(init?.headers)];
  all.forEach(([name, value], index) => {
    if (SDK_SYSTEM_HEADER.test(name) || sent[name] === value) return;
    sent[name in sent && !PUBLIC_HEADER_NAMES.includes(name) ? `${name}#${index}` : name] = value;
  });
  markPublicSystemRequestHeaders(sent, PUBLIC_HEADER_NAMES);
  const secrets = new Set<string>();
  for (const value of sensitiveRequestHeaderValues(sent)) {
    secrets.add(value);
    const scheme = /^(?:bearer|basic|token|key)\s+(.+)$/i.exec(value);
    if (scheme?.[1]) secrets.add(scheme[1].trim());
  }
  try {
    for (const value of new URL(url).searchParams.values()) if (value) secrets.add(value);
  } catch { /* not a URL */ }
  return [...secrets];
}

/**
 * 服务商在 JSON 里回显时的写法：转义引号 / 反斜杠、把 / 写成 \/、非 ASCII 写成 \uXXXX；JSON 套 JSON（报文里的字符串
 * 本身又是一段 JSON）时会再转义一层，所以叠三层。URL 编码的写法由 redactRequestSecrets 认。
 */
function jsonEchoVariants(secret: string): string[] {
  const asciiOnly = (value: string) => value.replace(NON_ASCII, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const slashEscaped = (value: string) => value.split("/").join("\\/");
  const forms = new Set([secret]);
  let layer = [secret];
  for (let depth = 0; depth < 3; depth += 1) {
    const next: string[] = [];
    for (const value of layer) {
      const escaped = JSON.stringify(value).slice(1, -1);
      for (const form of [escaped, slashEscaped(escaped), asciiOnly(escaped), slashEscaped(asciiOnly(escaped))]) {
        if (!forms.has(form)) { forms.add(form); next.push(form); }
      }
    }
    layer = next;
  }
  return [...forms];
}

/**
 * 包一层传输。`lastAttempt()` 给出最后那次尝试的事实（还没发过就是 null）；`redact(text)` 用这次调用里所有尝试
 * 真正发出去的秘密（加上调用方手里的 `knownSecrets`）抹任意一段文字——给用户看的错误文案也必须过它。
 */
export function observeModelFetch(base: typeof globalThis.fetch, context: { modelId: string; knownSecrets?: readonly string[] }) {
  const secrets = new Set<string>((context.knownSecrets ?? []).filter(Boolean));
  const redact = (text: string, maximumLength?: number): string =>
    redactRequestSecrets(text, [...secrets].flatMap(jsonEchoVariants), maximumLength);
  let lastAttempt: ModelCallAttempt | null = null;
  const observedFetch: typeof globalThis.fetch = async (input, init) => {
    // 新的一次尝试：上一次的事实作废（不许串到这一次的失败上）。
    lastAttempt = null;
    for (const secret of secretsOfRequest(input, init)) secrets.add(secret);
    const url = input instanceof Request ? input.url : String(input);
    const safeUrl = redact(urlWithoutQuery(url));
    const started = Date.now();
    try {
      const response = await base(input, init);
      if (response.ok) {
        lastAttempt = { kind: "response", status: response.status };
        return response;
      }
      logVendorCall({ vendor: hostOf(url), model: context.modelId, status: response.status, ms: Date.now() - started });
      let body = "";
      try { body = redact((await response.clone().text()).slice(0, MAX_BODY_CHARS * 2), MAX_BODY_CHARS); } catch { /* body unreadable */ }
      lastAttempt = { kind: "http", status: response.status, url: safeUrl, body };
      // 响应体片段可能回显请求内容：只进开发终端，用户机器上一个字都不留（logDevDetail 打包后空操作）。
      logDevDetail("vendor", redactLogValue(`${response.status} ${response.statusText} ← ${safeUrl} (model=${context.modelId}) :: ${body.replace(/\s+/g, " ").slice(0, 300)}`));
      return response;
    } catch (error) {
      const reason = redact(error instanceof Error ? error.message : String(error));
      lastAttempt = { kind: "thrown", reason };
      logVendorCall({ vendor: hostOf(url), model: context.modelId, status: "error", ms: Date.now() - started });
      logDevDetail("vendor", redactLogValue(`fetch threw ← ${safeUrl} (model=${context.modelId}) :: ${reason}`));
      throw error;
    }
  };
  return { fetch: observedFetch, lastAttempt: (): ModelCallAttempt | null => lastAttempt, redact };
}

/**
 * 模型调用的传输：应用唯一的 Node 出网口（appFetch，走用户的代理设置）+ 上面的失败留证。
 * 目的地是用户在目录里接入的模型地址（凭据绑定与跳转规则由 appFetch / credentialRedirectPolicy 管），
 * 不是用户 / Agent / 供应商临时给的 URL——那种（例如参考图地址）走 hardenedFetch（modelImageInput）。
 */
export function modelCallTransport(context: { modelId: string; knownSecrets?: readonly string[] }) {
  return observeModelFetch(appFetch, context);
}
