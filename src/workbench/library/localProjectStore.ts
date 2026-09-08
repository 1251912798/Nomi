import React from 'react'
import useSWR, { mutate } from 'swr'
import {
  createLocalProject as createProjectRecord,
  deleteLocalProject as deleteProjectRecord,
  listLocalProjects as listProjectRecords,
  readLocalProject,
  readLocalProjectAsync,
  renameLocalProject as renameProjectRecord,
  saveLocalProject as saveProjectRecord,
} from '../project/projectRepository'
import type {
  WorkbenchProjectPayload,
  WorkbenchProjectRecordV1 as LocalProjectRecord,
  WorkbenchProjectSummary as LocalProjectSummary,
} from '../project/projectRecordSchema'
import { deriveProjectCoverFromRaw } from '../project/projectCoverDerive'

const LOCAL_PROJECTS_SWR_KEY = 'nomi:local-projects:v1'

function toProjectSummary(record: LocalProjectRecord): LocalProjectSummary {
  // 封面从 record 内容现场派生（与 list 同语义、单一来源）：桌面 save 返回的 record 会被
  // manifest schema strip 掉缩略图字段，抄 record.thumbnail 会让保存后的卡片封面闪空；
  // 且视频兜底封面（coverVideoUrl）本就是 transient、只能派生拿到。
  const cover = deriveProjectCoverFromRaw(record)
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    revision: record.revision,
    savedAt: record.savedAt,
    thumbStyle: record.thumbStyle,
    ...(cover.imageUrls.length ? { thumbnail: cover.imageUrls[0], thumbnailUrls: cover.imageUrls } : {}),
    ...(cover.videoUrl ? { coverVideoUrl: cover.videoUrl } : {}),
    seedKey: record.seedKey,
    source: record.source,
    rootPath: record.rootPath,
    missing: record.missing,
  }
}

function sortProjectSummaries(items: LocalProjectSummary[]): LocalProjectSummary[] {
  return [...items].sort((left, right) => right.updatedAt - left.updatedAt)
}

function publishLocalProjectRecord(record: LocalProjectRecord): void {
  const summary = toProjectSummary(record)
  void mutate<LocalProjectSummary[]>(
    LOCAL_PROJECTS_SWR_KEY,
    (current) => {
      const items = Array.isArray(current) ? current : listProjectRecords()
      const index = items.findIndex((project) => project.id === summary.id)
      if (index < 0) return sortProjectSummaries([summary, ...items])
      const next = [...items]
      next[index] = summary
      return sortProjectSummaries(next)
    },
    { revalidate: false },
  )
}

function unpublishLocalProject(projectId: string): void {
  void mutate<LocalProjectSummary[]>(
    LOCAL_PROJECTS_SWR_KEY,
    (current) => {
      const items = Array.isArray(current) ? current : listProjectRecords()
      return items.filter((project) => project.id !== projectId)
    },
    { revalidate: false },
  )
}

export function listLocalProjects(): LocalProjectSummary[] {
  return listProjectRecords()
}

export function useLocalProjects(): {
  projects: LocalProjectSummary[]
  refreshProjects: () => void
} {
  const { data, mutate: mutateProjects } = useSWR<LocalProjectSummary[]>(
    LOCAL_PROJECTS_SWR_KEY,
    () => listProjectRecords(),
    {
      fallbackData: [],
      revalidateOnMount: true,
      revalidateIfStale: false,
      // 从 Claude Code/外部 MCP 切回 Nomi 聚焦时重读列表——外部新建的项目立刻出现（治「看不到新建项目」）。
      revalidateOnFocus: true,
      revalidateOnReconnect: false,
    },
  )
  const refreshProjects = React.useCallback(() => {
    void mutateProjects(listProjectRecords(), { revalidate: false })
  }, [mutateProjects])
  return {
    projects: data ?? [],
    refreshProjects,
  }
}

export function createLocalProject(name?: string, templateId?: string, options: { rootPath?: string; seedKey?: string } = {}): LocalProjectRecord {
  const record = createProjectRecord(name, templateId, options)
  publishLocalProjectRecord(record)
  return record
}

export { readLocalProject, readLocalProjectAsync }

export async function saveLocalProject(
  projectId: string,
  state: WorkbenchProjectPayload,
  name?: string,
): Promise<LocalProjectRecord> {
  const record = await saveProjectRecord(projectId, state, name)
  publishLocalProjectRecord(record)
  return record
}

/** 列表页「双击改名」：只改名（不动内容），存回后刷新列表卡片。空名/未变=no-op。 */
export async function renameLocalProject(projectId: string, name: string): Promise<LocalProjectRecord | null> {
  const record = await renameProjectRecord(projectId, name)
  if (record) publishLocalProjectRecord(record)
  return record
}

export function deleteLocalProject(projectId: string): void {
  deleteProjectRecord(projectId)
  unpublishLocalProject(projectId)
}

export type {
  LocalProjectRecord,
  LocalProjectSummary,
}
