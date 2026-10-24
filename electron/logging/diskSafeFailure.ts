// 失败的「能落盘的那部分」——唯一一处（G-redact-owner 第 1 步，方向检查 docs/audit/2026-10-22-redact-owner-direction.md）。
//
// 落盘出口（项目事件 `.nomi/events`、主进程日志与崩溃日志、Agent 派生轨迹）从这里拿失败的样子，
// 而这里**只给结构事实，不给任何自由文本**：
//   · 供应商失败：类别、HTTP 状态、上游自己的码、是否可重试——不给 `upstreamMsg`，也不给 URL（query 里可能带 key）；
//   · 任意错误：类名（只认代码里定义的类名那种形状）、错误码、我们自己的码形 message；其余 message 只给 8 位指纹
//     （同一句话同一个指纹，能归并重复失败）。
//
// 为什么不是「擦干净再写」：上游原话会被任意一层拼进新错误的 message（有的带 cause，有的不带），
// 落盘那一刻只剩一段来源不明的字符串；「按头名猜秘密 + 枚举编码变体」已被独立验收 F2-A / F2-B 证明擦不干净。
// 落盘出口不收自由文本，这一类泄漏就从结构上做不出来（删 > 脱敏，用户 2026-10-22 拍板）。
// 原话要看：开发态终端（`logger.logDevDetail`，打包版是空操作）；界面那份由第 2 步的唯一出口决定。
import crypto from "node:crypto";
import { isCodeClassName } from "../shared/contracts/ipcInvokeFailure";

/**
 * 供应商失败类别。与 `vendorHttp.VendorErrorCategory` 是同一张表：这里不 import 它，因为本模块要被
 * pi 那一侧（`agentLane` 经 `logging/logger`）编进去，而 `vendorHttp` 会把整个运行时拖进那份编译；
 * 两边相等由 `diskSafeFailure.test.ts` 在类型层钉死（漂了 tsc 当场红）。
 */
export const VENDOR_FAILURE_CATEGORIES = ["auth", "balance", "quota", "input", "server", "network", "timeout", "unknown"] as const;
export type VendorFailureCategory = (typeof VENDOR_FAILURE_CATEGORIES)[number];

/** 供应商失败落盘的全部字段。**没有字符串自由文本位**：加一个就等于把原话的口子开回来。 */
export type VendorFailureFacts = Readonly<{
  vendorKey: string;
  category: VendorFailureCategory;
  retryable: boolean;
  httpStatus?: number;
  /** 上游自己的错误码（`model_not_found` 一类）；不像码的不收。 */
  upstreamCode?: string;
  logicalCode?: number | string;
  reasonCode?: string;
}>;

/** 码形：短、只含标识符字符。上游把一句话塞进 code 字段时，这句话不落盘。 */
const CODE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * 我们自己的错误码形 message（`TASK_PROJECT_MISMATCH` / `agent_lane_conversation_missing`）：
 * 纯字母、下划线连接的两段以上。没有数字、没有混合熵，不可能是凭据；也不是一句上游的人话。
 */
const OWN_CODE_MESSAGE = /^(?:[A-Z]+(?:_[A-Z]+)+|[a-z]+(?:_[a-z]+)+)$/;

const CATEGORIES: ReadonlySet<string> = new Set<string>(VENDOR_FAILURE_CATEGORIES);

function codeToken(value: unknown): string | undefined {
  return typeof value === "string" && CODE_TOKEN.test(value) ? value : undefined;
}

/**
 * 结构化供应商错误（`VendorRequestError.structured`，或旧事件里存下的那一份）→ 能落盘的事实。
 * 收 `unknown`：旧日志里的形状不可信，认不出就返回 null，不抛。
 */
export function vendorFailureFacts(structured: unknown): VendorFailureFacts | null {
  if (!structured || typeof structured !== "object") return null;
  const record = structured as Record<string, unknown>;
  if (typeof record.category !== "string" || !CATEGORIES.has(record.category)) return null;
  const vendorKey = codeToken(record.vendorKey) ?? "unknown";
  const upstreamCode = codeToken(record.upstreamCode);
  const logicalCode = typeof record.logicalCode === "number" && Number.isFinite(record.logicalCode) ? record.logicalCode : codeToken(record.logicalCode);
  const reasonCode = codeToken(record.reasonCode);
  return {
    vendorKey,
    category: record.category as VendorFailureCategory,
    retryable: record.retryable === true,
    ...(typeof record.httpStatus === "number" && Number.isInteger(record.httpStatus) ? { httpStatus: record.httpStatus } : {}),
    ...(upstreamCode ? { upstreamCode } : {}),
    ...(logicalCode !== undefined ? { logicalCode } : {}),
    ...(reasonCode ? { reasonCode } : {}),
  };
}

/** 错误本身或它 cause 链上的结构化供应商错误（包装层带了 cause 时，事实照样找得回来）。 */
/**
 * 读一个属性，读不了就当没有。日志层**绝不许抛**：落盘道一抛，调用它的 catch 分支就跟着炸，
 * 而错误对象的形状不由我们定（getter 抛错、Proxy、事后改过的字段都见过）。
 */
function readField(value: unknown, key: string): unknown {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** 错误本身或它 cause 链上的结构化供应商错误（包装层带了 cause 时，事实照样找得回来）。 */
export function vendorFailureFactsOf(error: unknown): VendorFailureFacts | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object" && !seen.has(current); depth += 1) {
    seen.add(current);
    const facts = vendorFailureFacts(readField(current, "structured"));
    if (facts) return facts;
    current = readField(current, "cause");
  }
  return null;
}

/** 一段错误文本 → 能落盘的样子：我们自己的码原样；其余只给指纹。非字符串（事后被改过的 message）按字符串化处理。 */
export function diskSafeMessage(message: unknown): string {
  let text: string;
  try {
    text = (typeof message === "string" ? message : message == null ? "" : String(message)).trim();
  } catch {
    return "msg#unreadable";
  }
  if (!text) return "";
  if (text.length <= 64 && OWN_CODE_MESSAGE.test(text)) return text;
  return `msg#${crypto.createHash("sha256").update(text).digest("hex").slice(0, 8)}`;
}

export type DiskSafeErrorFacts = {
  name: string;
  /** 码形 message，或 `msg#<指纹>`；空 message 时为空串。 */
  message: string;
  /** 字符串码（码形）或数字码（子进程退出码就放在 `code` 上）。 */
  code?: string | number;
  /** 本机进程 / 系统调用的纯结构字段：数字或枚举，没有自由文本，不可能带秘密（协调 10-22 定放宽这一档）。 */
  errno?: number;
  exitCode?: number;
  signal?: string;
  vendor?: VendorFailureFacts;
};

function integerField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/** 码：本身没有就沿 cause 链取第一个（`fetch failed` 的 `ENOTFOUND` 在 cause 上）。 */
function codeOf(error: unknown): string | number | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object" && !seen.has(current); depth += 1) {
    seen.add(current);
    const raw = readField(current, "code");
    const code = integerField(raw) ?? codeToken(raw);
    if (code !== undefined) return code;
    current = readField(current, "cause");
  }
  return undefined;
}

/** 任意错误 → 能落盘的事实（日志与崩溃道共用；栈帧由调用方另行剥路径）。不抛。 */
export function diskSafeErrorFacts(error: unknown): DiskSafeErrorFacts {
  try {
    if (!(error instanceof Error)) {
      if (typeof error === "string") return { name: "Error", message: diskSafeMessage(error) };
      if (typeof error === "number" || typeof error === "boolean" || error == null) return { name: "Error", message: String(error) };
      return { name: "NonError", message: "" };
    }
    // 类名是代码里定义的名字，不是用户数据，照写；只认「代码里定义的类名」这一种形状（判据唯一一处，
    // 渲染层摊平 invoke 回来的失败时读的是同一份），name 里装着别的东西（凭据形状、项目名、一句话）就只记 Error。
    const rawName = readField(error, "name");
    const name = isCodeClassName(rawName) ? rawName : "Error";
    const code = codeOf(error);
    const errno = integerField(readField(error, "errno"));
    const exitCode = integerField(readField(error, "exitCode"));
    const signal = codeToken(readField(error, "signal"));
    const vendor = vendorFailureFactsOf(error);
    return {
      name,
      message: diskSafeMessage(readField(error, "message")),
      ...(code !== undefined ? { code } : {}),
      ...(errno !== undefined ? { errno } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(signal ? { signal } : {}),
      ...(vendor ? { vendor } : {}),
    };
  } catch {
    // instanceof 也可能抛（Proxy 的 getPrototypeOf）：认不出就只记「有个认不出的错误」。
    return { name: "UnreadableError", message: "" };
  }
}

/**
 * 事件负载 → 能落盘的样子（唯一写者 `appendEvents` 与唯一读者 `readEvents` 两侧都过它）。
 *
 * `upstreamMsg` 是**我们自己的** schema 里「上游原话」那个字段的名字（`VendorErrorStructured`）——
 * 不是按名字猜秘密，是按自己的契约认自己的字段：带它的对象认得出是供应商失败就换成事实，认不出就去掉这个键。
 * 写侧兜住「新写入方又把 structured 原样塞进来」；读侧兜住旧日志（2026-10-22 之前写下的事件）。
 * 没东西要改时原样返回同一个对象，不复制。
 */
export function diskSafePayload<T>(value: T, depth = 0): T {
  if (depth > 32 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = diskSafePayload(item, depth + 1);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, "upstreamMsg")) {
    const facts = vendorFailureFacts(record);
    if (facts) return facts as unknown as T;
  }
  let out: Record<string, unknown> | null = null;
  for (const [key, item] of Object.entries(record)) {
    if (key === "upstreamMsg") {
      out ??= { ...record };
      delete out[key];
      continue;
    }
    const next = diskSafePayload(item, depth + 1);
    if (next !== item) {
      out ??= { ...record };
      out[key] = next;
    }
  }
  return (out ?? value) as T;
}
