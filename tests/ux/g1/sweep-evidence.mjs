import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { screenshotSettled, scanFeel } from '../_assert.mjs'

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
}
export function scoreCollectedAgent({ tools, stations, deviations, stationId, population, attempted }) {
  const station = stations.find(row => row.id === stationId)
  const failed = deviations.some(row => row.station === stationId
    && !['station-evidence', 'visual-quiescence'].includes(row.assertion)
    && !row.assertion?.startsWith('feel:'))
  const correct = Boolean(tools[0]?.ok) && !failed
  return { population,
    firstTool: { numerator: correct ? 1 : 0, denominator: tools.length ? 1 : 0 },
    turns: { numerator: attempted && correct && station && !['running', 'unreachable'].includes(station.status) ? 1 : 0, denominator: attempted ? 1 : 0 },
    note: `Measured Agent station ${stationId}; repaired failures remain failures. ${population === 'loopback' ? 'Synthetic provider; not real-model acceptance.' : 'Text-only real provider.'}` }
}
export async function startEvidence({ app, win, directory, payload }) {
  await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
  const consoleRows = []
  const listen = source => message => consoleRows.push({ source, type: message.type(), text: message.text(), timestamp: new Date().toISOString() })
  const renderer = listen('renderer'), main = listen('main')
  win.on('console', renderer)
  app.on('console', main)
  return {
    async capture(entry) {
      const screenshot = `${entry.id}.png`, store = `${entry.id}.store.json`
      try { await screenshotSettled(win, { path: path.join(directory, screenshot) }) }
      catch (error) {
        // The failure image intentionally preserves the unsettled scene.
        await win.screenshot({ path: path.join(directory, screenshot) })
        entry.captureDeviation = error.message
      }
      entry.screenshot = screenshot
      entry.store = store
      writeJson(path.join(directory, store), await payload())
      const feel = await scanFeel(win, { label: entry.id })
      writeJson(path.join(directory, `${entry.id}.feel.json`), feel)
      return { screenshot, store, captureIssues: (feel.findings ?? []).map(finding => ({
        assertion: `feel:${finding.rule}`, layer: 'UI', actual: finding, expected: '无体感扫描违规',
        phenomenon: JSON.stringify(finding),
      })) }
    },
    async stop() {
      win.off('console', renderer)
      app.off('console', main)
      writeJson(path.join(directory, 'console.json'), consoleRows)
      await app.context().tracing.stop({ path: path.join(directory, 'trace.zip') })
    },
  }
}
export function copyTranscripts(profile, directory) {
  const files = fs.readdirSync(profile, { recursive: true }).filter(name =>
    name.includes(`${path.sep}.nomi${path.sep}agent-sessions${path.sep}`) && name.endsWith('.jsonl'))
  const materialized = []
  // Legacy runtime persists the exact native SessionManager entries in a checksum envelope.
  // Export those entries verbatim, preserving the original envelope and leaf pointer.
  for (const file of fs.readdirSync(profile, { recursive: true }).filter(n => n.endsWith('agent-thread-context-v1.json'))) {
    const container = JSON.parse(fs.readFileSync(path.join(profile, file), 'utf8'))
    writeJson(path.join(directory, 'pi-source', file), container)
    for (const [key, record] of Object.entries(container.records ?? {})) {
      if (record.source !== 'native' || !record.snapshot) continue
      const snapshot = JSON.parse(record.snapshot)
      if (snapshot.format !== 'nomi.pi-work-context') throw Error('Unknown native snapshot format')
      if (createHash('sha256').update(JSON.stringify(snapshot.data)).digest('hex') !== snapshot.sha256) throw Error('Native snapshot checksum mismatch')
      const target = path.join(directory, 'pi', `${key}.jsonl`)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, [snapshot.data.header, ...snapshot.data.entries].map(e => JSON.stringify(e)).join('\n') + '\n')
      writeJson(`${target}.source.json`, { source: file, record: key, leafId: snapshot.data.leafId, method: 'verbatim-native-entries; no UI reconstruction' })
      materialized.push(target)
    }
  }
  const calls = new Map()
  for (const file of files) {
    const target = path.join(directory, 'pi', file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(profile, file), target)
    materialized.push(target)
  }
  for (const target of materialized) {
    for (const line of fs.readFileSync(target, 'utf8').split('\n').filter(Boolean)) {
      const entry = JSON.parse(line), message = entry.message
      if (!message) continue
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block.type === 'toolCall') calls.set(block.id, { id: block.id, name: block.name, args: block.arguments, resultSummary: null })
      }
      if (message.role === 'toolResult') {
        const call = calls.get(message.toolCallId) ?? { id: message.toolCallId, name: message.toolName }
        call.resultSummary = JSON.stringify(message.content).slice(0, 2000)
        call.ok = !message.isError
        calls.set(message.toolCallId, call)
      }
    }
  }
  writeJson(path.join(directory, 'tools.json'), [...calls.values()])
  return materialized
}
const cell = value => String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '').replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, 800)
export function saveCase(directory, walk) {
  writeJson(path.join(directory, 'deviations.json'), walk.deviations)
  writeJson(path.join(directory, 'stations.json'), walk.stations)
  const lines = ['# 情绪日志（G1 §5）', '', '情绪需人眼复核；不自动把断言绿判为无摩擦。', '',
    '| 时间点 | 步骤/动作 | 预期 | 实际 | 情绪 | 等待秒数 | 打断原因与累计次数 | 截图/产物 | 问题归属 | 处理与复走证据 |',
    '|---|---|---|---|---|---|---|---|---|---|']
  for (const s of walk.stations) lines.push(`| ${s.started} | ${s.id} | ${cell(s.expected)} | ${s.status} | 待人眼 | ${s.seconds ?? ''} | ${cell(s.interruption ?? (s.reachedViaRepair ? '前站修补' : '无自动记录'))} | [截图](${s.screenshot ?? ''}) / [store](${s.store ?? ''}) | ${cell(s.surface)} | ${walk.deviations.filter(d => d.station === s.id && d.repaired).map(d => cell(d.repairedBy)).join(',')} |`)
  fs.writeFileSync(path.join(directory, 'emotion-log.md'), `${lines.join('\n')}\n`)
}
export function saveReport(directory, runs, skipped, budgetCny) {
  const lines = ['# Sweep 问题总账', '', `模式：记录并继续；预算上限 ¥${budgetCny}。费用取供应商余额增量，缺账单写未知；站点费用为保守预留增量。修补不算通过；各输入只证明登记的子任务，不能代替完整 G1 验收。`, '',
    '| case/input | surface | 站 | 现象 | 证据 | 初判层 | root_cause_cluster |', '|---|---|---|---|---|---|---|']
  const evidence = (r, d) => `[轨迹](${r.id}/${fs.existsSync(path.join(directory, r.id, 'trace.zip')) ? 'trace.zip' : 'trace-unavailable.md'}) / [断言](${r.id}/deviations.json)${d.screenshot ? ` / [截图](${r.id}/${d.screenshot})` : ''}`
  const feelGroups = new Map()
  for (const r of runs) for (const d of r.deviations) {
    if (d.assertion?.startsWith('feel:')) {
      const finding = d.actual ?? {}
      const identity = [finding.rule ?? d.assertion.slice(5), finding.text ?? [], finding.target ?? [], d.surface ?? r.surface]
      const key = JSON.stringify(identity)
      const group = feelGroups.get(key)
      if (group) group.count += 1
      else feelGroups.set(key, { identity, r, d, count: 1 })
    } else lines.push(`| ${r.id} | ${cell(d.surface)} | ${cell(d.station)} | ${cell(d.phenomenon)} | ${evidence(r, d)} | ${cell(d.layer)} | |`)
  }
  lines.push('', '## 体感命中（规则 × 文字 × 目标 × 面聚合）', '',
    `原始命中 ${[...feelGroups.values()].reduce((n, group) => n + group.count, 0)} 条 → 聚合 ${feelGroups.size} 行；完整逐站证据保留在各 case 的 deviations.json。`, '',
    '| 规则 | 文字 | 目标 | surface | 首次 case/站 | count | 证据 |', '|---|---|---|---|---|---|---|')
  for (const { identity: [rule, text, target, surface], r, d, count } of feelGroups.values()) {
    lines.push(`| ${cell(rule)} | ${cell(JSON.stringify(text))} | ${cell(JSON.stringify(target))} | ${cell(surface)} | ${cell(r.id)}/${cell(d.station)} | ${count} | ${evidence(r, d)} |`)
  }
  lines.push('', '## 临时修补（均保留失败）', '')
  for (const r of runs) for (const d of r.deviations.filter(d => d.repaired)) lines.push(`- ${r.id}/${d.station}：${d.repairedBy}`)
  lines.push('', '## 按 surface 汇总', '', '| surface | 跑了几条 | 到达几站 | 修补几次 | 真失败几条（含已修补） | 费用 ¥ |', '|---|---|---|---|---|---|')
  for (const surface of [...new Set(runs.flatMap(r => [r.surface, ...r.stations.map(s => s.surface ?? r.surface), ...r.deviations.map(d => d.surface ?? r.surface)]))]) {
    const selected = runs.filter(r => r.surface === surface || [...r.stations, ...r.deviations].some(row => row.surface === surface))
    const stations = selected.flatMap(r => r.stations.filter(s => (s.surface ?? r.surface) === surface))
    const failures = selected.flatMap(r => r.deviations.filter(d => (d.surface ?? r.surface) === surface).map(d => ({ ...d, caseId: r.id })))
    const billed = runs.filter(r => r.surface === surface)
    lines.push(`| ${surface} | ${selected.length} | ${stations.filter(s => s.status !== 'unreachable').length} | ${new Set(failures.filter(d => d.repaired).map(d => `${d.caseId}/${d.station}`)).size} | ${failures.length} | ${billed.some(r => r.costCny === null) ? '未知' : billed.reduce((n,r)=>n+(r.costCny ?? 0),0)} |`)
  }
  lines.push('', '跨页面 case 在触及的各 surface 分别计数；站点与问题按实际 surface 归属，费用只计入输入主 surface，避免重复记账。')
  lines.push('', '## 未跑输入', '', ...skipped.map(s => `- ${s.id}：${s.status}；${s.reason}`), '')
  fs.writeFileSync(path.join(directory, 'report.md'), lines.join('\n'))
}
