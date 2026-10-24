/**
 * 3D-BOX 预演状态词表与「花钱闸为什么挡」原因词表的唯一 owner：主进程合同、画布读取视图、渲染端写入与预演状态机、主进程准入都从这里取，不各抄一份。
 * none = 没有挂预演；其余三个是预演自己的生命周期。
 */
export const DIRECTOR_PREVIEW_STATUSES = ["none", "rendering", "ready", "failed"] as const;
export type DirectorPreviewStatus = (typeof DIRECTOR_PREVIEW_STATUSES)[number];

/**
 * 3D-BOX 花钱闸挡住一镜的原因（跨进程合同的唯一 owner：渲染端 directorPreviewState 判、主进程单镜 Run 准入与 Agent 回执消费）。
 * rendering = 预演还在渲染；failed = 预演失败；stale = 预演挂上之后导演工程又被改过（过期，要先重渲）。
 */
export const DIRECTOR_PREVIEW_SPEND_BLOCK_REASONS = ["rendering", "failed", "stale", "not_attached"] as const;
export type DirectorPreviewSpendBlockReason = (typeof DIRECTOR_PREVIEW_SPEND_BLOCK_REASONS)[number];

/**
 * 主进程准入认渲染端 `director.preview-blocks` 回包的唯一解析。回包里有一条挡住 → 一定挡：
 * 认得的原因原样交回；认不得的（渲染端比主进程新、或回包坏了）按 `unrecognized` 挡，**绝不当成放行**（fail-closed）。
 * 没有挡住的条目 = 这一镜不被预演挡。
 */
export function parseDirectorPreviewBlockReply(reply: unknown): DirectorPreviewSpendBlockReason | "unrecognized" | null {
  const blocks = reply && typeof reply === "object" ? (reply as { blocks?: unknown }).blocks : undefined;
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const reason = (blocks[0] as { reason?: unknown } | null)?.reason;
  return (DIRECTOR_PREVIEW_SPEND_BLOCK_REASONS as readonly unknown[]).includes(reason) ? (reason as DirectorPreviewSpendBlockReason) : "unrecognized";
}
