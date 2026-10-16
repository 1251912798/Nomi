#!/usr/bin/env node
// 合并前扫描（协调会话的工具，2026-10-02）。输入 PR 号，用 gh 读 PR 正文和改动文件，只打印结论，**不合并**。
// 它取代原来的交工前评审收据：不再问「有没有跑过评审」，而是问两个暂停点有没有真的发生——
//   ① 暂停点①设计卡：PR 正文 `## 设计卡` 是否填全（四类 9 格，其余只查 ★ 格 1、2、3、4、9）；
//   ② 暂停点②独立验收：四类的 PR 正文 `## 独立验收` 是否带报告链接，且验收线编号不同于实现线；
//   ③ 本 PR 把逃逸账本条目转成 fixed 时，有没有带 detected_by 的根因合同（判据看账本状态转换，不看正文用词）。
// 判四类的字符串规则与设计卡模板末尾那段一致（docs/engineering/design-card.md），宁可多报；误报由协调会话人工划掉。
//
// 用法：node scripts/merge-preflight.mjs <PR 号> [--repo owner/name] [--enforce]
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ESCAPE_LEDGER_DIR, assembleEscapeLedger, escapeIdOfPath } from './escape-ledger-lib.mjs'
import { checkPrBoardClaims, loadManifests } from './check-board-parity.mjs'
import { META_FILE } from './lib/entryDirectory.mjs'
import { execGhReadSync } from './lib/transientRetry.mjs'
import { RULES_INTRODUCED_BY_PR, evaluatePrBody, ledgerChanges, mergeReport, settledContracts } from './pr-body-criteria.mjs'
import { SCENARIO_DIR, knownScenarios, scenarioEntriesFromReader } from './perf-scenarios-lib.mjs'
import {
  PROTECTED_PATHS,
  SCOPE_SECTION,
  checkProtectedScope,
  extractSection,
  addedLinesByFile,
} from './pr-judgement-lib.mjs'

// 所有 PR 正文判据（设计卡 / 独立验收 / 逃逸合同 / 路由 / 规则与门岗范围）都在 scripts/pr-body-criteria.mjs 与
// scripts/pr-judgement-lib.mjs；推送前的 check:pr-judgement 调同一份（2026-10-08，#1094：两边口径不一）。这里只留 gh 取数。
export { PROTECTED_PATHS, SCOPE_SECTION, checkProtectedScope, extractSection }

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * pulls/<n>/files 的分页输出（每行 filename\tstatus\tadditions\tdeletions[\tprevious_filename]）→ 文件表。纯函数、可测。
 * 改名（renamed）的行带上旧路径：逃逸账本一条一个文件以后，条目文件改名 = 旧 id 消失，必须看得见。
 */
export function parsePullFileRows(text) {
  return String(text || '').split('\n').filter(Boolean).map((row) => {
    const [path, status, additions, deletions, previousPath] = row.split('\t')
    return { path, status, additions: Number(additions) || 0, deletions: Number(deletions) || 0, ...(previousPath ? { previousPath } : {}) }
  })
}

/**
 * 取数失败 = 没有结论。合并前扫描的每一个输入（文件表、diff、合同、账本）取不到都**不许**退到「少看一点」的口径继续判：
 * 少看一点既会误报（10-11 #1166：文件表分页偶发失败，退回只含前 100 个文件的 view.files，看不到排在后面的账本条目，
 * 判「没转 fixed」，下一轮取数成功又判通过），也会漏报（被截掉的文件里恰好有该拦的东西）。
 * main() 把它转成一行「结论：✖ 取不到……」——合并循环只认「结论：✖」，所以任何取数失败都会停手而不是放行。
 */
export class PreflightDataError extends Error {
  constructor(what, cause) {
    super(`取不到${what}${cause?.message ? `：${String(cause.message).split('\n')[0]}` : ''}`)
    this.name = 'PreflightDataError'
  }
}

function must(what, run) {
  try {
    return run()
  } catch (error) {
    if (error instanceof PreflightDataError) throw error
    throw new PreflightDataError(what, error)
  }
}

function makeGh(exec) {
  const gh = (args, { repo } = {}) => {
    const full = repo ? [...args, '--repo', repo] : args
    return exec(full, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
  }
  /** 文件内容：只有「这个 ref 上确实没有这个文件」（HTTP 404）才是 null；别的失败一律抛出，不当作「没有」。 */
  const ghApiFile = (repoSlug, filePath, ref) => {
    try {
      const raw = exec(['api', `repos/${repoSlug}/contents/${filePath}?ref=${ref}`, '--jq', '.content'], { cwd: repoRoot })
      return Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf8')
    } catch (error) {
      if (/HTTP 404|Not Found/u.test(`${error?.message ?? ''}\n${error?.stderr ?? ''}`)) return null
      throw new PreflightDataError(`${filePath}@${String(ref).slice(0, 9)} 的内容`, error)
    }
  }
  /** 某个 ref 上一个目录里的文件名（contents API 列目录，一次请求，不取内容）。 */
  const ghApiDirectoryNames = (repoSlug, dirPath, ref) => must(`${dirPath} 的文件列表`, () => exec(['api', `repos/${repoSlug}/contents/${dirPath}?ref=${ref}`, '--jq', '.[] | select(.type == "file") | .name'], { cwd: repoRoot }).split('\n').filter(Boolean))
  return { gh, ghApiFile, ghApiDirectoryNames }
}

/**
 * GraphQL 取回的目录（Tree.entries：[{ name, object: { text } }]）→ 整本逃逸账本；走同一个 assembleEscapeLedger
 * （文件名 ↔ id 的规则只此一份）。缺 _meta.json / 内容坏了 → null。纯函数、可测。
 */
export function escapeLedgerFromTree(entries) {
  if (!Array.isArray(entries)) return null
  const texts = new Map(entries.filter((entry) => typeof entry?.object?.text === 'string').map((entry) => [entry.name, entry.object.text]))
  if (!texts.has(META_FILE)) return null
  try {
    const names = [...texts.keys()].filter((file) => file !== META_FILE && file.endsWith('.json')).sort()
    return assembleEscapeLedger({ meta: JSON.parse(texts.get(META_FILE)), entries: names.map((file) => ({ name: file, value: JSON.parse(texts.get(file)) })) })
  } catch {
    return null
  }
}

/** 某个 ref 上的整本逃逸账本：一次 GraphQL 请求取回目录里所有文件的内容（不是几十次 REST）。只在「判已结账合同」时用；取不到或内容坏了就抛出。 */
function ghEscapeLedger(exec, repoSlug, ref) {
  const [owner, name] = String(repoSlug).split('/')
  const query = 'query($owner:String!,$name:String!,$expr:String!){repository(owner:$owner,name:$name){object(expression:$expr){... on Tree{entries{name object{... on Blob{text}}}}}}}'
  return must('基线上的整本逃逸账本', () => {
    const raw = exec(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-f', `expr=${ref}:${ESCAPE_LEDGER_DIR}`], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    const ledger = escapeLedgerFromTree(JSON.parse(raw)?.data?.repository?.object?.entries)
    if (!ledger) throw new Error('账本目录读不出来')
    return ledger
  })
}

/** 对外入口：任何取数失败都收成一行「结论：✖」，退出码 1。exec 可注入（测试用）。 */
export function main(argv = process.argv.slice(2), exec = execGhReadSync) {
  try {
    return run(argv, exec)
  } catch (error) {
    if (!(error instanceof PreflightDataError)) throw error
    console.log(`✖ ${error.message}——取数不全就不下结论，重跑一次；反复失败再查网络 / gh 登录`)
    console.log('结论：✖ 有项没过，先别合（取数失败，不是 PR 的问题；脚本只打印结论，不合并）')
    return 1
  }
}

function run(argv, exec) {
  const { gh, ghApiFile, ghApiDirectoryNames } = makeGh(exec)
  const prArg = argv.find((arg) => /^\d+$/.test(arg))
  const repoIndex = argv.indexOf('--repo')
  const repo = repoIndex >= 0 ? argv[repoIndex + 1] : undefined
  if (!prArg) {
    console.error('用法：node scripts/merge-preflight.mjs <PR 号> [--repo owner/name]')
    return 2
  }
  const view = must('PR 基本信息', () => JSON.parse(gh(['pr', 'view', prArg, '--json', 'body,headRefOid,baseRefName,headRepository,headRepositoryOwner,createdAt'], { repo })))
  const slug = repo ?? (view.headRepositoryOwner?.login && view.headRepository?.name ? `${view.headRepositoryOwner.login}/${view.headRepository.name}` : null)
  const baseSlug = repo ?? slug
  // 文件表只取一次、要全量：只走分页的 pulls/<n>/files。**没有备用口径**：gh pr view 的 files 最多 100 个、
  // 超过静默截断（#1048 / #1166 都超过 100 个文件），取不到就整个扫描失败，不退回截断版。
  if (!baseSlug) throw new PreflightDataError('PR 所在仓库（headRepository 为空）')
  const apiRows = must('PR 文件表', () => parsePullFileRows(gh(['api', `repos/${baseSlug}/pulls/${prArg}/files`, '--paginate', '--jq', '.[] | [.filename, .status, .additions, .deletions, (.previous_filename // "")] | @tsv'])))
  const files = apiRows.map((row) => ({ path: row.path, status: row.status === 'added' ? 'A' : 'M' }))
  const diff = must('PR diff', () => gh(['pr', 'diff', prArg], { repo }))
  const addedLines = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n')
  const addedByFile = addedLinesByFile(diff)
  const body = view.body ?? ''

  const contracts = []
  for (const file of files.filter((entry, index) => apiRows[index].status !== 'removed' && /^docs\/fixes\/.+\.root-cause\.json$/.test(entry.path))) {
    const text = ghApiFile(slug, file.path, view.headRefOid)
    try {
      contracts.push({ file: file.path, added: file.status === 'A', detected_by: text ? JSON.parse(text).detected_by : undefined })
    } catch {
      contracts.push({ file: file.path, added: file.status === 'A', detected_by: undefined })
    }
  }

  // 逃逸账本（一条一个文件）：只有本 PR 动了条目文件，才去取那几个文件的 base / head 两版（base 取当前基线分支末端）
  const ledger = { transitions: [], ids: [], removed: [], settledContracts: [] }
  const baseRef = view.baseRefName || 'main'
  const ledgerRows = apiRows.map((row) => ({ path: row.path, status: row.status, previousPath: row.previousPath }))
  if (ledgerRows.some((row) => escapeIdOfPath(row.path) || (row.previousPath && escapeIdOfPath(row.previousPath)))) {
    // 「转成 fixed」和「条目被删」都对本 PR 自己的起点（merge-base）比，不对 main 末端比（10-07 #1055 / #1065）：
    // PR 文件表本来就是对 merge-base 算的，main 后来新加的条目根本不在表里；base 那一版也取 merge-base 上的。
    // 取不到 merge-base 直接失败；返回的不是 40 位哈希（不该发生）才用 base 分支末端。
    let forkRef = baseRef
    const forkSha = must('merge-base', () => gh(['api', `repos/${slug}/compare/${baseRef}...${view.headRefOid}`, '--jq', '.merge_base_commit.sha']).trim())
    if (/^[0-9a-f]{40}$/.test(forkSha)) forkRef = forkSha
    const changes = ledgerChanges(ledgerRows, (file, side) => ghApiFile(slug, file, side === 'base' ? forkRef : view.headRefOid))
    ledger.transitions = changes.transitions
    ledger.removed = changes.removed
    // 正文提到的条目 id（只做提示）：列一次 head 目录的文件名，不取内容
    ledger.ids = (ghApiDirectoryNames(slug, ESCAPE_LEDGER_DIR, view.headRefOid)).map((name) => escapeIdOfPath(`${ESCAPE_LEDGER_DIR}/${name}`)).filter(Boolean)
  }
  // 「修订已结账的合同」才需要知道 base 上哪些合同已结账：只在这时取一次 base 整本账（一次 GraphQL）
  const amendsUserContract = contracts.some((contract) => !contract.added && ['user', 'post-release'].includes(contract.detected_by))
  if (amendsUserContract && ledger.transitions.length === 0) ledger.settledContracts = settledContracts(ghEscapeLedger(exec, slug, baseRef))

  // 性能场景 id（G-perfreg，2026-10-15）：已知 = (基线登记表 − 本 PR 删掉的) ∪ 本 PR 新增 / 改动的文件（PR 头内容）。
  // 只核证据行的 id；场景文件结构以 CI 的 check:perf-scenarios（合并引用上）为准，这里不拿检出的 DRIVERS 校验 PR 文件。
  const scenarioRe = /^tests\/perf\/scenarios\/[^/]+\.json$/
  const scenarioRows = apiRows.filter((row) => scenarioRe.test(row.path))
  const baseScenarioNames = ghApiDirectoryNames(baseSlug, SCENARIO_DIR, baseRef).filter((name) => name.endsWith('.json'))
  const scenarios = knownScenarios({
    baseEntries: scenarioEntriesFromReader(baseScenarioNames, (name) => ghApiFile(baseSlug, `${SCENARIO_DIR}/${name}`, baseRef)),
    prFiles: scenarioRows.filter((row) => row.status !== 'removed').map((row) => ({ file: row.path, content: ghApiFile(slug, row.path, view.headRefOid) })),
    removedFiles: scenarioRows.filter((row) => row.status === 'removed').map((row) => row.path),
  })

  // 规则与门岗的改动范围：要真实的文件状态（removed / modified）
  const statusFiles = apiRows.map((row) => ({ path: row.path, status: row.status }))
  const packageBlock = diff.split(/^diff --git /m).find((block) => block.startsWith('a/package.json b/package.json')) ?? ''
  const packageRemovedLines = packageBlock.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1))

  const report = mergeReport(prArg, evaluatePrBody({
    body,
    files: statusFiles.map((file) => ({ path: file.path, status: file.status === 'added' ? 'A' : file.status })),
    addedLines,
    addedByFile,
    packageRemovedLines,
    contracts,
    ledger,
    // #961 自己是引入规则的 PR，不吃宽限（createdAt 取 null = 不宽限）
    createdAt: Number(prArg) === RULES_INTRODUCED_BY_PR ? null : view.createdAt,
    enforce: argv.includes('--enforce'), // --enforce：假设路由规则已生效，看这个 PR 会不会红（回放用）
    scenarios,
  }))
  console.log(report.text)
  // 拍板图认领（check-board-parity R8）：PR 正文 `## 拍板图` 认领的元素，在 PR 头上必须有去处。
  const boardErrors = checkPrBoardClaims(body, loadManifests())
  if (boardErrors.length) {
    console.log(`拍板图认领未过（${boardErrors.length} 条）：\n${boardErrors.map((e) => `  ✗ ${e}`).join('\n')}`)
  }
  return report.blocked || boardErrors.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main()
