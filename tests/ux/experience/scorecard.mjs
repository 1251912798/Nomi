// 体验成绩单：一份 JSON 记录 → 一页 Markdown。
// 它是原「测试表 / 验收页」的摘要入口，不是第二套量具：机器数据由 collect.mjs 采、steps.json 里来（machineFromRun），
// 没接采集器的走查先手工填，并在 basis 里写明是「脚本计数」还是「估算」。
// 铁规矩（R-uxprocess §6.2 / §5）：
//   · 机器数据和真人数据分开记；真人的 SEQ（1–7）和人工事件（误点 / 回退 / 求助 / 首次尝试）没有就是 null，AI 不许代填；
//   · 不出总分——这里没有任何把几项合成一个数的代码，记录里出现 total / overall 之类的字段直接报错；
//   · 失败要保留：attempts 里每一次尝试都列出来，完成数是「通过 / 全部」，不是只报成功那次；
//   · 没验证的写出来，写明谁来补、什么条件复查。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASIS = { measured: '实测（采集器）', 'script-count': '脚本计数（真事件，非采集器）', estimated: '估算' }
const RESULT = { pass: '通过', fail: '失败', unverified: '未验证' }
const BANNED_TOTAL_KEYS = ['total', 'totalScore', 'overall', 'overallScore', 'score', '总分']
const isNullableInt = (v, min) => v === null || (Number.isInteger(v) && v >= min)
const text = (v) => typeof v === 'string' && v.trim().length > 0
const cell = (v) => String(v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
const num = (v) => (v === null || v === undefined ? 'null' : String(v))

/** 返回问题列表（空 = 通过）。 */
export function validateScorecard(card) {
  const p = []
  if (card?.version !== 1) p.push('version 必须是 1')
  for (const key of BANNED_TOTAL_KEYS) if (key in (card ?? {})) p.push(`不出总分：记录顶层不许有 ${key}`)
  const c = card?.change ?? {}
  for (const key of ['title', 'headSha', 'userCan']) if (!text(c[key])) p.push(`change.${key} 缺失`)
  if (!text(card?.scenarioId)) p.push('scenarioId 缺失')
  if (!text(card?.verifier?.line) || !text(card?.verifier?.kind)) p.push('verifier.line / verifier.kind 缺失（谁验的）')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(card?.date ?? '')) p.push('date 要 YYYY-MM-DD')

  const m = card?.machine
  if (!m || !['collector', 'walk-log', 'report'].includes(m.source)) p.push('machine.source 要 collector / walk-log / report')
  for (const key of ['device', 'window', 'language']) if (!text(m?.env?.[key])) p.push(`machine.env.${key} 缺失（设备 / 窗口 / 语言）`)
  if (!Array.isArray(m?.attempts) || m.attempts.length === 0) p.push('machine.attempts 至少一条：失败的尝试也要列')
  for (const a of m?.attempts ?? []) {
    if (!text(a.label) || !['pass', 'fail'].includes(a.result)) p.push(`attempt「${a.label ?? '?'}」要有 label 和 result（pass / fail）`)
    if (a.result === 'fail' && !text(a.note)) p.push(`attempt「${a.label}」失败了，note 要写后果`)
  }
  for (const x of m?.metrics ?? []) {
    if (!text(x.name) || !text(x.unit)) p.push(`指标「${x.name ?? '?'}」缺 name / unit`)
    if (!(x.basis in BASIS)) p.push(`指标「${x.name}」basis 要是 ${Object.keys(BASIS).join(' / ')}`)
    if (!Number.isInteger(x.n) || x.n < 1) p.push(`指标「${x.name}」n（样本数）要 ≥ 1 的整数`)
    for (const k of ['baseline', 'current']) if (x[k] !== null && !Number.isFinite(x[k])) p.push(`指标「${x.name}」${k} 要是有限数字或 null`)
    if (x.current === null && !text(x.note)) p.push(`指标「${x.name}」没采到（current: null），note 要写为什么`)
  }

  const h = card?.human
  if (!h || !('seq' in h) || !('events' in h)) p.push('human.seq / human.events 必须在（没有就写 null）')
  if (h?.seq !== null && h?.seq !== undefined) {
    if (!Array.isArray(h.seq)) p.push('human.seq 要是 null 或数组')
    for (const s of h.seq ?? []) {
      const ok = s.score === null || (Number.isInteger(s.score) && s.score >= 1 && s.score <= 7)
      if (!ok) p.push('SEQ 分数要是 1–7 的整数或 null')
      if (s.score !== null && (s.rater !== 'human' || !text(s.participant))) p.push('SEQ 有分数就必须 rater: "human" 并写参与者；AI 不许替人打分')
    }
  }
  const ev = h?.events
  if (ev !== null && ev !== undefined) {
    for (const k of ['misclicks', 'backtracks', 'helpRequests']) if (!isNullableInt(ev[k], 0)) p.push(`human.events.${k} 要是 ≥0 整数或 null`)
    const f = ev.firstAttemptSuccess
    if (f !== null && f !== undefined && !(isNullableInt(f.n, 0) && isNullableInt(f.d, 1))) p.push('human.events.firstAttemptSuccess 要是 { n, d } 或 null')
    const anyEvent = ['misclicks', 'backtracks', 'helpRequests'].some((k) => ev[k] !== null) || (f && f.n !== null)
    if (anyEvent && !text(h.observer)) p.push('人工事件有数就要写 human.observer（谁观察的）')
  }

  for (const g of card?.guardrails ?? []) if (!text(g.name) || !(g.result in RESULT)) p.push(`护栏「${g.name ?? '?'}」要有 name 和 result（pass / fail / unverified）`)
  if (!text(card?.friction?.moment) || !text(card?.friction?.decision)) p.push('friction.moment / friction.decision 缺失（最大摩擦点和怎么处理）')
  if (!Array.isArray(card?.unverified)) p.push('unverified 要是数组（没有也写 []）')
  for (const u of card?.unverified ?? []) if (!text(u.item) || !text(u.owner) || !text(u.recheck)) p.push('unverified 每条要有 item / owner / recheck')
  if (!Array.isArray(card?.evidence) || card.evidence.length === 0) p.push('evidence 至少一条路径')
  return p
}

/** 从采集器的一次运行（steps.json）里取出机器数据：每步一次尝试，失败步骤原样保留。 */
export function machineFromRun(run) {
  const steps = run.steps ?? []
  const sum = (key) => steps.reduce((a, s) => a + (s.metrics?.[key] ?? 0), 0)
  const nonNull = (key) => steps.map((s) => s.metrics?.[key]).filter((v) => Number.isFinite(v))
  const attempts = steps.map((s) => ({ label: s.id, result: s.status === 'completed' ? 'pass' : 'fail', ...(s.error ? { note: s.error } : {}) }))
  // 步骤没走完（计划 N 步只走了 M 步）也是失败，不能只报走到的那几步
  for (const id of (run.expectedSteps ?? []).slice(steps.length)) attempts.push({ label: id, result: 'fail', note: '没有执行到这一步' })
  if (run.status !== 'completed') attempts.push({ label: '成功终点断言', result: 'fail', note: run.error ?? run.outcome?.assertion ?? '旅程没有拿到已验证的成功终点' })
  const dom = steps[0]?.before?.dom
  const metric = (name, unit, current, note) => ({ name, unit, baseline: null, current, n: 1, basis: 'measured', ...(note ? { note } : {}) })
  const feedback = nonNull('feedbackMs')
  return {
    source: 'collector',
    runId: run.identity?.runId ?? null,
    applicationSha: run.identity?.applicationSha ?? null,
    env: {
      device: run.identity?.compatibility?.platform ?? 'unknown',
      window: dom?.viewport ? `${dom.viewport.width}×${dom.viewport.height}@${dom.viewport.dpr}` : 'unknown',
      language: dom?.lang ?? 'unknown',
      theme: dom?.theme ?? 'unknown',
    },
    attempts,
    metrics: [
      metric('点击', '次', sum('clicks')),
      metric('输入事件', '次', sum('inputs')),
      metric('按键', '次', sum('keys')),
      metric('面板切换', '次', sum('panelSwitches')),
      metric('确认', '次', sum('confirmations')),
      metric('各步完成耗时合计', 'ms', Math.round(sum('completionMs')), 'loopback，不是供应商服务时间；不是 INP'),
      metric('最慢的一步反馈', 'ms', feedback.length ? Math.round(Math.max(...feedback)) : null, feedback.length ? undefined : '没有步骤声明反馈选择器'),
    ],
  }
}

/** 渲染一页 Markdown。纯函数：同一份记录永远得到同一页。 */
export function renderScorecard(card) {
  const problems = validateScorecard(card)
  if (problems.length) throw new Error(`成绩单记录不合格：\n- ${problems.join('\n- ')}`)
  const { change: c, machine: m, human: h } = card
  const passed = m.attempts.filter((a) => a.result === 'pass').length
  const failed = m.attempts.length - passed
  const first = h.events?.firstAttemptSuccess
  const L = []
  L.push(`# 体验成绩单：${c.title}`, '')
  L.push(`- 改动：${c.title}${c.pr ? `（#${c.pr}）` : ''}`)
  L.push(`- 验收 head：\`${c.headSha}\`${c.headNote ? `（${c.headNote}）` : ''}`)
  if (c.headFollowUp) L.push(`  - ${c.headFollowUp}`)
  L.push(`- 场景 id：\`${card.scenarioId}\``)
  L.push(`- 谁验：${card.verifier.line}（${card.verifier.kind}）`)
  L.push(`- 日期：${card.date}${card.compiledBy ? `；成绩单整理：${card.compiledBy}` : ''}`, '')
  L.push(`**用户这次能完成：**${c.userCan}`, '')
  L.push(`**能力变化：**新增：${(c.added ?? []).join('、') || '无'}；改变：${(c.changed ?? []).join('、') || '无'}；去掉：${(c.removed ?? []).join('、') || '无'}`, '')

  L.push('## 结果', '')
  L.push(`- 机器：完成 **${passed} / ${m.attempts.length}**（失败 ${failed} 条，原样列在下表，不丢）`)
  L.push(`- 首次尝试成功：${first && first.n !== null ? `${first.n} / ${first.d}（真人观察）` : 'null（未采集：需要真人首次操作，AI 不代填）'}`, '')
  L.push('| 尝试 | 结果 | 说明 | 证据 |', '| --- | --- | --- | --- |')
  for (const a of m.attempts) L.push(`| ${cell(a.label)} | ${a.result === 'pass' ? '通过' : '**失败**'} | ${cell(a.note ?? '')} | ${cell(a.evidence ?? '')} |`)
  L.push('')

  L.push('## 机器测的', '')
  L.push(`来源：${m.source}${m.runId ? ` · run ${m.runId}` : ''}${m.applicationSha ? ` · 应用 ${m.applicationSha}` : ''}`)
  L.push(`设备 / 窗口 / 语言：${m.env.device} / ${m.env.window} / ${m.env.language}${m.env.theme ? ` / ${m.env.theme}` : ''}${m.env.boundary ? `。边界：${m.env.boundary}` : ''}`, '')
  L.push('| 主指标 / 指标 | 现状 → 当前 | 单位 | 样本数 | 口径 | 备注 |', '| --- | --- | --- | --- | --- | --- |')
  for (const x of m.metrics ?? []) L.push(`| ${cell(x.name)} | ${num(x.baseline)} → ${num(x.current)} | ${cell(x.unit)} | ${x.n} | ${x.current === null ? '未采' : BASIS[x.basis]} | ${cell(x.note ?? '')} |`)
  L.push('')

  L.push('## 真人给的（和上面分开记）', '')
  const seqRows = Array.isArray(h.seq) ? h.seq : []
  if (seqRows.length === 0 || seqRows.every((s) => s.score === null)) L.push('- SEQ（1–7）：null（未采集）')
  else for (const s of seqRows) L.push(`- SEQ（1–7）：${num(s.score)}，参与者 ${s.participant}，任务 ${s.task ?? card.scenarioId}`)
  const ev = h.events ?? {}
  L.push(`- 误点：${num(ev.misclicks)} · 回退：${num(ev.backtracks)} · 求助：${num(ev.helpRequests)} · 首次尝试成功：${first && first.n !== null ? `${first.n}/${first.d}` : 'null'}`)
  if (h.observer) L.push(`- 观察者：${h.observer}`)
  if (h.note) L.push(`- 说明：${h.note}`)
  L.push('')

  L.push('## 护栏', '', '| 护栏 | 结果 | 证据 / 说明 |', '| --- | --- | --- |')
  for (const g of card.guardrails ?? []) L.push(`| ${cell(g.name)} | ${g.result === 'fail' ? '**失败**' : RESULT[g.result]} | ${cell(g.evidence ?? '')} |`)
  L.push('')

  L.push('## 最大摩擦点与决定', '')
  L.push(`- 摩擦：${card.friction.moment}`)
  L.push(`- 决定：${card.friction.decision}`)
  L.push(`- 协调决定：${card.coordinatorDecision ?? '待协调（通过 / 退回 / 明示延期）'}`, '')

  L.push('## 没验证的', '', '| 缺口 | owner | 复查条件 |', '| --- | --- | --- |')
  for (const u of card.unverified) L.push(`| ${cell(u.item)} | ${cell(u.owner)} | ${cell(u.recheck)} |`)
  if (card.unverified.length === 0) L.push('| （无） | | |')
  L.push('', '## 证据路径', '')
  for (const e of card.evidence) L.push(`- ${e}`)
  L.push('', '> 这一页不出总分：机器数、真人数、护栏、未验证各看各的。')
  return L.join('\n') + '\n'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // node tests/ux/experience/scorecard.mjs <记录.json> [--check]   默认把 <记录>.md 写在 JSON 旁边；--check 只核对已有 md 是不是这份记录渲染出来的
  const file = path.resolve(process.argv[2] ?? '')
  const card = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = file.replace(/\.json$/, '.md')
  const page = renderScorecard(card)
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== page) {
      console.error(`成绩单页与记录不一致：${out}（重新生成：node tests/ux/experience/scorecard.mjs ${path.relative(process.cwd(), file)}）`)
      process.exitCode = 1
    } else console.log(`成绩单一致：${out}`)
  } else {
    fs.writeFileSync(out, page)
    console.log(`成绩单已生成：${out}`)
  }
}
