/**
 * 渲染层失败证据的**唯一出口**。
 *
 * 为什么要它（2026-09-24 Windows 用户反馈）：界面弹「项目保存失败」时，真实原因只写进了渲染层
 * `console.error`。打包版里渲染层 console 没人接，于是用户导出的诊断包里只有主进程日志——
 * 看得到「失败了」，看不到「为什么」。那天的真因（`WorkspaceManifestLockBusyError`）是靠猜出来的。
 *
 * 这里做两件事，缺一件都会让证据丢一半：
 *   ① 本地 DevTools 照打（开发时看的就是它）；
 *   ② 把错误摊平成 `{name, message, code, stack}` + 标量字段，经桥送到主进程，落进同一份按天日志。
 *      **脱敏只在主进程做一次**（复用主进程日志那套规则），这里不另写一份。
 *
 * 用法和主进程 `logger.ts` 同形（事件名是短标识，不是句子）：
 *   logRendererError('project-save-failed', error, { trigger: 'autosave' })
 *   logRendererWarn('image-load-failed', { source })
 *   logRendererCrash('root-boundary', error, info.componentStack)
 *
 * `src/**` 里 `console.error` / `console.warn` 被 eslint `no-console` 硬零挡着，本文件是唯一例外。
 * 字段名会过主进程的黑名单：叫 `prompt` / `path` / `url` / `name` 的字段落盘时只剩 `<omitted:…>`，
 * DevTools 里仍是原值——想让它进诊断包，就换一个说明「这是什么」而不是「这里装着内容」的名字。
 */
import {
  RENDERER_LOG_MAX_TEXT_CHARS,
  type RendererLogEntry,
  type RendererLogError,
  type RendererLogFieldValue,
  type RendererLogLevel,
} from '../../electron/shared/contracts/rendererLog'
import { ipcInvokeFailure } from '../../electron/shared/contracts/ipcInvokeFailure'
import { getDesktopBridge } from './bridge'

export type RendererLogFields = Record<string, RendererLogFieldValue | undefined>

function clip(text: string): string {
  return text.length > RENDERER_LOG_MAX_TEXT_CHARS ? text.slice(0, RENDERER_LOG_MAX_TEXT_CHARS) : text
}

function describeNonError(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function errorCode(error: unknown): string | undefined {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' || typeof code === 'number' ? clip(String(code)) : undefined
}

type Facts = { name: string; message: string; code?: string }

/** V8 写进栈首部的那一份：`名字: 消息`（消息为空时只有名字）。 */
function asWritten(error: Error): Facts {
  return { name: error.name || 'Error', message: `${error.message}` }
}

/**
 * 一个 Error 自己是什么。经 `ipcRenderer.invoke` 回来的失败，渲染层手里这个 Error 只是 Electron 的外壳
 * （name 恒为 `Error`、消息是 `Error invoking remote method '…': <类名>: <信息>`）——真正的类名、Node 错误码与消息
 * 从那句话的唯一读法里取回来，日志记的就是主进程那个错误（类名照写，消息到主进程照旧只给指纹）。
 */
function ownFacts(error: Error): Facts {
  const written = asWritten(error)
  const code = errorCode(error)
  const failure = ipcInvokeFailure(written.message)
  const own = failure ? { name: failure.name ?? written.name, message: failure.message, code: code ?? failure.code } : { ...written, code }
  return own.code === undefined ? { name: own.name, message: own.message } : own
}

const header = ({ name, message }: Facts) => (message ? `${name}: ${message}` : name)

/**
 * 栈的首部换成摊平后的那一份，帧不动。主进程按首部切掉消息、只留帧（`electron/logging/redact.ts` stackFrames）；
 * 首部对不上时它只能退回「去掉第一行」，跨行消息里长得像帧的那几行就会混进日志。
 */
function restack(error: Error, summary: Facts): string | undefined {
  const stack = error.stack
  if (typeof stack !== 'string' || !stack) return undefined
  const written = header(asWritten(error))
  return stack.startsWith(written) ? `${header(summary)}${stack.slice(written.length)}` : stack
}

/**
 * 错误 → 可跨 IPC 的平面结构。IPC 的结构化克隆会丢掉 Error 的类名与自定义字段（`code`），
 * 所以必须在这一侧先摊平。包装错误只展开一层 `cause`：包一层再抛的写法里，真因常在 cause 上。
 * 不是 Error 的值没有类名可言：普通对象上的 `name` 是数据（项目名、素材名），一律记 `NonError`。
 */
export function summarizeRendererError(error: unknown): RendererLogError {
  if (error instanceof Error) {
    const own = ownFacts(error)
    const cause = (error as { cause?: unknown }).cause
    const causeFacts = cause instanceof Error ? ownFacts(cause) : null
    const summary = { name: own.name, message: causeFacts ? `${own.message} | cause: ${header(causeFacts)}` : own.message }
    const code = own.code ?? (causeFacts ? causeFacts.code : errorCode(cause))
    const stack = restack(error, summary)
    return {
      name: clip(summary.name),
      message: clip(summary.message),
      ...(code === undefined ? {} : { code }),
      ...(stack ? { stack: clip(stack) } : {}),
    }
  }
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
  const code = errorCode(error)
  return {
    name: 'NonError',
    message: clip(typeof record?.message === 'string' ? record.message : describeNonError(error)),
    ...(code === undefined ? {} : { code }),
  }
}

/** 字段只留标量；`undefined` 去掉；非有限数（NaN / Infinity）转成字符串——它们本身就是要记的证据。 */
function flattenFields(fields?: RendererLogFields): Record<string, RendererLogFieldValue> | undefined {
  if (!fields) return undefined
  const flat: Record<string, RendererLogFieldValue> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (typeof value === 'number' && !Number.isFinite(value)) flat[key] = String(value)
    else flat[key] = typeof value === 'string' ? clip(value) : value
  }
  return Object.keys(flat).length ? flat : undefined
}

/** React 组件栈 → 前 8 个组件名（`Canvas < Workspace < App`）。整段栈是长文本且带 URL，名字就够定位。 */
export function summarizeComponentStack(componentStack: string | null | undefined): string | undefined {
  if (!componentStack) return undefined
  const names = componentStack
    .split('\n')
    .map((line) => /^\s*(?:at|in)\s+([A-Za-z0-9_$.]+)/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name))
    .slice(0, 8)
  return names.length ? names.join(' < ') : undefined
}

function forwardToMainLog(level: RendererLogLevel, event: string, error: unknown, fields?: RendererLogFields): void {
  const flatFields = flattenFields(fields)
  const entry: RendererLogEntry = {
    level,
    event,
    ...(error === undefined ? {} : { error: summarizeRendererError(error) }),
    ...(flatFields ? { fields: flatFields } : {}),
  }
  try {
    getDesktopBridge()?.log?.report(entry)
  } catch {
    /* 日志旁路坏了不能反过来让失败处理本身再抛一次 */
  }
}

function emit(level: RendererLogLevel, event: string, error: unknown, fields?: RendererLogFields): void {
  const consoleArgs: unknown[] = [`[nomi:${event}]`]
  if (error !== undefined) consoleArgs.push(error)
  if (fields) consoleArgs.push(fields)
  if (level === 'warn') console.warn(...consoleArgs)
  else console.error(...consoleArgs)
  forwardToMainLog(level, event, error, fields)
}

/** 一次失败：用户看到了失败提示，或本该成功的事没成。 */
export function logRendererError(event: string, error?: unknown, fields?: RendererLogFields): void {
  emit('error', event, error, fields)
}

/** 一次异常但已兜住的情况（降级、跳过、重试前的那次失败）。参数顺序同主进程 `logWarn`。 */
export function logRendererWarn(event: string, fields?: RendererLogFields, error?: unknown): void {
  emit('warn', event, error, fields)
}

/** 崩溃边界接住的渲染异常：主进程另记一份进崩溃文件。 */
export function logRendererCrash(
  event: string,
  error: unknown,
  componentStack?: string | null,
  fields?: RendererLogFields,
): void {
  emit('crash', event, error, { ...fields, components: summarizeComponentStack(componentStack) })
}

type ErrorCaptureTarget = {
  addEventListener: (type: 'error' | 'unhandledrejection', listener: (event: Event) => void) => void
}

/**
 * 没有任何 catch 接住的失败（未捕获异常、没人 `.catch` 的 Promise 拒绝）——显式上报之外的**第二扇门**，
 * 走同一个出口。不装它的话，`void someAsync()` 里抛出来的东西在打包版里照样零证据。
 * 不再回显 console：浏览器已经把未捕获的错误打进 DevTools 了。
 * 渲染入口（`src/main.tsx`）启动时装一次。
 */
export function installRendererErrorCapture(target: ErrorCaptureTarget = window): void {
  target.addEventListener('error', (event) => {
    const { error, message } = event as ErrorEvent
    // ResizeObserver 回路通知是规范定义的良性提示（error 为 null），不是失败；它会高频出现，
    // 进日志只会把真证据挤出当天文件的大小上限。
    if (!error && typeof message === 'string' && message.startsWith('ResizeObserver loop')) return
    forwardToMainLog('error', 'uncaught-error', error ?? message)
  })
  target.addEventListener('unhandledrejection', (event) => {
    forwardToMainLog('error', 'unhandled-rejection', (event as PromiseRejectionEvent).reason)
  })
}
