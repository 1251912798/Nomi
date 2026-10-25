// 拆解效果评测的打分（纯函数，单测钉住）：输入一次 `nomiDesktop.video.deconstruct` 的结果，输出这一条片子的指标。
// 由来：用户 2026-10-18「注意做真实付费测试以及效果测试 构建指标」。跑法见同目录 run.mjs。
//
// 指标只取「用户拿到表时看得见、会在意」的东西，不取模型内部量：
//   · readRate      读图成功率：没有 visionFailed 的镜 / 全部镜
//   · fill.<字段>    字段填充率：画面 / 景别 / 情绪 / 运镜提示词 非空的镜 / 读出的镜
//   · shotSizeValid 景别合规率：景别在提示词给的六档里（极特写/特写/近景/中景/全景/远景）/ 读出的镜
//   · dialogue      有音轨时：对白非空的镜占比；给了参考稿时再算 CER（字错率，对参考稿里最像的那一段算，参考稿比片子长）
//   · zhRate.<字段>  中文界面下字段是不是中文（含汉字的镜 / 有值的镜）：表里一列中文一列英文，用户读着就是坏的
//   · calls         读图调用次数 = 镜数（报价 = 实际，多一次都不行）
//   · secondsPerShot 每镜耗时

export const SHOT_SIZES = Object.freeze(['极特写', '特写', '近景', '中景', '全景', '远景'])

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '' && value.trim() !== '—'
const ratio = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null)

/** 只留汉字、字母、数字（标点 / 空白 / 大小写不算错）。 */
export function normalizeForCer(text) {
  return String(text ?? '').toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '')
}

/** 编辑距离（字级）。 */
function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[b.length]
}

/**
 * 字错率：转写结果对参考稿里**最像的那一段**（参考稿通常是整条片子的逐字稿，评测只截了一段）。
 * 窗口长度 = 转写长度，起点按 1/8 窗口步进；返回 null = 没有可比的文本。
 */
export function bestWindowCer(hypothesis, reference) {
  const hyp = normalizeForCer(hypothesis)
  const ref = normalizeForCer(reference)
  if (!hyp || !ref) return null
  const width = Math.min(hyp.length, ref.length)
  const step = Math.max(1, Math.floor(width / 8))
  let best = Infinity
  for (let start = 0; start + width <= ref.length; start += step) best = Math.min(best, levenshtein(hyp, ref.slice(start, start + width)))
  if (ref.length - width > 0) best = Math.min(best, levenshtein(hyp, ref.slice(ref.length - width)))
  return Math.round((best / hyp.length) * 1000) / 1000
}

/**
 * @param {{ shots: Array<Record<string, unknown>>, hasAudio?: boolean, failedShotIndexes?: number[] }} result
 * @param {{ reference?: string, visionCalls?: number, seconds?: number }} [context]
 */
export function scoreDeconstruction(result, context = {}) {
  const shots = Array.isArray(result?.shots) ? result.shots : []
  const read = shots.filter((shot) => !shot.visionFailed)
  const fill = Object.fromEntries(['visual', 'shotSize', 'mood', 'imagePrompt'].map((field) => [field, ratio(read.filter((shot) => nonEmpty(shot[field])).length, read.length)]))
  const dialogueText = shots.map((shot) => (nonEmpty(shot.dialogue) ? String(shot.dialogue) : '')).join('')
  return {
    shots: shots.length,
    readRate: ratio(read.length, shots.length),
    fill,
    zhRate: Object.fromEntries(['visual', 'motionPrompt'].map((field) => {
      const filled = read.filter((shot) => nonEmpty(shot[field]))
      return [field, ratio(filled.filter((shot) => /\p{Script=Han}/u.test(String(shot[field]))).length, filled.length)]
    })),
    shotSizeValid: ratio(read.filter((shot) => SHOT_SIZES.includes(String(shot.shotSize ?? '').trim())).length, read.length),
    hasAudio: Boolean(result?.hasAudio),
    dialogueShotRate: result?.hasAudio ? ratio(shots.filter((shot) => nonEmpty(shot.dialogue)).length, shots.length) : null,
    dialogueCer: result?.hasAudio && context.reference ? bestWindowCer(dialogueText, context.reference) : null,
    visionCalls: context.visionCalls ?? null,
    callsMatchShots: typeof context.visionCalls === 'number' ? context.visionCalls === shots.length : null,
    secondsPerShot: typeof context.seconds === 'number' && shots.length ? Math.round((context.seconds / shots.length) * 10) / 10 : null,
    failureReasons: [...new Set(shots.map((shot) => shot.failureReason).filter(Boolean))].slice(0, 3),
    // 整次层面的原因（对白为什么是空的）：报告里要看得见，不只看镜头级的。
    dialogueFailure: typeof result?.failureReason === 'string' ? result.failureReason : null,
  }
}

/** 门槛（初版，第一次真跑后按实测收紧；只许变严）。返回不达标的条目，空 = 达标。 */
export const THRESHOLDS = Object.freeze({ readRate: 0.95, fillVisual: 0.95, fillShotSize: 0.9, shotSizeValid: 0.9, dialogueCer: 0.3, zhMotion: 0.9 })

/** `expectDialogue`：这段有人说话（run.mjs 的 `speech: true`）。有说话却一镜对白都没有 = 不达标——没有参考稿时 CER 是 null，旧门槛就静默放过了。 */
export function judgeCase(metrics, { expectDialogue = false } = {}) {
  const misses = []
  if (expectDialogue && !(metrics.dialogueShotRate > 0)) misses.push(`对白覆盖 ${metrics.dialogueShotRate ?? '-'}：有人说话的片子一镜对白都没有${metrics.dialogueFailure ? `（${metrics.dialogueFailure}）` : ''}`)
  if (metrics.readRate !== null && metrics.readRate < THRESHOLDS.readRate) misses.push(`读图成功率 ${metrics.readRate} < ${THRESHOLDS.readRate}`)
  if (metrics.fill.visual !== null && metrics.fill.visual < THRESHOLDS.fillVisual) misses.push(`画面填充率 ${metrics.fill.visual} < ${THRESHOLDS.fillVisual}`)
  if (metrics.fill.shotSize !== null && metrics.fill.shotSize < THRESHOLDS.fillShotSize) misses.push(`景别填充率 ${metrics.fill.shotSize} < ${THRESHOLDS.fillShotSize}`)
  if (metrics.shotSizeValid !== null && metrics.shotSizeValid < THRESHOLDS.shotSizeValid) misses.push(`景别合规率 ${metrics.shotSizeValid} < ${THRESHOLDS.shotSizeValid}`)
  if (metrics.dialogueCer !== null && metrics.dialogueCer > THRESHOLDS.dialogueCer) misses.push(`对白字错率 ${metrics.dialogueCer} > ${THRESHOLDS.dialogueCer}`)
  if (metrics.zhRate?.motionPrompt !== null && metrics.zhRate?.motionPrompt !== undefined && metrics.zhRate.motionPrompt < THRESHOLDS.zhMotion) misses.push(`运镜列中文率 ${metrics.zhRate.motionPrompt} < ${THRESHOLDS.zhMotion}（中文界面里一列英文）`)
  if (metrics.callsMatchShots === false) misses.push(`读图调用 ${metrics.visionCalls} 次 ≠ 镜数 ${metrics.shots}`)
  return misses
}
