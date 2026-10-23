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
    throw projectTrashFailed(classifyTrashFailure(error, target), error);
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
 * 位置进不了回收站），macOS 的 NSError 原文（中文 / 英文系统各一份，2026-10-23 在真机上采的样本）。认不准就归 unknown，不猜。
 * 系统原文会带上项目文件夹名（用户起的，可能叫 permission / locked）和卷名：匹配前先把完整路径和 macOS 引号“……”
 * 里的名字剔掉，只看原因那半句（不单剔短名字：名字叫「e」会把原文里所有的 e 都吃掉）。分类只决定提示怎么说，
 * 进不了回收站就一律什么都不删，认错不会多删一个字节。
 */
export function classifyTrashFailure(error: unknown, target: string): ProjectTrashFailureReason {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toUpperCase();
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? "")
    .split(target).join(" ")
    .replace(/“[^”]*”/g, " ")
    .toLowerCase();
  if (code === "EPERM" || code === "EACCES" || /0x80070005|access is denied|permission|not permitted|没有[^，。]{0,16}(许可|权限)/.test(message)) return "permission";
  if (code === "EBUSY" || /0x80070020|0x80070021|sharing violation|being used by another process|resource busy|locked/.test(message)) return "in-use";
  if (code === "ENOTSUP" || code === "EXDEV" || /operation was aborted|not supported|no trash|trash.*(unavailable|not available)|cannot be moved to the trash|recycle bin|volume.{0,80}doesn.t have one|没有废纸篓/.test(message)) return "no-trash";
  return "unknown";
}
