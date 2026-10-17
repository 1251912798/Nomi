/**
 * 「界面流畅度」分档数字的中立契约：渲染层采集、主进程白名单、反馈包、雷达都依赖这一份。
 *
 * 只有**分档标签**，没有原始毫秒、没有时间序列、没有任何内容 / 路径 / 型号：
 * 原数在小样本上就是指纹，分档回答的只是「卡不卡、卡在哪一档」。
 * 采集用浏览器标准接口（Event Timing 与 INP 同口径、Long Animation Frames），不自写剖析器。
 *
 * 想加一个字段：在 PERF_FIELD_VALUES 里登记它的全部合法取值，白名单、校验、测试跟着变；
 * 这一格是用户在设置页看得见的告知范围的一部分，加之前先改告知文字与 TELEMETRY_SCOPE_VERSION。
 */
export const PERF_FIELD_VALUES = {
  /** 点击 / 按键之后到下一帧画出来的耗时，会话内 p75。口径同 INP（良好 ≤200ms、较差 >500ms）。 */
  interactionP75: ['none', 'lt-100', '100-200', '200-500', 'gt-500'],
  interactionP95: ['none', 'lt-100', '100-200', '200-500', 'gt-500'],
  /** 每分钟长帧（>50ms）次数。 */
  longFramesPerMin: ['0', '1-3', '4-10', 'gt-10'],
  /** 会话内最长的一帧。 */
  longestFrame: ['none', '50-100', '100-250', '250-1000', 'gt-1000'],
  /** 这份汇总覆盖了多久。 */
  observedMinutes: ['lt-5', '5-30', 'gt-30'],
  /** 汇总时所在的页。 */
  page: ['library', 'creation', 'storyboard', 'generation', 'preview'],
  nodes: ['0', '1-20', '21-100', '101-300', 'gt-300'],
  imageNodes: ['0', '1-20', '21-100', '101-300', 'gt-300'],
  generating: ['true', 'false'],
  cpuCores: ['le4', '5-8', '9-16', 'gt16', 'unknown'],
  memoryGb: ['le2', '4', '8plus', 'unknown'],
} as const

export type PerfField = keyof typeof PERF_FIELD_VALUES
export const PERF_FIELDS = Object.keys(PERF_FIELD_VALUES) as PerfField[]

export type PerfSummaryProps = {
  interactionP75: typeof PERF_FIELD_VALUES.interactionP75[number]
  interactionP95: typeof PERF_FIELD_VALUES.interactionP95[number]
  longFramesPerMin: typeof PERF_FIELD_VALUES.longFramesPerMin[number]
  longestFrame: typeof PERF_FIELD_VALUES.longestFrame[number]
  observedMinutes: typeof PERF_FIELD_VALUES.observedMinutes[number]
  page: typeof PERF_FIELD_VALUES.page[number]
  nodes: typeof PERF_FIELD_VALUES.nodes[number]
  imageNodes: typeof PERF_FIELD_VALUES.imageNodes[number]
  /** 布尔：随事件白名单的「全原始值」规则以 boolean 出现。 */
  generating: boolean
  cpuCores: typeof PERF_FIELD_VALUES.cpuCores[number]
  memoryGb: typeof PERF_FIELD_VALUES.memoryGb[number]
}

/** 白名单校验：键集合必须恰好等于 PERF_FIELDS，每格取值必须在登记表里。多一个键就是 false。 */
export function isPerfSummaryProps(value: unknown): value is PerfSummaryProps {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const props = value as Record<string, unknown>
  const keys = Object.keys(props)
  if (keys.length !== PERF_FIELDS.length || !PERF_FIELDS.every((key) => key in props)) return false
  return PERF_FIELDS.every((key) => {
    const item = props[key]
    if (key === 'generating') return typeof item === 'boolean'
    return typeof item === 'string' && (PERF_FIELD_VALUES[key] as readonly string[]).includes(item)
  })
}

function bucketBy<T extends string>(value: number, steps: ReadonlyArray<readonly [number, T]>, top: T): T {
  for (const [limit, label] of steps) if (value < limit) return label
  return top
}

/** 单次交互耗时（ms）→ 档。左闭右开：100 落在 100-200，200 落在 200-500（INP「良好」是 ≤200，边界归较差档的口径差 1ms 可忽略）。 */
export function interactionBucket(ms: number | null): PerfSummaryProps['interactionP75'] {
  if (ms === null || !Number.isFinite(ms)) return 'none'
  return bucketBy(ms, [[100, 'lt-100'], [200, '100-200'], [500, '200-500']], 'gt-500')
}

export function longFramesPerMinBucket(count: number, minutes: number): PerfSummaryProps['longFramesPerMin'] {
  if (!Number.isFinite(count) || count <= 0) return '0'
  // 窗口不足一分钟按一分钟算：几秒钟里的两次长帧不该被放大成「每分钟二十几次」。
  const rate = count / Math.max(minutes, 1)
  if (rate <= 3) return '1-3'
  if (rate <= 10) return '4-10'
  return 'gt-10'
}

export function longestFrameBucket(ms: number | null): PerfSummaryProps['longestFrame'] {
  if (ms === null || !Number.isFinite(ms) || ms < 50) return 'none'
  return bucketBy(ms, [[100, '50-100'], [250, '100-250'], [1000, '250-1000']], 'gt-1000')
}

export function observedMinutesBucket(minutes: number): PerfSummaryProps['observedMinutes'] {
  if (!Number.isFinite(minutes) || minutes < 5) return 'lt-5'
  return minutes <= 30 ? '5-30' : 'gt-30'
}

export function countBucket(count: number): PerfSummaryProps['nodes'] {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count <= 20) return '1-20'
  if (count <= 100) return '21-100'
  return count <= 300 ? '101-300' : 'gt-300'
}

export function cpuCoresBucket(cores: number | undefined): PerfSummaryProps['cpuCores'] {
  if (typeof cores !== 'number' || !Number.isFinite(cores) || cores <= 0) return 'unknown'
  if (cores <= 4) return 'le4'
  if (cores <= 8) return '5-8'
  return cores <= 16 ? '9-16' : 'gt16'
}

/** navigator.deviceMemory 本身就是被浏览器粗化过的值（0.25…8，上限 8），这里再并成三档。 */
export function memoryBucket(gb: number | undefined): PerfSummaryProps['memoryGb'] {
  if (typeof gb !== 'number' || !Number.isFinite(gb) || gb <= 0) return 'unknown'
  if (gb <= 2) return 'le2'
  return gb < 8 ? '4' : '8plus'
}

/** 取已排序数组的分位（最近秩法）。空数组给 null。 */
export function percentile(sortedAscending: readonly number[], p: number): number | null {
  if (sortedAscending.length === 0) return null
  const index = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAscending.length) - 1))
  return sortedAscending[index] ?? null
}
