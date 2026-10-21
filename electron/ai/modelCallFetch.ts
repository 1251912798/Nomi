// 一次模型调用的传输包装：失败留证 + 记下「服务商到底回了什么」（2026-10-21，文本任务迁 pi-ai）。
//
// 为什么要它：pi 把 HTTP 失败压成一句字符串（`"<status>: <body>"`，pi-ai/dist/utils/error-body.js:111），状态码与原话
// 都在里面，但那是**它的显示格式**，不是契约——解析它就是在猜。我们自己在传输层把事实记下来：哪个状态码、服务商原话、
// 打的是哪个地址。错误分类（categorizeVendorFailure）读这份事实，不读 pi 的字符串。
// 过去 ai@4 那台发动机在 buildAiSdkModel 的 fetch 包装里做同样的留证，lane 这台一直没有（失败了日志里一个字都没有）；
// 现在两台合成一台，留证也只有这一份。
//
// 密钥不进任何一处（协调 10-21 硬要求）：
//   · URL 去掉查询串（有的厂商把 key 放在 `?key=`）；
//   · 响应体截断，并把本次请求用到的密钥（请求头里的、查询串里的）全部抹掉，再过日志的第二道网（redactLogValue）；
//   · 请求头一个都不记。
import { logDevDetail, logVendorCall } from "../logging/logger";
import { redactLogValue } from "../logging/redact";
import { redactRequestSecrets } from "./requestPipeline";

/** 服务商回了非 2xx 时记下的事实（最后一次尝试的那一份：pi 会在响应头之前重试）。 */
export type ModelHttpFailure = { status: number; url: string; body: string };

const MAX_BODY_CHARS = 2000;
const SECRET_HEADERS = /^(authorization|x-api-key|api-key|x-goog-api-key|cf-aig-authorization|proxy-authorization)$/i;

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

/** 这次请求带着的所有密钥形的值：鉴权头的值、查询串里每一个参数值。 */
function secretsOf(url: string, headers: HeadersInit | undefined, known: readonly string[]): string[] {
  const secrets = new Set(known.filter(Boolean));
  try {
    for (const value of new URL(url).searchParams.values()) if (value) secrets.add(value);
  } catch { /* not a URL */ }
  const entries = headers instanceof Headers ? [...headers.entries()]
    : Array.isArray(headers) ? headers as Array<[string, string]>
      : Object.entries(headers || {});
  for (const [name, value] of entries) {
    if (!SECRET_HEADERS.test(name) || typeof value !== "string") continue;
    secrets.add(value);
    const bearer = /^bearer\s+(.+)$/i.exec(value);
    if (bearer?.[1]) secrets.add(bearer[1].trim());
  }
  return [...secrets];
}

/**
 * 包一层传输。`failure()` 给出最后一次非 2xx 的事实（没有就是 null）。
 * `knownSecrets`：调用方手里的密钥（目录里解开的那把），也一并从记录里抹掉。
 */
export function observeModelFetch(base: typeof globalThis.fetch, context: { modelId: string; knownSecrets?: readonly string[] }) {
  let lastFailure: ModelHttpFailure | null = null;
  /** 最后一次请求压根没拿到响应（连不上 / 被掐 / DNS）：抹过密钥的原因。 */
  let lastThrown: string | null = null;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const secrets = secretsOf(url, headers, context.knownSecrets ?? []);
    const safeUrl = redactRequestSecrets(urlWithoutQuery(url), secrets);
    const started = Date.now();
    try {
      const response = await base(input, init);
      lastThrown = null;
      if (!response.ok) {
        logVendorCall({ vendor: hostOf(url), model: context.modelId, status: response.status, ms: Date.now() - started });
        let body = "";
        try { body = redactRequestSecrets((await response.clone().text()).slice(0, MAX_BODY_CHARS * 2), secrets, MAX_BODY_CHARS); } catch { /* body unreadable */ }
        lastFailure = { status: response.status, url: safeUrl, body };
        // 响应体片段可能回显请求内容：只进开发终端，用户机器上一个字都不留（logDevDetail 打包后空操作）。
        logDevDetail("vendor", redactLogValue(`${response.status} ${response.statusText} ← ${safeUrl} (model=${context.modelId}) :: ${body.replace(/\s+/g, " ").slice(0, 300)}`));
      }
      return response;
    } catch (error) {
      lastThrown = redactRequestSecrets(error instanceof Error ? error.message : String(error), secrets);
      logVendorCall({ vendor: hostOf(url), model: context.modelId, status: "error", ms: Date.now() - started });
      logDevDetail("vendor", redactLogValue(`fetch threw ← ${safeUrl} (model=${context.modelId}) :: ${redactRequestSecrets(error instanceof Error ? error.message : String(error), secrets)}`));
      throw error;
    }
  };
  return { fetch, failure: () => lastFailure, thrown: () => lastThrown };
}
