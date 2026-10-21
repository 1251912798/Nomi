// 协调确认记录（2026-10-21，V-gates 复验 B1 / B4）：合同类数据（性能预算政策、拍板清单）不能由 PR 自己批准。
// 批准身份只能来自 base（main）上已有的内容，或协调在本机留下的确认记录——一个本机 JSONL 文件，路径取环境变量 NOMI_COORD_APPROVALS，不写死、不进仓库。
// 每条记录：{ pr, kind: 'board' | 'perf-policy', name, sha256, at, note }；sha256 是 PR head 上被批准内容的哈希，
// 批准之后内容又改了，哈希就对不上，重新判红。记录用 scripts/coord-approve.mjs 写（只给协调用）。
// CI 读不到本机文件：同一批检测只打「待协调确认」警告；merge-preflight（协调本机）没有匹配记录就红。
import crypto from 'node:crypto'
import fs from 'node:fs'

export const APPROVAL_ENV = 'NOMI_COORD_APPROVALS'
export const APPROVAL_KINDS = Object.freeze(['board', 'perf-policy'])

/** 键排序的规范化 JSON：同一份内容永远同一个哈希。 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const sha256Of = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex')

// ── 拍板清单：哪些字段是「合同」（要批准），哪些是实现线合理会改的「实现状态」（不用批准）──────────────────────────────
/** 实现状态字段：实现线推进时合理会改，不需要协调确认。 */
export const BOARD_IMPLEMENTATION_FIELDS = Object.freeze(['status', 'assertion', 'owner', 'userDecision'])

/** 一个元素的合同部分：除实现状态外的所有字段；推迟 / 放弃的决定（用户原话）算合同——不能由 PR 自己写一句话就把元素放弃。 */
export function elementContract(element) {
  const contract = {}
  for (const [key, value] of Object.entries(element ?? {})) if (!BOARD_IMPLEMENTATION_FIELDS.includes(key)) contract[key] = value
  if (element?.status === 'deferred' || element?.status === 'dropped') contract.decision = { status: element.status, userDecision: element.userDecision ?? null }
  return contract
}

/**
 * PR head 相对 base 新增或合同变了的元素（base 没有这张板 = 全部元素都是新的）。返回 { changed: [元素 id…], fingerprint }；
 * fingerprint = 这些元素的合同哈希，批准记录的 sha256 就是它。只改实现状态（status / assertion / owner）不算变。
 */
export function boardApprovalSubject(name, baseManifest, headManifest) {
  const baseElements = new Map((baseManifest?.elements ?? []).map((element) => [element?.id, element]))
  const changed = (headManifest?.elements ?? []).filter((element) => {
    const before = baseElements.get(element?.id)
    return !before || canonicalJson(elementContract(before)) !== canonicalJson(elementContract(element))
  })
  const contracts = changed.map(elementContract).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return { changed: changed.map((element) => element.id), fingerprint: sha256Of({ board: name, isNewBoard: !baseManifest, elements: contracts }) }
}

// ── 确认记录文件 ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * 合并前扫描用：读本机确认记录，返回 approvals = { mode: 'local', lookup(kind, name, sha256) → boolean, unavailable?: 原因 }。
 * 环境变量没设 / 文件读不了 → unavailable（需要确认的项一律红，不当没有要求）。
 */
export function localApprovals({ pr, env = process.env, readFile = (file) => fs.readFileSync(file, 'utf8') } = {}) {
  const file = env[APPROVAL_ENV]
  if (!file) return { mode: 'local', pr, lookup: () => false, unavailable: `环境变量 ${APPROVAL_ENV} 没设置（协调确认记录文件的路径）` }
  let text
  try { text = readFile(file) } catch (error) { return { mode: 'local', pr, lookup: () => false, unavailable: `${APPROVAL_ENV} 指向的文件读不了：${String(error?.message ?? error).split('\n')[0]}` } }
  const records = text.split(/\r?\n/).filter((row) => row.trim()).flatMap((row) => { try { return [JSON.parse(row)] } catch { return [] } })
  return {
    mode: 'local',
    pr,
    lookup: (kind, name, sha256) => records.some((record) => Number(record?.pr) === Number(pr) && record?.kind === kind && record?.name === name && record?.sha256 === sha256),
  }
}

/** CI 用：读不到本机记录，只提示待确认。 */
export const ciApprovals = Object.freeze({ mode: 'ci', lookup: () => false })

export function approvalCommand(pr, kind, name) {
  return `node scripts/coord-approve.mjs --pr ${pr ?? '<号>'} ${kind === 'board' ? '--board' : '--perf'} ${name}`
}
