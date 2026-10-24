import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { retryOnSharingViolation } from "../jsonFile";
import { logWarn } from "../logging/logger";

/**
 * 素材已经落进项目之后的收尾清理：暂存目录、已被硬链接走的临时副本、跨盘搬运后的源文件。
 *
 * 为什么单独一处（2026-09-24 Windows 巡检）：项目文件夹在同步盘里或被杀毒扫描时，别的程序会在文件
 * 刚写出来的那一刻把它打开；Windows 上此时删文件、删目录会 EBUSY/EPERM（POSIX 允许，macOS 碰不到）。
 * 旧代码把这一步写在 `finally` 里直接 await / 直接抛，于是「素材已经好好落进项目」被一句清理错误
 * 改写成「本地素材复制失败」，用户看到的是导入失败，项目里却多了一份没人认领的文件。
 *
 * 规矩：清理失败**永远不改写**前面那一步的结果。异步清理用 Node 自带的 rm 退避重试
 * （`maxRetries` / `retryDelay`，官方就是为 Windows 这类瞬时占用准备的），同步清理用仓库唯一一份
 * `retryOnSharingViolation`；仍失败只记日志。留下的暂存目录由下一次导入按年龄回收。
 */
const RM_RETRY = { maxRetries: 5, retryDelay: 100 } as const;
export const UPLOAD_STAGING_PREFIX = ".nomi-upload-";
const ABANDONED_STAGING_AGE_MS = 10 * 60_000;

// 暂存目录的主人（2026-10-16，独立验收 V-1208-6）：目录名带上创建它的进程号（`.nomi-upload-p<pid>-xxxxxx`），
// 本进程还在用的记在 liveStaging 里。于是「这个暂存还有没有人要」能确定回答，不必只靠年龄猜：
//   · 本进程创建、已不在 liveStaging → 没人要了（清理删不掉留下的），收；
//   · 创建它的进程已经不在了（退出 / 崩溃 / 被杀）→ 没人要了，收——打开项目时就能收，不用等十分钟；
//   · 别的活进程的（例如 MCP stdio 实例同时在写）、或旧版不带进程号的 → 仍按年龄。
const liveStaging = new Set<string>();
const STAGING_OWNER = /^\.nomi-upload-p(\d+)-/;

/** 先登记、再建目录：目录在盘上出现的那一刻它已经是「活的」，同进程里并发的清扫不会把它当残留删掉。 */
function claimStagingName(projectRoot: string): string {
  const directory = path.resolve(projectRoot, `${UPLOAD_STAGING_PREFIX}p${process.pid}-${crypto.randomBytes(6).toString("hex")}`);
  liveStaging.add(directory);
  return directory;
}

/** 在项目根下建一个本进程拥有的暂存目录（所有 `.nomi-upload-*` 都从这里来）。 */
export async function createUploadStagingDir(projectRoot: string): Promise<string> {
  const directory = claimStagingName(projectRoot);
  try {
    await fs.promises.mkdir(directory, { mode: 0o700 });
    return directory;
  } catch (error) {
    liveStaging.delete(directory);
    throw error;
  }
}

export function createUploadStagingDirSync(projectRoot: string): string {
  const directory = claimStagingName(projectRoot);
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
    return directory;
  } catch (error) {
    liveStaging.delete(directory);
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isAbandonedStaging(directory: string, mtimeMs: number, nowMs: number): boolean {
  if (liveStaging.has(path.resolve(directory))) return false;
  const owner = STAGING_OWNER.exec(path.basename(directory));
  if (owner) {
    const pid = Number(owner[1]);
    if (pid === process.pid || !processIsAlive(pid)) return true;
  }
  return nowMs - mtimeMs >= ABANDONED_STAGING_AGE_MS;
}

export async function removeScratchAfterUse(target: string): Promise<void> {
  try {
    await fs.promises.rm(target, { recursive: true, force: true, ...RM_RETRY });
  } catch (error) {
    logWarn("assets", "scratch-cleanup-deferred", { name: path.basename(target) }, error);
  } finally {
    liveStaging.delete(path.resolve(target));
  }
}

export function removeScratchAfterUseSync(target: string): void {
  try {
    retryOnSharingViolation(() => fs.rmSync(target, { recursive: true, force: true }));
  } catch (error) {
    logWarn("assets", "scratch-cleanup-deferred", { name: path.basename(target) }, error);
  } finally {
    liveStaging.delete(path.resolve(target));
  }
}

/** 进程被杀 / 退出、或清理一直删不掉时留在项目根下的 `.nomi-upload-*`：没人要了就收走（判据见 isAbandonedStaging）。 */
export function reapAbandonedUploadStaging(projectRoot: string, nowMs = Date.now()): void {
  let names: string[];
  try {
    names = fs.readdirSync(projectRoot).filter((name) => name.startsWith(UPLOAD_STAGING_PREFIX));
  } catch {
    return;
  }
  for (const name of names) {
    const directory = path.join(projectRoot, name);
    try {
      if (!isAbandonedStaging(directory, fs.statSync(directory).mtimeMs, nowMs)) continue;
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // 下一次导入再收。
    }
  }
}

/** 打开项目时扫一遍（异步、不挡打开）：上一个进程退出 / 崩溃留下的暂存这时就收，不等下一次导入。 */
export async function sweepAbandonedUploadStaging(projectRoot: string, nowMs = Date.now()): Promise<void> {
  let names: string[];
  try {
    names = (await fs.promises.readdir(projectRoot)).filter((name) => name.startsWith(UPLOAD_STAGING_PREFIX));
  } catch {
    return;
  }
  for (const name of names) {
    const directory = path.join(projectRoot, name);
    try {
      if (!isAbandonedStaging(directory, (await fs.promises.stat(directory)).mtimeMs, nowMs)) continue;
      await removeScratchAfterUse(directory);
    } catch {
      // 下一次打开 / 导入再收。
    }
  }
}
