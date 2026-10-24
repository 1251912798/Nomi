// 提示词库数据形态(单一真相源)。主进程解析公开仓库 → 这个形状 → IPC 给渲染层。
export type PromptMediaType = "image" | "video";

/** parser 产出的原子(还没补 id/source 元信息)。 */
export type ParsedPrompt = {
  title: string;
  prompt: string;
  /** 封面媒体 URL;视频源可能缺(token 失效)→ 空串,UI 显占位。 */
  mediaUrl: string;
  mediaType: PromptMediaType;
};

/**
 * 随构建走的内置包的来源 id（表情预设包 + 从技能目录投影的策展效果）。只此一份：
 * 主进程据它把内置包前置并对历史缓存去重（builtinPacks.ts），提示词库界面据它把条目归进「内置」段、
 * 其余公开条目归「公开库」段——两边不各猜一次（加内置包时漏改这里，builtinPacks.test.ts 会红）。
 */
export const BUILTIN_PROMPT_SOURCE_IDS: readonly string[] = Object.freeze(["builtin-expressions", "builtin-curated-effects"]);

export function isBuiltinPromptSourceId(sourceId: string | undefined): boolean {
  return Boolean(sourceId) && BUILTIN_PROMPT_SOURCE_IDS.includes(sourceId as string);
}

/** 提示词的参考图（网页提取的截图/原图；2026-07-22 素材面收敛随迁字段）。 */
export type PromptReferenceImage = {
  url: string;
  title?: string;
  sourceUrl?: string;
};

/** 对外的完整提示词条目。 */
export type LibraryPrompt = ParsedPrompt & {
  curation?: import("../skillCuration").SkillCuration;
  id: string;
  /** 这条提示词产出的是图还是视频(决定送上画布建哪种节点)。 */
  promptType: PromptMediaType;
  /** 来源域:public=外部公开仓库(只读);user=用户自己存的「我的库」(可改可删,用户级跨项目)。 */
  origin: "public" | "user";
  /** 人话来源标签(显示在卡片上)。 */
  source: string;
  sourceId: string;
  /** 仓库地址(详情可跳转);用户条目为空。 */
  sourceUrl: string;
  /** 用户条目最近更新时间(ISO);public 条目无。 */
  updatedAt?: string;
  /** 分类/来源标签(如「网页提取」「画面复刻」;素材盒自定义分类迁移也落这)。 */
  tags?: string[];
  /** 参考图(可多张;mediaUrl 取首图当封面)。 */
  referenceImages?: PromptReferenceImage[];
};

/**
 * 删除撤销跨 IPC 往返的完整记录。索引签名刻意允许未来字段通过 renderer，
 * 由 userPromptStore 在主进程校验记录身份并原样持久化。
 */
export type UserPromptRestoreSnapshot = LibraryPrompt & Record<string, unknown>;
