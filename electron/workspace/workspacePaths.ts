import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const DATE_SLICE_LENGTH = 10;

function workspaceBoundaryError(): Error {
  return new Error("Path must stay inside the selected workspace");
}

function assertWorkspaceRoot(workspaceRoot: string): string {
  const root = String(workspaceRoot || "").trim();
  if (!root) {
    throw workspaceBoundaryError();
  }
  return path.resolve(root);
}

function normalizeDateFolder(date: Date = new Date()): string {
  return date.toISOString().slice(0, DATE_SLICE_LENGTH);
}

function assertRelativeInsideRoot(rootPath: string, targetPath: string): string {
  const relative = path.relative(rootPath, targetPath);
  if (relative === "") {
    return targetPath;
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw workspaceBoundaryError();
  }
  return targetPath;
}

function assertExistingAncestorsStayInsideWorkspace(workspaceRoot: string, targetPath: string): void {
  if (!fs.existsSync(workspaceRoot)) {
    return;
  }

  const realRoot = fs.realpathSync(workspaceRoot);
  const relative = path.relative(workspaceRoot, targetPath);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let cursor = workspaceRoot;

  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) {
      break;
    }
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      assertRelativeInsideRoot(realRoot, fs.realpathSync(cursor));
    }
  }
}

function rejectUnsafeRelativePath(relativePath: string): string[] {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    path.isAbsolute(normalized)
  ) {
    throw workspaceBoundaryError();
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw workspaceBoundaryError();
  }
  return segments;
}

export function assertInsideWorkspace(workspaceRoot: string, targetPath: string): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  const target = path.resolve(targetPath);
  assertRelativeInsideRoot(root, target);
  assertExistingAncestorsStayInsideWorkspace(root, target);
  return target;
}

export function resolveWorkspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  const segments = rejectUnsafeRelativePath(relativePath);
  const candidate = assertInsideWorkspace(root, path.join(root, ...segments));

  if (fs.existsSync(candidate)) {
    const realRoot = fs.realpathSync(root);
    const realCandidate = fs.realpathSync(candidate);
    assertRelativeInsideRoot(realRoot, realCandidate);
  }

  return candidate;
}

/**
 * 「这个相对路径的素材在不在文件夹里」的异步探测（同步检查用的是 resolveWorkspaceRelativePath + existsSync，
 * 每个引用要走一串 existsSync / lstat，Windows 上几十个项目 × 上百个引用就是几秒的主进程占用）。
 * 判定不变：不安全的相对路径、经符号链接逃出文件夹的、文件不存在，一律算「不在」；
 * 一次 realpath 同时回答「在不在」和「是不是真的在文件夹里面」。
 */
export async function createAssetProbe(workspaceRoot: string): Promise<(relativePath: string) => Promise<boolean>> {
  const root = assertWorkspaceRoot(workspaceRoot);
  const realRoot = await fsp.realpath(root).catch(() => null);
  return async (relativePath: string): Promise<boolean> => {
    if (!realRoot) return false;
    try {
      const candidate = path.join(root, ...rejectUnsafeRelativePath(relativePath));
      assertRelativeInsideRoot(root, candidate);
      assertRelativeInsideRoot(realRoot, await fsp.realpath(candidate));
      return true;
    } catch {
      return false;
    }
  };
}

const NOMI_DIR_NAME = ".nomi";
const PROJECT_MANIFEST_NAME = "project.json";
const PROJECT_BACKUP_NAME = "project.backup.json";

/**
 * 清单与备份的路径，**纯字符串拼接、不碰盘**——只给「只读列举 / 检查」用。
 * workspaceProjectFile 等写路径函数每次都要逐段 existsSync + lstat 防「符号链接逃出文件夹」，
 * 项目库一次要为几十个项目各算几遍，Windows 上这些系统调用合计约 300ms 的主进程占用（2026-10-21 剖析）。
 * 只读一个已登记根目录下固定名字的两个文件，不需要这道防线；任何写、删、迁移仍走上面带校验的函数。
 */
export function workspaceManifestPathsForRead(workspaceRoot: string): { nomiDir: string; manifest: string; backup: string } {
  const nomiDir = path.join(assertWorkspaceRoot(workspaceRoot), NOMI_DIR_NAME);
  return { nomiDir, manifest: path.join(nomiDir, PROJECT_MANIFEST_NAME), backup: path.join(nomiDir, PROJECT_BACKUP_NAME) };
}

export function workspaceNomiDir(workspaceRoot: string): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  return assertInsideWorkspace(root, path.join(root, NOMI_DIR_NAME));
}

export function workspaceProjectFile(workspaceRoot: string): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  return assertInsideWorkspace(root, path.join(workspaceNomiDir(root), PROJECT_MANIFEST_NAME));
}

export function workspaceProjectBackupFile(workspaceRoot: string): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  return assertInsideWorkspace(root, path.join(workspaceNomiDir(root), PROJECT_BACKUP_NAME));
}

export function workspaceProjectQuarantineFile(workspaceRoot: string, timestamp: number): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  const safeTimestamp = Number.isFinite(timestamp) ? Math.max(0, Math.trunc(timestamp)) : Date.now();
  return assertInsideWorkspace(root, path.join(workspaceNomiDir(root), `project.corrupt-${safeTimestamp}.json`));
}

export function workspaceAssetsGeneratedDir(workspaceRoot: string, date: Date = new Date()): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  return assertInsideWorkspace(root, path.join(root, "assets", "generated", normalizeDateFolder(date)));
}

export function workspaceAssetsImportedDir(workspaceRoot: string, date: Date = new Date()): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  return assertInsideWorkspace(root, path.join(root, "assets", "imported", normalizeDateFolder(date)));
}

export function workspaceExportsDir(workspaceRoot: string): string {
  const root = assertWorkspaceRoot(workspaceRoot);
  return assertInsideWorkspace(root, path.join(root, "exports"));
}
