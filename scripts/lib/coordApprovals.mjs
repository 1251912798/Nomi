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

// ── 合同文件的批准范围：默认全拦（2026-10-22 用户拍板方案 A，V-gates 第 2 轮 R2-B1 / R2-B2 后）──────────────────────
// 旧做法是「默认放行」：由 PR 自报的认领集合 + 一份我们列出来的要保护的字段 / 元素决定，没列到的就漏（删除、板级字段、没被认领的新元素），补不完。
// 现在反过来：合同文件（板文件、场景文件）按 base 与 head 的**整份规范化内容**对比；先剥掉白名单里允许 PR 自改的字段，
// 剩下的任何差异（新增、删除、板级字段、以后新加的任何字段）都要协调确认，哈希绑定整份规范化后的内容。
// 要确认的集合由真实 diff 构造，不看 PR 认领了什么（认领只用来关联实现验收）。

/** 板的白名单：元素的实现进度字段，实现线推进时合理会改。其余（含板级字段 decor / functionCensus / 设计来源 / stage、元素的用户原话）全算合同。 */
export const BOARD_PROGRESS_FIELDS = Object.freeze(['status', 'assertion', 'owner'])

/** 剥掉白名单字段、规范化（元素按 id 排序）后的板内容。 */
export function normalizeBoard(manifest) {
  if (!manifest || typeof manifest !== 'object') return manifest ?? null
  const out = { ...manifest }
  if (Array.isArray(manifest.elements)) {
    out.elements = manifest.elements
      .map((element) => {
        if (!element || typeof element !== 'object') return element
        const copy = { ...element }
        for (const key of BOARD_PROGRESS_FIELDS) delete copy[key]
        return copy
      })
      .sort((a, b) => String(a?.id).localeCompare(String(b?.id)))
  }
  return out
}

const withoutElements = (board) => Object.fromEntries(Object.entries(board ?? {}).filter(([key]) => key !== 'elements'))
const sameContent = (a, b) => canonicalJson(a) === canonicalJson(b)

/**
 * 一张板在 PR 里的合同差异（整份对比）。baseManifest / headManifest 任一为 null/undefined = 那一边没有这张板。
 * 返回 { needsApproval, added, removed, changed, boardLevel, isNewBoard, isRemovedBoard, fingerprint }：
 *   added / removed / changed = 新增 / 删除 / 合同变了的元素 id；boardLevel = 除 elements 外的板级字段变了；
 *   fingerprint = 整份规范化后的 head 内容的哈希（删板时是「删除」标记的哈希），批准记录的 sha256 就是它；内容再变一个字，哈希就对不上。
 */
export function boardApprovalSubject(name, baseManifest, headManifest) {
  const base = normalizeBoard(baseManifest ?? null)
  const head = normalizeBoard(headManifest ?? null)
  const baseElements = new Map((base?.elements ?? []).map((element) => [element?.id, element]))
  const headElements = new Map((head?.elements ?? []).map((element) => [element?.id, element]))
  const added = [...headElements.keys()].filter((id) => !baseElements.has(id))
  const removed = [...baseElements.keys()].filter((id) => !headElements.has(id))
  const changed = [...headElements.keys()].filter((id) => baseElements.has(id) && !sameContent(baseElements.get(id), headElements.get(id)))
  const baseLevel = withoutElements(base)
  const headLevel = withoutElements(head)
  const boardLevel = !sameContent(baseLevel, headLevel)
  const needsApproval = !sameContent(base, head)
  return {
    needsApproval,
    added,
    removed,
    changed,
    boardLevel,
    isNewBoard: !base && !!head,
    isRemovedBoard: !!base && !head,
    // 兼容旧字段：所有有差异的元素 id（新增 + 删除 + 改动）
    changedIds: [...added, ...removed, ...changed],
    fingerprint: sha256Of({ board: name, content: head, removed: !head }),
  }
}

/** 人话描述一张板的差异（确认提示用）。 */
export function describeBoardDiff(subject) {
  const parts = []
  if (subject.isNewBoard) parts.push('是 PR 新增的板')
  else if (subject.isRemovedBoard) parts.push('被 PR 整张删掉')
  else {
    if (subject.added.length) parts.push(`新增了元素（${subject.added.join('、')}）`)
    if (subject.changed.length) parts.push(`改了合同的元素（${subject.changed.join('、')}）`)
    if (subject.removed.length) parts.push(`删了元素（${subject.removed.join('、')}）`)
    if (subject.boardLevel) parts.push('改了板级字段（decor / functionCensus / 设计来源 / stage 等）')
  }
  return parts.join('；')
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
