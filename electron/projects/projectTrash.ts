import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import {
  PROJECT_TRASH_FAILED_ERROR_NAME,
  projectTrashFailedMessage,
  type ProjectTrashFailureReason,
} from "../shared/projectDeleteIntent";

/**
 * 把一个项目文件夹移进系统回收站——删项目文件夹的**唯一做法**（⑭，用户 2026-10-22 拍板；
 * 方向检查 docs/engineering/direction-checks/2026-10-23-project-delete-to-trash.md）。
 *
 * - 用 Electron 自带的 shell.trashItem：Windows 回收站 / macOS 废纸篓 / Linux 桌面回收站，用户能从那里还原。
 *   Windows 上 Electron 给删除挂了进度回调，进不了回收站的项（网络盘、可移动盘、回收站关掉 / 放不下）直接
 *   E_ABORT、整次放弃，不会退回永久删除（electron/shell/common/platform_util_win.cc DeleteFileProgressSink）。
 * - 进不了回收站：抛 ProjectTrashFailedError（带三类原因之一），**什么都没删**；这里绝不退回 fs.rmSync。
 * - 报成功但原路径还在：同样当失败——调用方只有在这里返回之后才从项目库摘掉登记。
 */
export async function moveProjectFolderToTrash(folder: string): Promise<void> {
  const target = path.resolve(folder);
  try {
    await shell.trashItem(target);
  } catch (error) {
    throw projectTrashFailed(classifyTrashFailure(error), error);
  }
  if (fs.existsSync(target)) {
    throw projectTrashFailed("unknown", new Error("trash reported success but the folder is still in place"));
  }
}

function projectTrashFailed(reason: ProjectTrashFailureReason, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(projectTrashFailedMessage(reason, detail));
  error.name = PROJECT_TRASH_FAILED_ERROR_NAME;
  Object.defineProperty(error, "cause", { configurable: true, value: cause });
  return error;
}

/**
 * 只分三类给人看，其余 unknown。依据：Node 风格的 code（EPERM / EACCES / EBUSY…），Windows IFileOperation
 * 的 HRESULT（0x80070005 拒绝访问、0x80070020 共享冲突）与 Electron 的「Operation was aborted」（回收站放弃 = 这个
 * 位置进不了回收站），macOS / Linux 的「不支持 / 没有回收站」类文字。认不准就归 unknown，不猜。
 */
export function classifyTrashFailure(error: unknown): ProjectTrashFailureReason {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toUpperCase();
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? "").toLowerCase();
  if (code === "EPERM" || code === "EACCES" || /0x80070005|access is denied|permission|not permitted/.test(message)) return "permission";
  if (code === "EBUSY" || /0x80070020|0x80070021|sharing violation|being used by another process|resource busy|locked/.test(message)) return "in-use";
  if (code === "ENOTSUP" || code === "EXDEV" || /operation was aborted|not supported|no trash|trash.*(unavailable|not available)|cannot be moved to the trash|recycle bin/.test(message)) return "no-trash";
  return "unknown";
}
