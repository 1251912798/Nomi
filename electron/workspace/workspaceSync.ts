import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import pLimit from "p-limit";
import path from "node:path";
import { writeJsonFileAtomic } from "../jsonFile";
import { createAssetProbe, resolveWorkspaceReadFile, workspaceNomiDir, workspaceProjectFile } from "./workspacePaths";
import type { WorkspaceSyncInspection } from "../shared/workspaceSyncContracts";
export type { WorkspaceSyncInspection, WorkspaceSyncStatus } from "../shared/workspaceSyncContracts";

export type WorkspaceSyncState = {
  schemaVersion: 1;
  workspaceId: string;
  revision: number;
  contentHash: string;
  writerId: string;
  writtenAt: string;
};

// 第 1 组 = URL 自带的项目 id（素材归谁由 URL 说了算，见 src/media/nomiLocalAssetUrl.ts），第 2 组 = 项目内相对路径。
const LOCAL_ASSET_RE = /nomi-local:\/\/asset\/([^/"'\s]+)\/([^"'\s]+)/g;

const SYNC_STATE_NAME = "sync-state.json";

function syncStatePath(rootPath: string): string {
  return path.join(workspaceNomiDir(rootPath), SYNC_STATE_NAME);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 这个文件夹**自己的**素材引用（相对路径）。
 *
 * 只数 URL 里项目 id 等于本项目的那些：从「全部素材」拖进来的别的项目的素材，URL 仍编着源项目 id，
 * 文件住在源项目文件夹里，协议也按那个 id 去读（electron/protocol/localProtocol.ts parseLocalAssetUrl）。
 * 同步本文件夹既不搬它们、也不该为它们报「缺素材」——2026-09-24 用户反馈：把别的项目的素材拖进来后，
 * 这些引用被拿去本文件夹下找，全数判成缺失，项目库随即拦住「继续创作」，项目再也进不去。
 */
function referencedAssetPaths(manifestText: string, projectId: string): string[] {
  const paths = new Set<string>();
  for (const match of manifestText.matchAll(LOCAL_ASSET_RE)) {
    if (decodeSegment(match[1]) !== projectId) continue;
    paths.add(match[2].split("/").map(decodeSegment).join("/"));
  }
  return [...paths];
}

export function writeWorkspaceSyncState(rootPath: string, state: WorkspaceSyncState): void {
  writeJsonFileAtomic(syncStatePath(rootPath), state);
}

export async function readWorkspaceSyncState(rootPath: string): Promise<WorkspaceSyncState | null> {
  try {
    const file = await resolveWorkspaceReadFile(rootPath, "sync-state");
    if (!file) return null;
    const raw = JSON.parse(await fsp.readFile(file, "utf8")) as Partial<WorkspaceSyncState>;
    if (raw.schemaVersion !== 1 || typeof raw.workspaceId !== "string" || typeof raw.writerId !== "string") return null;
    if (!Number.isInteger(raw.revision) || typeof raw.contentHash !== "string" || typeof raw.writtenAt !== "string") return null;
    return raw as WorkspaceSyncState;
  } catch {
    return null;
  }
}

/** 素材存在性探测同时在飞的上限：整个进程共用一个，批量检查几十个项目时也不会把线程池塞满、饿死别的读盘。 */
const ASSET_PROBE_LIMIT = pLimit(8);

/**
 * 检查一个项目文件夹的同步状态（异步，走线程池）。清单只读一次：同一份字节既出版本号、内容哈希，
 * 也出素材引用——此前是读三遍；素材「在不在」每个引用只做一次 realpath（含「不许经符号链接逃出文件夹」的判定），
 * 此前每个引用要走一串 existsSync + lstat。
 */
export async function inspectWorkspaceSync(
  rootPath: string,
  projectId: string,
  expected?: { revision: number; contentHash: string },
): Promise<WorkspaceSyncInspection> {
  // 路径解析（含「真实路径仍在项目根内」）一律走 resolveWorkspaceReadFile；越界当「读不到」，不是「可读」。
  const resolveOrNull = (file: "manifest" | "backup"): Promise<string | null> => resolveWorkspaceReadFile(rootPath, file).catch(() => null);
  const [manifestPath, backupPath] = await Promise.all([resolveOrNull("manifest"), resolveOrNull("backup")]);
  const manifestExists = manifestPath !== null;
  const backupExists = backupPath !== null;
  const corrupt = (): WorkspaceSyncInspection => ({
    status: "corrupt-manifest",
    manifestExists,
    backupExists,
    referencedAssetCount: 0,
    missingAssetCount: 0,
    observedRevision: null,
    lastWriterId: null,
    contentHash: null,
  });
  if (manifestPath === null) return corrupt();

  let bytes: Buffer;
  let observedRevision: number;
  try {
    bytes = await fsp.readFile(manifestPath);
    const raw = JSON.parse(bytes.toString("utf8")) as { revision?: unknown };
    observedRevision = typeof raw.revision === "number" ? raw.revision : 0;
  } catch {
    return corrupt();
  }

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const references = referencedAssetPaths(bytes.toString("utf8"), projectId);
  const probe = await createAssetProbe(rootPath);
  const presence = await Promise.all(references.map((relativePath) => ASSET_PROBE_LIMIT(() => probe(relativePath))));
  const missingAssetCount = presence.filter((present) => !present).length;
  const state = await readWorkspaceSyncState(rootPath);
  const changed = Boolean(expected && (expected.revision !== observedRevision || expected.contentHash !== hash));
  return {
    status: changed ? "external-change" : missingAssetCount > 0 ? "missing-assets" : "ready",
    manifestExists,
    backupExists,
    referencedAssetCount: references.length,
    missingAssetCount,
    observedRevision,
    lastWriterId: state?.writerId ?? null,
    contentHash: hash,
  };
}

export function quarantineWorkspaceConflict(rootPath: string, source: "local" | "remote"): string {
  const dir = path.join(workspaceNomiDir(rootPath), "conflicts");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `project-${source}-${Date.now()}.json`);
  fs.copyFileSync(workspaceProjectFile(rootPath), filePath);
  return filePath;
}
