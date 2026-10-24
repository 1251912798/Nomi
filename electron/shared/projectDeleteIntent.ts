/**
 * 删除项目时，用户在确认框里确认的是哪一种（V-plibrary2，2026-10-22）。
 *
 * 确认框按「列表那一刻」的卡片状态说话（外部文件夹 / 读不出的项目 → 「只从项目库移除、不删文件」），
 * 主进程在「删除那一刻」才执行。两刻之间项目状态可能变了（.nomi 被挪回原处、同步盘把数据补齐），
 * 所以主进程不自己重新判断该删多少，只照用户确认过的意图执行：
 *   · `unbind`       只解除项目库登记，绝不碰盘上的文件——不论此刻读不读得出来；
 *   · `delete-files` 真删（只对读得出来的 native 项目生效；外部文件夹仍只解绑）。此刻读不出来 = 和确认时的
 *                    状态对不上，拒绝（抛下面这个名字的错），界面刷新后让用户重新确认。
 * 意图缺失或不认识同样拒绝：宁可删不掉，也不能把「只解绑」猜成删文件。
 */
export const PROJECT_DELETE_INTENTS = ["unbind", "delete-files"] as const;
export type ProjectDeleteIntent = (typeof PROJECT_DELETE_INTENTS)[number];

export function isProjectDeleteIntent(value: unknown): value is ProjectDeleteIntent {
  return typeof value === "string" && (PROJECT_DELETE_INTENTS as readonly string[]).includes(value);
}

/** 「确认时的状态和此刻对不上」的跨进程身份。同步 IPC 只带回错误信息文本，所以名字写进信息开头。 */
export const PROJECT_DELETE_STATE_CHANGED_ERROR_NAME = "ProjectDeleteStateChangedError";

export function isProjectDeleteStateChangedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message, cause } = error as { name?: unknown; message?: unknown; cause?: unknown };
  if (name === PROJECT_DELETE_STATE_CHANGED_ERROR_NAME) return true;
  if (typeof message === "string" && message.includes(`${PROJECT_DELETE_STATE_CHANGED_ERROR_NAME}:`)) return true;
  return cause !== undefined && cause !== error && isProjectDeleteStateChangedError(cause);
}

/**
 * 「删除文件」= 把项目文件夹移进系统回收站（Windows 回收站 / macOS 废纸篓 / Linux 桌面回收站，Electron shell.trashItem），
 * 可以从回收站还原（⑭，用户 2026-10-22 拍板）。进不了回收站就报这个错：什么都没删、项目还在库里，**绝不退回永久删除**。
 * 原因只分三类给人看（权限 / 这个位置没有回收站 / 文件被占用），其余 unknown（原文进日志）。
 * 名字和原因都写进信息开头：ipcRenderer.invoke 只把信息文本带回渲染层。
 */
export const PROJECT_TRASH_FAILED_ERROR_NAME = "ProjectTrashFailedError";
export const PROJECT_TRASH_FAILURE_REASONS = ["permission", "no-trash", "in-use", "unknown"] as const;
export type ProjectTrashFailureReason = (typeof PROJECT_TRASH_FAILURE_REASONS)[number];

export function projectTrashFailedMessage(reason: ProjectTrashFailureReason, detail: string): string {
  return `${PROJECT_TRASH_FAILED_ERROR_NAME}[${reason}]: project folder was not moved to the trash and nothing was deleted (${detail})`;
}

/** 认得出直接拿到的、经 IPC 包过一层（只剩信息文本）的、或挂在 cause 上的。认不出返回 null。 */
export function projectTrashFailureReason(error: unknown): ProjectTrashFailureReason | null {
  if (!error || typeof error !== "object") return null;
  const { message, cause } = error as { message?: unknown; cause?: unknown };
  if (typeof message === "string") {
    const match = message.match(/ProjectTrashFailedError\[([a-z-]+)\]:/);
    if (match && (PROJECT_TRASH_FAILURE_REASONS as readonly string[]).includes(match[1])) return match[1] as ProjectTrashFailureReason;
  }
  return cause !== undefined && cause !== error ? projectTrashFailureReason(cause) : null;
}

export function isProjectTrashFailedError(error: unknown): boolean {
  return projectTrashFailureReason(error) !== null;
}
