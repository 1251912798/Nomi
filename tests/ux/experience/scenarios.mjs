// 场景清单的校验（只检结构，不判「好不好」）。清单本身在 tests/ux/journeys/catalog.json 的 scenarios 里。
// 研究候选和可执行的区别由状态字段分开：旧 runner（scripts/feel-nightly.mjs）只读 journeys，从不读 scenarios，
// 所以候选不会被执行；可执行条目必须指到一个真能跑的东西，否则就是挂名。
export const SCENARIO_STATUS = ['research-candidate', 'executable']
export const SCENARIO_REQUIRED = ['id', 'title', 'source', 'creator', 'moment', 'frequencyEvidence', 'successEnd', 'failureGuard', 'status', 'owner']
export const ACTIVE_SCENARIO_CAP = 12
const SOURCE_KINDS = ['用户原话', 'issue', '走查', '调研报告']
const text = (value) => typeof value === 'string' && value.trim().length > 0

/** 返回问题列表（空 = 通过）。fileExists(相对路径) 由调用方提供，单测里可注入。 */
export function validateUxScenarios(catalog, { fileExists = () => true } = {}) {
  const problems = []
  const list = catalog.scenarios
  if (!Array.isArray(list) || list.length === 0) return ['catalog.scenarios 缺失或为空']
  if (list.length > ACTIVE_SCENARIO_CAP) problems.push(`场景清单 ${list.length} 条，超过试行上限 ${ACTIVE_SCENARIO_CAP}`)
  const journeyById = new Map((catalog.journeys ?? []).map((journey) => [journey.id, journey]))
  const seen = new Set()
  for (const scenario of list) {
    const label = scenario?.id ?? '(无 id)'
    for (const key of SCENARIO_REQUIRED) {
      if (key === 'source') continue
      if (!text(scenario?.[key])) problems.push(`${label}：缺字段 ${key}`)
    }
    if (seen.has(scenario?.id)) problems.push(`${label}：id 重复`)
    seen.add(scenario?.id)
    if (!SOURCE_KINDS.includes(scenario?.source?.kind) || !text(scenario?.source?.ref)) problems.push(`${label}：source 要 { kind: ${SOURCE_KINDS.join(' / ')}, ref: 出处 }`)
    if (!SCENARIO_STATUS.includes(scenario?.status)) problems.push(`${label}：status 只能是 ${SCENARIO_STATUS.join(' / ')}`)
    if (/^\s*高频\s*$/.test(String(scenario?.frequencyEvidence ?? ''))) problems.push(`${label}：频率证据不能只写「高频」；没有证据写「未知」`)
    if (scenario?.status === 'executable') {
      const journey = scenario.journey ? journeyById.get(scenario.journey) : null
      const walkOk = text(scenario.walk) && fileExists(scenario.walk)
      if (scenario.journey && !(journey && journey.runner)) problems.push(`${label}：executable 的 journey「${scenario.journey}」不存在或没有 runner`)
      else if (!scenario.journey && !walkOk) problems.push(`${label}：executable 要有 journey（带 runner 的旅程）或存在的 walk 脚本`)
    } else if (scenario?.status === 'research-candidate' && (scenario.journey || scenario.walk)) {
      problems.push(`${label}：研究候选不能挂 journey / walk；有了可重跑脚本就把 status 改成 executable`)
    }
  }
  return problems
}
