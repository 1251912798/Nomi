import { assertProjectAgentBinding, sameProjectAgentBinding, type ProjectBinding } from "../shared/projectBinding";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import pLimit from "p-limit";
import { readJsonFile } from "../jsonFile";
import { migrateLegacyProjectFolder } from "./legacyProjectMigration";
import {
  initializeWorkspace,
  isWorkspaceBoundaryError,
  readWorkspaceManifest,
  readWorkspaceManifestSnapshot,
  readWorkspaceManifestSnapshotAsync,
  recoverWorkspaceManifest,
  withWorkspaceManifestStagedMutation,
} from "./workspaceManifest";
import {
  backfillWorkspaceOrigins,
  findRecentWorkspace,
  listRecentWorkspaces,
  listRecentWorkspacesAsync,
  rememberWorkspace,
  removeWorkspaceReference,
} from "./workspaceRegistry";
import {
  normalizeWorkspaceProjectRecord,
  workspaceProjectRecordSchema,
  type RecentWorkspaceEntry,
  type WorkspaceOrigin,
  type WorkspaceProjectSource,
  type WorkspaceProjectRecordV2,
} from "./workspaceTypes";
import { workspaceProjectBackupFile, workspaceProjectFile } from "./workspacePaths";
import { writeWorkspaceSyncBaseline } from "./workspaceSyncBaseline";
import { WorkspaceManifestLockBusyError } from "./workspaceManifestLock";
import { logWarn } from "../logging/logger";

export type WorkspaceRepositoryDeps = {
  settingsRoot: string;
  defaultProjectsRoot: string;
};

export type WorkspaceProjectDiagnosticStatus =
  | "ok"
  | "not-registered"
  | "missing-folder"
  | "missing-manifest"
  | "corrupt-manifest"
  | "id-mismatch";

export type WorkspaceProjectDiagnostic = {
  projectId: string;
  rootPath?: string;
  status: WorkspaceProjectDiagnosticStatus;
  recoverable: boolean;
  backupAvailable: boolean;
};

function readValidProjectRecord(filePath: string, projectId: string): WorkspaceProjectRecordV2 | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = workspaceProjectRecordSchema.safeParse(readJsonFile(filePath));
    if (!parsed.success || parsed.data.id !== projectId) return null;
    return normalizeWorkspaceProjectRecord(parsed.data);
  } catch {
    return null;
  }
}

export function diagnoseWorkspaceProject(projectId: string, deps: WorkspaceRepositoryDeps): WorkspaceProjectDiagnostic {
  const id = String(projectId || "").trim();
  const entry = findRecentEntry(id, deps);
  if (!entry) return { projectId: id, status: "not-registered", recoverable: false, backupAvailable: false };
  const rootPath = entry.rootPath;
  if (entry.missing || !fs.existsSync(rootPath)) {
    return { projectId: id, rootPath, status: "missing-folder", recoverable: false, backupAvailable: false };
  }
  const backupAvailable = Boolean(readValidProjectRecord(workspaceProjectBackupFile(rootPath), id));
  const manifestPath = workspaceProjectFile(rootPath);
  if (!fs.existsSync(manifestPath)) {
    return { projectId: id, rootPath, status: "missing-manifest", recoverable: backupAvailable, backupAvailable };
  }
  try {
    const parsed = workspaceProjectRecordSchema.safeParse(readJsonFile(manifestPath));
    if (!parsed.success) {
      return { projectId: id, rootPath, status: "corrupt-manifest", recoverable: backupAvailable, backupAvailable };
    }
    if (parsed.data.id !== id) {
      return { projectId: id, rootPath, status: "id-mismatch", recoverable: backupAvailable, backupAvailable };
    }
    return { projectId: id, rootPath, status: "ok", recoverable: false, backupAvailable };
  } catch {
    return { projectId: id, rootPath, status: "corrupt-manifest", recoverable: backupAvailable, backupAvailable };
  }
}

export function recoverWorkspaceProject(projectId: string, deps: WorkspaceRepositoryDeps): WorkspaceProjectRecordV2 {
  const diagnostic = diagnoseWorkspaceProject(projectId, deps);
  if (!diagnostic.rootPath || !diagnostic.recoverable) {
    throw new Error(`Workspace project is not recoverable: ${projectId}`);
  }
  const recovered = recoverWorkspaceManifest(diagnostic.rootPath, projectId, Date.now());
  rememberWorkspace(deps.settingsRoot, recovered);
  return recovered;
}

export type { WorkspaceProjectSource } from "./workspaceTypes";

export type WorkspaceProjectSummary = Omit<WorkspaceProjectRecordV2, "payload"> & {
  rootPath: string;
  missing: boolean;
  source: WorkspaceProjectSource;
  // 列表用的封面：从 manifest 的 generationCanvas 节点结果派生（不持久化进 manifest）。
  // 修「最近项目白屏」根因——桌面 list 旧逻辑只读 manifest 现有字段、不从画布节点派生。
  // thumbnail/thumbnailUrls 只装可 <img> 渲染的 URL；coverVideoUrl 是无图封面时的视频兜底
  //（卡片用 <video> 首帧当封面），同样 transient、每次 list 现场派生。
  thumbnail?: string;
  thumbnailUrls?: string[];
  coverVideoUrl?: string;
  /**
   * 这一项的数据读不出来（不是暂时忙）：卡片置灰、不能打开，删除只解绑登记、不删盘。
   * outside-workspace = 项目数据经链接指向了项目文件夹外，按边界规则拒读；unreadable = 其余读不出来的情况。
   */
  unreadableReason?: WorkspaceProjectUnreadableReason;
};

export type WorkspaceProjectUnreadableReason = "outside-workspace" | "unreadable";

function persistedProjectSource(entry: RecentWorkspaceEntry): WorkspaceProjectSource {
  return entry.source === "native" && entry.nativeRootPath ? "native" : "folder";
}

export type ProjectCover = {
  /** 可直接 <img> 渲染的封面 URL（图片结果 / 视频 poster / 3D 快照，最多 max 个）。 */
  imageUrls: string[];
  /** imageUrls 为空时的兜底：首个视频结果的 url（卡片用 <video> 首帧渲染）。 */
  videoUrl?: string;
};

/**
 * 从 manifest（payload.generationCanvas / 顶层 generationCanvas）的节点结果派生项目封面
 * ——按 `result.type` 分媒体类型：视频/音频的 url 塞进 <img> 必然「加载失败」，所以
 * imageUrls 只收可 <img> 渲染的 URL（image 的 url/thumbnailUrl、video/model3d 的 poster），
 * 无图封面时以首个视频 url 作 videoUrl 兜底；text/audio 跳过；type 缺失按旧行为当图取（脏数据降级）。
 *
 * 单一来源关系（P4 / 封面派生唯一真相源）：本函数是主进程侧（桌面 list 不经渲染层、直接读
 * manifest 派生封面）的副本。**算法真相源在渲染侧** `src/workbench/project/projectCoverDerive.ts`
 * 的 `deriveProjectCoverFromRaw` / `deriveProjectCoverFromNodes`——两份分属 electron(CJS,
 * rootDir=electron/) 与 renderer(ESM, src/)，跨 tsconfig 无法直接 import 共享，故以
 * 「逻辑等价 + 注释锚定 + 等价回归测试」收口：`electron/workspace/thumbnailDerive.equivalence.test.ts`
 * 用同一组 fixture 跑两份并断言输出逐字相等，任一侧改动漂移即红。改本函数务必同步那侧 + 跑等价测试。
 */
export function deriveProjectCover(record: unknown, max = 4): ProjectCover {
  const r = record as { payload?: unknown; generationCanvas?: unknown } | null;
  const payload = r?.payload;
  const gc =
    (payload && typeof payload === "object"
      ? (payload as { generationCanvas?: unknown }).generationCanvas
      : undefined) ?? r?.generationCanvas;
  const nodes = (gc as { nodes?: unknown } | undefined)?.nodes;
  if (!Array.isArray(nodes)) return { imageUrls: [] };
  const imageUrls: string[] = [];
  let videoUrl: string | undefined;
  for (const n of nodes) {
    if (imageUrls.length >= max) break;
    if (!n || typeof n !== "object") continue;
    const result = (n as { result?: { type?: unknown; url?: unknown; thumbnailUrl?: unknown } }).result;
    if (!result || typeof result !== "object") continue;
    const type = typeof result.type === "string" ? result.type : "";
    const url = typeof result.url === "string" ? result.url : "";
    const thumbnailUrl = typeof result.thumbnailUrl === "string" ? result.thumbnailUrl : "";
    const imageCandidate =
      type === "image"
        ? url || thumbnailUrl
        : type === "video" || type === "model3d"
          ? thumbnailUrl
          : type === "text" || type === "audio"
            ? ""
            : url || thumbnailUrl;
    // 过短 url（length <= 4）视为脏值过滤——与旧派生语义一致。
    if (imageCandidate.length > 4) {
      imageUrls.push(imageCandidate);
      continue;
    }
    if (!videoUrl && type === "video" && url.length > 4) videoUrl = url;
  }
  return videoUrl ? { imageUrls, videoUrl } : { imageUrls };
}

type RecordInput = {
  id?: unknown;
  name?: unknown;
  seedKey?: unknown;
  draft?: unknown;
  payload?: unknown;
};

function asRecordInput(input: unknown): RecordInput {
  return input && typeof input === "object" ? (input as RecordInput) : { payload: input };
}

function inputName(input: unknown, fallback?: string): string | undefined {
  const value = asRecordInput(input).name;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function inputPayload(input: unknown): unknown {
  const objectInput = asRecordInput(input);
  return Object.prototype.hasOwnProperty.call(objectInput, "payload") ? objectInput.payload : input;
}

function withoutPayload(
  record: WorkspaceProjectRecordV2,
  rootPath: string,
  missing: boolean,
  source: WorkspaceProjectSource,
): WorkspaceProjectSummary {
  const { payload: _payload, ...summary } = record;
  return {
    ...summary,
    rootPath,
    missing,
    source,
  };
}

function hasLegacyProjectFile(rootPath: string): boolean {
  try {
    const filePath = path.join(path.resolve(rootPath), "project.json");
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findRecentEntry(projectId: string, deps: WorkspaceRepositoryDeps) {
  return listRecentWorkspaces(deps.settingsRoot).find((entry) => entry.id === projectId) ?? null;
}

function readManifestOrMigrateLegacy(rootPath: string): WorkspaceProjectRecordV2 | null {
  const manifest = readWorkspaceManifestSnapshot(rootPath) ?? readWorkspaceManifest(rootPath);
  if (manifest) return manifest;
  if (!hasLegacyProjectFile(rootPath)) return null;
  return migrateLegacyProjectFolder(rootPath);
}

export function createWorkspaceProject(
  input: { rootPath: string; record: unknown; origin?: WorkspaceOrigin },
  deps: WorkspaceRepositoryDeps,
): WorkspaceProjectRecordV2 {
  const rootPath = path.resolve(input.rootPath);
  const raw = asRecordInput(input.record);
  const initialized = initializeWorkspace(rootPath, {
    ...(typeof raw.id === "string" && raw.id.trim() ? { id: raw.id.trim() } : {}),
    name: inputName(raw),
    ...(typeof raw.seedKey === "string" && raw.seedKey.trim() ? { seedKey: raw.seedKey.trim() } : {}),
    ...(raw.draft === true ? { draft: true } : {}),
    payload: inputPayload(input.record),
  });
  const record = normalizeWorkspaceProjectRecord(initialized);
  const defaultRoot = path.resolve(deps.defaultProjectsRoot);
  const fallbackOrigin: WorkspaceOrigin =
    rootPath !== defaultRoot && rootPath.startsWith(`${defaultRoot}${path.sep}`)
      ? { source: "native", nativeRootPath: defaultRoot }
      : { source: "folder" };
  rememberWorkspace(deps.settingsRoot, record, input.origin ?? fallbackOrigin);
  const manifestPath = workspaceProjectFile(rootPath);
  if (fs.existsSync(manifestPath)) {
    const contentHash = crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex");
    writeWorkspaceSyncBaseline(deps.settingsRoot, record.id, { rootPath, revision: record.revision, contentHash });
  }
  return record;
}

/** 项目库一次列举里，同时在飞的盘读个数上限（线程池默认 4 个线程，再多只是排队、还会和别的读盘抢）。 */
export const WORKSPACE_LIST_IO_CONCURRENCY = 6;

/**
 * 列出全部已登记项目的摘要（项目库的唯一读面，**异步**：清单快照、文件夹在不在都走线程池，
 * 限并发读，列举期间主进程事件循环照常转——此前是同步一口气扫完，41 个项目约占主进程 340–480ms，
 * 保存 / 生成事件 / 别的 IPC 全在后面排队）。
 * 例外：快照读不出来（含内嵌 data URL 需要加锁瘦身、构建产物地址需要迁移）的那一个项目仍走加锁同步读，
 * 它是项目自己的一次性修复，不是每次列表的常态成本。
 */
export async function listWorkspaceProjects(deps: WorkspaceRepositoryDeps): Promise<WorkspaceProjectSummary[]> {
  backfillWorkspaceOrigins(deps.settingsRoot, deps.defaultProjectsRoot);
  const limit = pLimit(WORKSPACE_LIST_IO_CONCURRENCY);
  const entries = await listRecentWorkspacesAsync(deps.settingsRoot, limit);
  const summaries = await Promise.all(
    entries.map((entry) =>
      limit(async (): Promise<WorkspaceProjectSummary> => {
        const source = persistedProjectSource(entry);
        // 注册表里有、但清单读不出来 / 文件夹不在：用注册表里记的名字和最近打开时间兜一张卡，坏项目不从列表里消失。
        const registryCard = (missing: boolean): WorkspaceProjectSummary =>
          withoutPayload(
            normalizeWorkspaceProjectRecord({
              id: entry.id,
              name: entry.name,
              version: 2,
              createdAt: entry.lastOpenedAt,
              updatedAt: entry.lastOpenedAt,
              savedAt: entry.lastOpenedAt,
              revision: 0,
              lastKnownRootPath: entry.rootPath,
            }),
            entry.rootPath,
            missing,
            source,
          );
        if (entry.missing) return registryCard(true);
        // 每一项的读取错误只落在这一张卡上，绝不让一项拖垮整页（V-plibrary N2）：
        // 别的写者正锁着清单 = 暂时的，退回普通登记卡、下次刷新就好；其余读不出来 = 置灰卡，说清原因。
        let manifest: WorkspaceProjectRecordV2 | null;
        try {
          manifest = (await readWorkspaceManifestSnapshotAsync(entry.rootPath)) ?? readWorkspaceManifest(entry.rootPath);
        } catch (error) {
          if (error instanceof WorkspaceManifestLockBusyError) return registryCard(false);
          const unreadableReason: WorkspaceProjectUnreadableReason = isWorkspaceBoundaryError(error) ? "outside-workspace" : "unreadable";
          logWarn("workspace", "list-item-unreadable", { reason: unreadableReason }, error);
          return { ...registryCard(false), unreadableReason };
        }
        if (!manifest || manifest.id !== entry.id) return registryCard(false);
        const summary = withoutPayload({ ...manifest, lastKnownRootPath: entry.rootPath }, entry.rootPath, false, source);
        const cover = deriveProjectCover(manifest);
        return {
          ...summary,
          ...(cover.imageUrls.length ? { thumbnailUrls: cover.imageUrls, thumbnail: cover.imageUrls[0] } : {}),
          ...(cover.videoUrl ? { coverVideoUrl: cover.videoUrl } : {}),
        };
      }),
    ),
  );
  // 列表只读、不删任何东西（N1：回收挂在列举上会和排队中的保存并发，删掉用户刚保存的草稿）。
  // 能证明是零编辑空壳的草稿只是不显示：它们只会是崩溃 / 关机 / 强杀留下的（离开和关窗口都会先整存「转正」），
  // 盘上隐藏保留，删除等「离开只写欠着的」落地后由项目自己的离开流程做。
  return summaries.filter((summary) => !isProvablyEmptyDraft(summary));
}

/**
 * 能证明是零编辑的空壳草稿：native、目录在、此刻的清单仍是 draft + revision 0、assets/ 里没有任何真实文件。
 * 不变量 `revision===0 ⟺ 落盘 payload 即出生默认值`（首次保存即清 draft、revision+1）。
 */
function isProvablyEmptyDraft(project: WorkspaceProjectSummary): boolean {
  if (project.source !== "native" || project.missing || project.unreadableReason) return false;
  if (project.draft !== true || (project.revision ?? 0) !== 0) return false;
  // 判不出来（assets 变成了文件、目录读不了……）一律当「不能证明为空」照常显示，和每项读取同一个承诺：
  // 一项出错只影响它自己，绝不让整页列表抛错（V-plibrary2 S1）。
  try {
    // 列举是异步的，摘要可能是保存之前读的：只对这几个候选再读一次「此刻」的清单，已经转正的照常显示。
    const current = readWorkspaceManifestSnapshot(project.rootPath);
    if (!current || current.id !== project.id || current.draft !== true || current.revision !== 0) return false;
    return !dirHasRealFiles(path.join(project.rootPath, "assets"));
  } catch (error) {
    logWarn("workspace", "list-empty-draft-check-failed", undefined, error);
    return false;
  }
}

export function readWorkspaceProject(
  projectId: string,
  deps: WorkspaceRepositoryDeps,
): WorkspaceProjectRecordV2 | null {
  const entry = findRecentEntry(projectId, deps);
  if (!entry || entry.missing) {
    return null;
  }
  const manifest = readManifestOrMigrateLegacy(entry.rootPath);
  if (!manifest || manifest.id !== projectId) {
    return null;
  }
  return normalizeWorkspaceProjectRecord({ ...manifest, lastKnownRootPath: entry.rootPath });
}

export async function saveWorkspaceProject(
  projectId: string,
  record: unknown,
  deps: WorkspaceRepositoryDeps,
): Promise<WorkspaceProjectRecordV2> {
  const entry = findRecentEntry(projectId, deps);
  if (!entry || entry.missing) {
    throw new Error(`Workspace project not found: ${projectId}`);
  }
  const written = await withWorkspaceManifestStagedMutation(entry.rootPath, (context) => {
    const existing = context.current;
    if (!existing || existing.id !== projectId) {
      throw new Error(`Workspace project not found: ${projectId}`);
    }
    const expectedBinding = record && typeof record === "object" ? (record as { expectedBinding?: ProjectBinding }).expectedBinding : undefined;
    if (expectedBinding !== undefined) {
      assertProjectAgentBinding(expectedBinding);
      if (!sameProjectAgentBinding(expectedBinding, { projectId: existing.id,
        immutableProjectUuid: existing.immutableProjectUuid ?? "", projectGeneration: existing.projectGeneration ?? 0 })) throw new Error("project_binding_stale");
    }
    const now = Date.now();
    const next = normalizeWorkspaceProjectRecord({
      ...existing,
      // 首次真实保存 = 从草稿态 promote 为持久态：清掉 draft 标记，此后它永远显示在项目库里。
      draft: undefined,
      name: inputName(record, existing.name),
      updatedAt: now,
      savedAt: now,
      revision: existing.revision + 1,
      payload: inputPayload(record),
      lastKnownRootPath: entry.rootPath,
    });
    const backupCandidate =
      !existing.immutableProjectUuid &&
      context.currentBackup?.immutableProjectUuid &&
      context.currentBackup.projectGeneration
        ? {
            ...(context.currentRaw ?? existing),
            immutableProjectUuid: context.currentBackup.immutableProjectUuid,
            projectGeneration: context.currentBackup.projectGeneration,
          }
        : (context.currentRaw ?? existing);
    context.replaceBackup(backupCandidate);
    return context.replace(next);
  });
  rememberWorkspace(deps.settingsRoot, written);
  const manifestPath = workspaceProjectFile(entry.rootPath);
  const contentHash = crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex");
  writeWorkspaceSyncBaseline(deps.settingsRoot, written.id, { rootPath: entry.rootPath, revision: written.revision, contentHash });
  return written;
}

export function removeWorkspaceProjectReference(
  projectId: string,
  deps: WorkspaceRepositoryDeps,
): { id: string; deleted: boolean } {
  removeWorkspaceReference(deps.settingsRoot, projectId);
  return { id: projectId, deleted: false };
}

/**
 * 删除一个 workspace 项目（真删盘，2026-06-14 用户拍板）。
 * - native（默认根内的 Nomi 原生项目）→ fs.rmSync 整个目录，deleted:true。
 * - folder（用户用「打开文件夹」绑定的外部目录）→ **绝不碰用户的文件**，只解绑库引用，deleted:false。
 * 双重边界防误删用户目录：必须解析出真实目录、source 判 native、且严格位于默认根之下（非根本身）。
 */
export function deleteWorkspaceProject(
  projectId: string,
  deps: WorkspaceRepositoryDeps,
): { id: string; deleted: boolean } {
  backfillWorkspaceOrigins(deps.settingsRoot, deps.defaultProjectsRoot);
  const entry = findRecentWorkspace(deps.settingsRoot, projectId);
  const dir = resolveWorkspaceProjectDir(projectId, deps); // 解析必须在解绑引用之前
  removeWorkspaceReference(deps.settingsRoot, projectId);
  if (!dir || entry?.source !== "native" || !entry.nativeRootPath) {
    return { id: projectId, deleted: false };
  }
  const resolved = path.resolve(dir);
  const nativeRoot = path.resolve(entry.nativeRootPath);
  const isNative = resolved !== nativeRoot && resolved.startsWith(`${nativeRoot}${path.sep}`);
  if (!isNative) return { id: projectId, deleted: false }; // 外部文件夹：只解绑，不删用户内容
  fs.rmSync(resolved, { recursive: true, force: true });
  return { id: projectId, deleted: true };
}

// 递归判断目录下是否有任何真实文件（忽略空日期目录与 .DS_Store）。「可证明为空」的防御纵深：
// 即便 draft/revision 判据通过，只要项目目录里有任何用户素材就照常显示。
function dirHasRealFiles(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dirHasRealFiles(full)) return true;
    } else if (entry.isFile()) {
      return true;
    }
  }
  return false;
}

export function resolveWorkspaceProjectDir(projectId: string, deps: WorkspaceRepositoryDeps): string | null {
  const entry = findRecentEntry(projectId, deps);
  if (!entry || entry.missing || !fs.existsSync(entry.rootPath)) {
    return null;
  }
  const manifest = readManifestOrMigrateLegacy(entry.rootPath);
  if (!manifest || manifest.id !== projectId) {
    return null;
  }
  return entry.rootPath;
}
