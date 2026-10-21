// 模型调用的失败 → 用户看得懂、渲染层认得出类别的错误（唯一一处）。
//
// 输入是**我们自己记下的事实**（传输层看到的状态码与原话、看门狗的相位、调用是被谁停的），不是 pi 的显示字符串：
// pi 把 HTTP 失败压成 `"<status>: <body>"`（pi-ai/dist/utils/error-body.js:111），那是它的展示格式，不是契约。
// 分类只查 vendorHttp 的 `categorizeVendorFailure` 一张表——图 / 视频侧、文本侧、Agent 一个口径。
//
// 2026-10-21 文本任务迁到 pi-ai 单次调用后，ai@4 那一份（aiSdkVendorError：拆 RetryError 壳、认 APICallError）删掉，
// 文本任务、编译器、lane 的 HTTP 事实都走这里。
import type { RuntimeErrorFacts } from '../shared/agentCapabilities/transportContracts';
import { laneAssistantFaultOf, type LaneModelTimeoutPhase } from '../shared/agentLane/laneAssistantFault';
import { MODEL_CALL_CEILING_ERROR } from '../shared/agentLane/modelCallPort';
import { isJsonRecord, pickUpstreamCode } from '../jsonUtils';
import { VendorRequestError, categorizeVendorFailure, encodeVendorErrorMessage } from '../vendor/vendorHttp';
import { desktopT } from '../i18n';
import type { ModelHttpFailure } from './modelCallFetch';

/** 上游报文里的人话：{error:{message}} / {error} / {message} / {msg} 四种常见信封。 */
function pickBodyMessage(parsed: unknown): string {
  if (typeof parsed === 'string') return parsed;
  if (!parsed || typeof parsed !== 'object') return '';
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.error === 'string') return obj.error;
  if (obj.error && typeof obj.error === 'object') {
    const inner = (obj.error as Record<string, unknown>).message;
    if (typeof inner === 'string' && inner.trim()) return inner;
  }
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  if (typeof obj.msg === 'string' && obj.msg.trim()) return obj.msg;
  return '';
}

/**
 * JSON-or-raw：上游响应体里那句人话，抠不出就给清洗过的片段。
 * 中转常把真原因（如「官方算力限制，请等待一段时间后再进行使用」）只放在 body 里，状态行只有一句裸状态文本。
 */
export function upstreamMessageFromBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  try {
    const message = pickBodyMessage(JSON.parse(trimmed));
    if (message) return message.trim();
  } catch {
    /* not JSON — fall through to raw snippet */
  }
  return trimmed.replace(/\s+/g, ' ').slice(0, 300);
}

/** 上游响应体里它**自己给的错误码**（与图/视频侧同一个 `pickUpstreamCode`，键优先级表全仓一份）。 */
export function upstreamCodeFromBody(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body.trim());
    return isJsonRecord(parsed) ? pickUpstreamCode(parsed) : '';
  } catch {
    return '';
  }
}

/** HTTP / 网络 / 超时事实 → 结构化错误；取消与运行期错误不是服务商失败，返回 null。 */
export function vendorErrorFromRuntimeFacts(error: RuntimeErrorFacts, vendorKey: string): VendorRequestError | null {
  if (error.kind !== 'http' && error.kind !== 'timeout' && error.kind !== 'network') return null;
  const upstreamMsg = (error.body ? upstreamMessageFromBody(error.body) : '') || error.message;
  // 上游自己给的错误码与它说的话一起带过 IPC（和图 / 视频侧同一个 pickUpstreamCode）：状态码只说「请求有问题」。
  const upstreamCode = error.body ? upstreamCodeFromBody(error.body) : '';
  // 有状态码就报状态码（与迁移前文本侧逐字一致：「（HTTP 429）上游原话」）；超时是我们自己的话，不再套一层前缀。
  const display = error.status !== undefined ? `（HTTP ${error.status}）${upstreamMsg}`
    : error.kind === 'timeout' ? upstreamMsg : `（请求失败）${upstreamMsg}`;
  return new VendorRequestError(display, {
    vendorKey, method: 'POST', url: error.url ?? '',
    ...(error.status !== undefined ? { httpStatus: error.status } : {}),
    upstreamMsg: upstreamMsg.slice(0, 256), ...(upstreamCode ? { upstreamCode } : {}), ...categorizeVendorFailure(error.status),
  });
}

/** Map recorded pi transport facts directly; never impersonate an AI4 error. */
export function describeRuntimeError(error: RuntimeErrorFacts, vendorKey: string): string {
  const vendorError = vendorErrorFromRuntimeFacts(error, vendorKey);
  return vendorError ? encodeVendorErrorMessage(vendorError) : error.message;
}

const STALL_KEYS: Record<LaneModelTimeoutPhase, Parameters<typeof desktopT>[0]> = {
  'first-response': 'textTask.stall.firstResponse',
  'first-token': 'textTask.stall.firstToken',
  idle: 'textTask.stall.idle',
};

/** pi 的看门狗 / 重试判据给报文追加的分类标记（laneProviderGuard.normalizeProviderErrorText）：给 pi 看的，不给人看。 */
function withoutClassifierMarker(text: string): string {
  return text.replace(/\s*\[nomi-classified: [^\]]+\]\s*$/, '').trim();
}

/**
 * 一次模型调用失败了 → 交给调用方抛出去的那个错误。
 *   · 服务商回了非 2xx：状态码 + 原话 + 上游自己的码（传输层记下的事实）；
 *   · 看门狗到点 / 整体兜底到点 / 流中途断了：我们自己的话（按相位说），结构化成 network，可重试；
 *   · 压根没连上：network + 连接层原因（已抹密钥）；
 *   · 其余（SSE 里包着的错误等，服务商给了原话但没有状态码）：原话。
 * 用户点的停止不经这里（调用方先认 AbortError）。
 */
export function modelCallFailure(input: {
  vendorKey: string
  error?: unknown
  errorMessage?: string
  http: ModelHttpFailure | null
  thrown: string | null
}): Error {
  const { vendorKey, http } = input;
  if (input.error instanceof Error && input.error.name === MODEL_CALL_CEILING_ERROR) {
    const milliseconds = (input.error as Error & { milliseconds?: number }).milliseconds ?? 600_000;
    const message = desktopT('textTask.stall.overall', { minutes: Math.round(milliseconds / 60_000) });
    return vendorErrorFromRuntimeFacts({ kind: 'timeout', message }, vendorKey)!;
  }
  if (http) {
    return vendorErrorFromRuntimeFacts({ kind: 'http', status: http.status, body: http.body, url: http.url, message: `HTTP ${http.status}` }, vendorKey)!;
  }
  const raw = input.errorMessage ?? (input.error instanceof Error ? input.error.message : input.error === undefined ? '' : String(input.error));
  const fault = laneAssistantFaultOf(raw);
  if (fault?.kind === 'model-timeout') {
    return vendorErrorFromRuntimeFacts({ kind: 'timeout', timeoutPhase: fault.phase,
      message: desktopT(STALL_KEYS[fault.phase], { seconds: fault.seconds }) }, vendorKey)!;
  }
  if (fault?.kind === 'stream-cut') return vendorErrorFromRuntimeFacts({ kind: 'timeout', message: desktopT('textTask.streamCut') }, vendorKey)!;
  if (input.thrown) return vendorErrorFromRuntimeFacts({ kind: 'network', message: input.thrown }, vendorKey)!;
  return new Error(withoutClassifierMarker(raw) || 'agent_lane_provider_error');
}
