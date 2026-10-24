import { z } from 'zod'
import { quantizeShotSeconds } from './shotTime'

const identitySchema = z.string().trim().min(1)
const viewSchema = z.object({
  selectedRowIds: z.array(identitySchema).refine((ids) => new Set(ids).size === ids.length),
  density: z.enum(['auto', 'full', 'compact', 'card']),
  /**
   * 行高三档（拆解表节点浮条的 − / + ，2026-10-18 拆解前选模型）：紧凑 44 · 标准 58 · 大图 92。
   * 缺席 = 标准；只在用户动过时写，老表读回来就是标准。
   */
  rowHeight: z.enum(['compact', 'standard', 'large']).optional(),
}).strict()
const commonShape = {
  schemaVersion: z.literal(1),
  view: viewSchema,
  revision: z.number().int().nonnegative().safe(),
  updatedAt: z.string().datetime(),
}

/**
 * 「这次切点检测给全了没有」——**唯一 owner 在这里**。
 *
 * 为什么住在 shared 而不是 `electron/video/detectShotCuts.ts`：它有三个跨进程的读侧
 * （切镜面板 / 拆解引擎 / 分镜表快照），而 2026-09-22 之前的那个 `truncated: boolean`
 * 恰恰是因为**没有一个跨侧的 owner**，被拆解那条路整个丢掉了而编译器一声不吭。
 * 放在这里，schema 和类型就是同一份，读侧再想「只取我关心的那几个字段」也绕不开它。
 *
 * 语义：超上限时我们**抬分数阈值**（不是砍时间），所以「表变短」而「整条片子仍在表里」。
 */
export const shotCutCoverageSchema = z.object({
  /** ffmpeg 在检测下限上一共报了多少刀（已去掉「同一刀两帧」）。 */
  detectedCuts: z.number().int().nonnegative(),
  /** 这次实际采用了多少刀。 */
  keptCuts: z.number().int().nonnegative(),
  /** 为压到上限而实际生效的分数阈值；没压过就是检测下限。 */
  appliedThreshold: z.number().finite().nonnegative(),
  /** 是否因为上限而没给全。 */
  capped: z.boolean(),
  /** 采用的切点覆盖到第几秒。 */
  coveredSeconds: z.number().finite().nonnegative(),
  /** 全片多长。 */
  durationSeconds: z.number().finite().nonnegative(),
}).strict()
export type ShotCutCoverage = z.infer<typeof shotCutCoverageSchema>

export const shotTableColumnSchema = z.object({
  columnId: identitySchema,
  kind: z.enum(['builtin', 'custom']),
  labelKey: identitySchema,
  order: z.number().finite(),
  visible: z.boolean(),
  hint: z.string().optional(),
}).strict()

export const shotTableFactRowSchema = z.object({
  rowId: identitySchema,
  order: z.number().finite(),
  startSeconds: z.number().finite().nonnegative(),
  endSeconds: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().nonnegative(),
  carriedOver: z.boolean(),
  visionFailed: z.boolean().optional(),
  /** 这一镜为什么没读出来（供应商原话 / 抽帧失败 / 模型回了非 JSON）。空格子背后总有一句能说的话（2026-10-11）。 */
  failureReason: z.string().optional(),
  keyframeRef: z.string().startsWith('nomi-local://').optional(),
  cells: z.record(z.string()),
  imagePrompt: z.string().optional(),
  motionPrompt: z.string().optional(),
}).strict().refine((row) => row.endSeconds >= row.startSeconds, {
  message: 'Fact row end must not precede start',
// Every read and write of a fact row goes through this schema (`readShotTable` /
// `normalizeShotTableMeta` / `deconstructionShotTableSchema.parse`), so quantizing here is what
// normalizes the long-decimal rows already sitting in saved projects — no display-side fallback.
// `durationSeconds` is derived from the quantized ends instead of trusted: it was never a second
// truth, only a cached subtraction.
}).transform((row) => {
  const startSeconds = quantizeShotSeconds(row.startSeconds)
  const endSeconds = quantizeShotSeconds(row.endSeconds)
  return { ...row, startSeconds, endSeconds, durationSeconds: quantizeShotSeconds(endSeconds - startSeconds) }
})

export const deconstructionShotTableSchema = z.object({
  ...commonShape,
  source: z.object({
    kind: z.literal('deconstruction'),
    sourceNodeId: identitySchema,
    sourceAssetRef: z.string().startsWith('nomi-local://').optional(),
    title: z.string(),
    durationSeconds: z.number().finite().nonnegative().transform(quantizeShotSeconds).optional(),
    /**
     * 拆解这条参考片的生命周期。**终态保证（T-ED-06）**：`running` 之外每一格都是终态，
     * 而 `running` 只在**这个渲染进程真有一次在飞调用**时才成立——判据是
     * `src/workbench/generationCanvas/nodes/shotTable/deconstructionLifecycle.ts` 的在飞登记，
     * 不是磁盘上这个字段本身。五格为什么不能合并见
     * `docs/fixes/2026-09-22-deconstruction-node-terminal-state.root-cause.json`。
     */
    status: z.enum(['idle', 'running', 'ready', 'failed', 'interrupted', 'cancelled']),
    phase: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    failedShotIndexes: z.array(z.number().int().nonnegative()).optional(),
    errorMessage: z.string().optional(),
    /**
     * 阶段内部那句更细的进度话（「首次使用本地转写，正在下载引擎与模型 120/575 MB」）。
     * 与 `errorMessage` **分开两个字段**：错误是红的、带 role=alert，进度不是——
     * 共用一个字段就等于把每一条进度都渲染成一次失败。
     */
    progressDetail: z.string().optional(),
    /**
     * 这次失败是**哪一类**的机器可读判据。今天只有一个值：`local-speech`（本地离线转写那一路挂了）。
     * 为什么需要它而不是让 UI 去认错误文案：文案会翻译、会改写，拿它当判据就是把
     * 「给不给『改用云端』这个出口」这件事绑在字符串比对上——那正是最容易静默失效的那种判据。
     */
    failureKind: z.literal('local-speech').optional(),
    /**
     * 用户在分镜表底栏给**读图腿**选的模型（与转写腿的显式身份同形）。缺席 = 自动挑。
     * 整表重拆与单镜重试都带它——换了模型的人重试不会悄悄退回默认。身份必须是双段 (vendorKey, modelKey)。
     */
    visionModel: z.object({ vendorKey: z.string().min(1), modelKey: z.string().min(1) }).strict().optional(),
    /**
     * 用户在拆解栏给**转写腿**选的模型（与 `visionModel` 同形，2026-10-18 拆解前选模型）。缺席 = 自动挑。
     * 整表重拆带它；「改用云端重试」是另一个显式动作，不改写它。
     */
    transcribeModel: z.object({ vendorKey: z.string().min(1), modelKey: z.string().min(1) }).strict().optional(),
    /**
     * 这张表是不是整条片子（切点超上限时自动抬了阈值）。
     *
     * `.optional()` 只为**已经存在的老项目**：2026-09-22 之前落盘的表里没有这一块，
     * 读不回来不该让整张表 parse 失败。新写入一律带着它——写侧的类型是**必填**的
     * （`DeconstructionResult.cutCoverage`），所以「忘了带」在编译期就过不去，
     * 这里的 optional 不是一条可以走的后路。
     */
    cutCoverage: shotCutCoverageSchema.optional(),
  }).strict(),
  columnSetId: z.literal('facts'),
  columns: z.array(shotTableColumnSchema).refine((columns) => new Set(columns.map((column) => column.columnId)).size === columns.length),
  rows: z.array(shotTableFactRowSchema).refine((rows) => new Set(rows.map((row) => row.rowId)).size === rows.length),
}).strict()

/** Cross-process persistence owner. 现在只剩拆解（参考片）这一种表：分镜表 / Agent 分镜表在 0.24 退役（镜头只在画布节点里，列表是它的视图）。 */
export const shotTableDocumentSchema = deconstructionShotTableSchema
export type DeconstructionShotTableDocument = z.infer<typeof deconstructionShotTableSchema>
export type ShotTableDocument = DeconstructionShotTableDocument
export type ShotTableColumn = z.infer<typeof shotTableColumnSchema>
export type ShotTableFactRow = z.infer<typeof shotTableFactRowSchema>

export function readShotTable(meta: unknown): ShotTableDocument | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const parsed = shotTableDocumentSchema.safeParse((meta as Record<string, unknown>).shotTable)
  return parsed.success ? parsed.data : undefined
}

/** Snapshot readers fail closed instead of dropping a future or corrupt table. */
export function normalizeShotTableMeta(meta: unknown): Record<string, unknown> {
  const value = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : {}
  return { ...value, shotTable: shotTableDocumentSchema.parse(value.shotTable) }
}

/**
 * 0.23.1 及更早写过的两种已退役表来源（分镜表 storyboard、Agent 分镜表 production）。
 * 它们只是画布节点的另一种展示，不存任何一行；现行 schema 不再认它们，读取时整节点丢掉
 * （迁移入口：project/storyboardTableRetirement，镜头节点、方案一个不动）。
 */
const RETIRED_SHOT_TABLE_SOURCES: ReadonlySet<string> = new Set(['storyboard', 'production'])
export function isRetiredShotTableNode(node: { kind?: unknown; meta?: unknown }): boolean {
  if (node.kind !== 'shot_table') return false
  const meta = node.meta && typeof node.meta === 'object' ? node.meta as Record<string, unknown> : {}
  const table = meta.shotTable && typeof meta.shotTable === 'object' ? meta.shotTable as Record<string, unknown> : {}
  const source = table.source && typeof table.source === 'object' ? table.source as Record<string, unknown> : {}
  return typeof source.kind === 'string' && RETIRED_SHOT_TABLE_SOURCES.has(source.kind)
}

/**
 * 拆解进度。`phase` 是三大阶段（切点 / 读图 / 对白）；`detail` 是**阶段内部**那句更细的话
 * （「下载引擎与权重 120/575 MB」「转写第 2/6 段」）。
 *
 * 为什么要 detail：云端转写几秒就回来了，一个阶段名够用；本地转写第一次用要先下几百 MB、
 * 之后按段跑几分钟——一条没有进度的几分钟等待在用户那里和「卡死了」长得一模一样。
 * 文案在主进程按用户语言生成（`desktopT`），渲染层原样显示，不在两边各拼一次。
 */
export type DeconstructionProgress = { requestId: string; projectId: string; phase: 0 | 1 | 2; detail?: string }

/**
 * 拆解「短片不弹报价卡，长片才弹」的分界（2026-10-18 用户拍板）：一共不超过这么多次调用（读图 N 镜 + 转写）时，点「拆解」那一下就是确认。
 * 主进程的钱闸（electron/video/deconstructSpend.ts）与拆解栏的说明文案读同一个数。
 */
export const DECONSTRUCT_ASK_ABOVE_CALLS = 30
