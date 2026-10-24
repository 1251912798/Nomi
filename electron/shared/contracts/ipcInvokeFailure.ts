/**
 * Electron `ipcRenderer.invoke` 失败的那句话——全仓唯一读法（方向检查 docs/audit/2026-10-24-ipc-error-class-name-direction.md）。
 *
 * 主进程 `ipcMain.handle` 里抛的错，Electron 只把 `error.toString()` 送回渲染层，渲染层拿到的是
 *   new Error(`Error invoking remote method '<通道>': <主进程那个错误的 toString()>`)
 * name 恒为 `Error`，类、`code`、`cause`、自定义字段全丢（Electron 文档 ipc-main.md `handle` 一节 #24427；
 * 经 contextBridge 跨世界的 Error 也只拷 message，context-bridge.md #25596）。主进程错误的类名**只**在这句话里。
 * 要认它（锁忙文案）、要剥掉外壳（错误卡首行、镜头表技术详情）、要把它记进诊断日志（渲染层日志出口），
 * 都从这里读，不另写正则——四处各写一份时，日志那一处干脆没读，类名跟着消息一起被指纹化（N-nightly 第 2 轮 C1）。
 *
 * 零依赖：渲染层、主进程日志（含 pi 那一侧的编译岛）都引它。
 */

const CLASS_NAME = "[A-Z][A-Za-z0-9_]{0,63}";

/**
 * 代码里定义的错误类名的形状：大写字母开头的标识符（JS 类名的写法，库的命名空间前缀如 `AI_APICallError` 也在内），≤64 字。
 * 判据是结构上的，不是名单：带空格 / 标点 / 汉字 / 路径分隔符的、小写开头的（`sk_live_…`、`ghp_…` 这类凭据形状）都不是类名。
 * 全仓代码里写下的错误类名都过这一条，由 ipcInvokeFailure.test.ts 普查钉住。
 */
export const CODE_CLASS_NAME = new RegExp(`^${CLASS_NAME}$`);

export function isCodeClassName(value: unknown): value is string {
  return typeof value === "string" && CODE_CLASS_NAME.test(value);
}

const ENVELOPE = /^Error invoking remote method '([^']*)':\s*/;
/** 主进程错误 `toString()` 的头：`类名: `；Node 内部错误是 `类名 [ERR_码]: `；消息为空时只有类名。 */
const HEAD = new RegExp(`^(${CLASS_NAME})(?: \\[([A-Z][A-Z0-9_]{0,63})\\])?(?::[ \\t]*|$)`);

export type IpcInvokeFailure = Readonly<{
  /** 失败的那条通道（`nomi:projects:save-async`）。 */
  channel: string;
  /** 主进程那个错误的类名；那边抛的不是 Error（一句字符串、一个普通对象）时没有。 */
  name?: string;
  /** Node 内部错误 `toString()` 里自带的码（`RangeError [ERR_OUT_OF_RANGE]: …`）；别的错误的 `code` 过不来。 */
  code?: string;
  /** 主进程那个错误自己的 message（外壳与类名都已去掉）。 */
  message: string;
}>;

/** invoke 拒绝的那句话 → 通道、类名、码、消息；不是这句话（渲染层自己的错误、不是字符串）返回 null。不抛。 */
export function ipcInvokeFailure(text: unknown): IpcInvokeFailure | null {
  if (typeof text !== "string") return null;
  const envelope = ENVELOPE.exec(text);
  if (!envelope) return null;
  const channel = envelope[1] ?? "";
  const rest = text.slice(envelope[0].length);
  const head = HEAD.exec(rest);
  if (!head) return { channel, message: rest };
  return {
    channel,
    name: head[1],
    ...(head[2] ? { code: head[2] } : {}),
    message: rest.slice(head[0].length),
  };
}

/**
 * 给人看的那一行：去掉 IPC 外壳和泛泛的 `Error:`（对用户零信息）；具体的类名留着（`ProjectTrashFailedError[…]`
 * 一类本身就是排查线索）。不是 invoke 的那句话就原样返回。
 */
export function withoutIpcInvokeWrapper(text: string): string {
  const envelope = ENVELOPE.exec(text);
  if (!envelope) return text;
  return text.slice(envelope[0].length).replace(/^Error:\s*/, "");
}
