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
