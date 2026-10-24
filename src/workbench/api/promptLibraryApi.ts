// 渲染层取提示词库的唯一入口(镜像 skillApi 的 requireDesktopRuntime 范式)。
// 主进程已聚合+缓存;这里取全量,搜索/分类过滤是平凡纯函数,放渲染层(不重复后端逻辑)。
import type { SkillCuration } from '../../../electron/shared/skillCuration'
import type { UserPromptRestoreSnapshot } from '../../../electron/shared/contracts/promptLibrary'
import { getDesktopBridge, type DesktopBridge } from '../../desktop/bridge'
import i18n from '../../i18n'
import { getAssistantModelPref } from '../ai/assistantModelPref'
import { matchesLibraryQuery } from '../library/libraryDiscovery'

export type PromptMediaType = 'image' | 'video'

export type PromptOrigin = 'public' | 'user'

export type PromptReferenceImage = { url: string; title?: string; sourceUrl?: string }

export type LibraryPrompt = {
  curation?: SkillCuration
  id: string
  title: string
  prompt: string
  mediaUrl: string
  mediaType: PromptMediaType
  promptType: PromptMediaType
  tags: string[]
  source: string
  sourceId: string
  sourceUrl: string
  /** public=外部公开仓库(只读);user=我的库(可改可删,用户级跨项目)。 */
  origin: PromptOrigin
  /** 我的库条目的更新时间(ISO);public 无。 */
  updatedAt?: string
  /** 参考图(网页提取的截图/原图;素材面收敛 2026-07-22 随迁字段,封面 mediaUrl=首图)。 */
  referenceImages?: PromptReferenceImage[]
}

function requireDesktopRuntime(feature: string): DesktopBridge {
  const desktop = getDesktopBridge()
  if (!desktop?.promptLibrary) throw new Error(`${feature} requires the Electron desktop runtime`)
  return desktop
}

function toPrompt(raw: unknown): LibraryPrompt | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = String(r.id ?? '')
  const prompt = String(r.prompt ?? '')
  if (!id || !prompt) return null
  const mediaType: PromptMediaType = r.mediaType === 'video' ? 'video' : 'image'
  const promptType: PromptMediaType = r.promptType === 'video' ? 'video' : 'image'
  return {
    ...r,
    id,
    curation: r.curation as SkillCuration | undefined,
    title: String(r.title ?? i18n.t('runtime.promptLibrary.untitled')),
    prompt,
    mediaUrl: String(r.mediaUrl ?? ''),
    mediaType,
    promptType,
    tags: Array.isArray(r.tags) ? r.tags.map((t) => String(t)) : [],
    source: String(r.source ?? ''),
    sourceId: String(r.sourceId ?? ''),
    sourceUrl: String(r.sourceUrl ?? ''),
    origin: r.origin === 'user' ? 'user' : 'public',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    referenceImages: Array.isArray(r.referenceImages)
      ? (r.referenceImages as unknown[])
          .filter((img): img is PromptReferenceImage =>
            Boolean(img) && typeof img === 'object' && typeof (img as PromptReferenceImage).url === 'string' && (img as PromptReferenceImage).url.length > 0)
      : undefined,
  }
}

export async function fetchPromptLibrary(): Promise<LibraryPrompt[]> {
  const desktop = requireDesktopRuntime('prompt library')
  const res = await desktop.promptLibrary!.list()
  if (!res?.ok || !Array.isArray(res.prompts)) throw new Error(res?.error || i18n.t('runtime.promptLibrary.loadFailed'))
  return res.prompts.map(toPrompt).filter((p): p is LibraryPrompt => p !== null)
}

// —— 我的库(用户级·跨项目):手写攒的提示词 CRUD,均返回全量(渲染层本地过滤)。 ——

function mapUserPrompts(res: { ok?: boolean; prompts?: unknown[] } | undefined): LibraryPrompt[] {
  if (!res?.ok || !Array.isArray(res.prompts)) return []
  return res.prompts.map(toPrompt).filter((p): p is LibraryPrompt => p !== null)
}

export async function fetchUserPrompts(): Promise<LibraryPrompt[]> {
  const desktop = requireDesktopRuntime('my prompt library')
  const res = await desktop.promptLibrary!.userList()
  if (!res?.ok || !Array.isArray(res.prompts)) throw new Error(res?.error || i18n.t('runtime.promptLibrary.loadFailed'))
  return mapUserPrompts(res)
}

export async function addUserPrompt(input: {
  title?: string
  prompt: string
  promptType: PromptMediaType
  tags?: string[]
  referenceImages?: PromptReferenceImage[]
}): Promise<LibraryPrompt[]> {
  const desktop = requireDesktopRuntime('add prompt')
  const res = await desktop.promptLibrary!.userAdd(input)
  if (!res?.ok) throw new Error(res?.error || i18n.t('runtime.promptLibrary.saveFailed'))
  return mapUserPrompts(res)
}

export async function updateUserPrompt(id: string, patch: { title?: string; prompt?: string; promptType?: PromptMediaType }): Promise<LibraryPrompt[]> {
  const desktop = requireDesktopRuntime('edit prompt')
  const res = await desktop.promptLibrary!.userUpdate(id, patch)
  if (!res?.ok) throw new Error(res?.error || i18n.t('runtime.promptLibrary.updateFailed'))
  return mapUserPrompts(res)
}

export async function deleteUserPromptWithSnapshot(id: string): Promise<{ items: LibraryPrompt[]; deleted: UserPromptRestoreSnapshot | null }> {
  const desktop = requireDesktopRuntime('delete prompt')
  const res = await desktop.promptLibrary!.userDelete(id) as { ok?: boolean; prompts?: unknown[]; deleted?: unknown; error?: string }
  if (!res?.ok || !Array.isArray(res.prompts)) throw new Error(res?.error || i18n.t('runtime.promptLibrary.saveFailed'))
  const deleted = toPrompt(res.deleted) as UserPromptRestoreSnapshot | null
  return { items: mapUserPrompts(res), deleted }
}

export async function restoreUserPrompt(snapshot: UserPromptRestoreSnapshot): Promise<LibraryPrompt[]> {
  const desktop = requireDesktopRuntime('restore prompt')
  const res = await desktop.promptLibrary!.userRestore(snapshot) as { ok?: boolean; prompts?: unknown[]; error?: string }
  if (!res?.ok || !Array.isArray(res.prompts)) throw new Error(res?.error || i18n.t('runtime.promptLibrary.saveFailed'))
  return mapUserPrompts(res)
}

/**
 * 「跟随 Agent 的模型」唯一入口（文本节点 / 提示词优化 / 翻译 / 提取都走它）：Agent 面板选了谁就是谁
 * （assistantModelPref，与 lane 同一份选择），没选或选的此刻不可用才回落到默认文本模型；未配文本模型返回 null。
 */
export async function getTextBrain(options: { strict?: boolean } = {}): Promise<{ vendor: string; modelKey: string } | null> {
  const desktop = requireDesktopRuntime('prompt optimize')
  const pref = getAssistantModelPref()
  const res = await desktop.promptLibrary!.textBrain(pref ? { ...pref, ...(options.strict ? { strict: true } : {}) } : undefined)
  // strict = 会花钱的运行路径：Agent 选的模型此刻不可用就直接报错（带去「设置 → 模型」的签名，错误卡自带入口），不换成别家。
  if (options.strict && res?.preferredUnavailable) {
    throw new Error(`No usable text model: the model chosen in the Agent panel (${pref?.vendorKey}/${pref?.modelKey}) is unavailable. Enable it in Settings → Models, or pick another model.`)
  }
  return res?.ok && res.brain ? res.brain : null
}

export type PromptCategory = 'all' | 'image' | 'video'

/** 搜索一条提示词：标题、正文、来源、已有标签；精选条目的双语标题 / 组名都参与匹配（中文搜「转台」英文搜 "turntable" 都能中）。 */
export function matchesPromptQuery(item: LibraryPrompt, keyword: string): boolean {
  return matchesLibraryQuery(
    {
      title: item.title,
      description: item.prompt,
      keywords: [
        item.source,
        ...item.tags,
        ...([item.curation?.title['zh-CN'], item.curation?.title.en,
          item.curation?.group['zh-CN'], item.curation?.group.en].filter(Boolean) as string[]),
      ],
    },
    keyword,
  )
}

/** 平凡过滤：类型（全部 / 图片 / 视频）+ 关键词。来源不再单独筛（来源标签那一长排并进了提示词库的分类列）。 */
export function filterPrompts(items: LibraryPrompt[], category: PromptCategory, keyword: string): LibraryPrompt[] {
  return items.filter((item) => (category === 'all' || item.promptType === category) && matchesPromptQuery(item, keyword))
}
