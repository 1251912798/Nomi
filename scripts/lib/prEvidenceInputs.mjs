// 「证据判对不对」要的本地输入（2026-10-21）：PR 当前 head、报告 / 原始结果怎么读、拍板图清单。
// 判据在 scripts/pr-body-criteria.mjs（纯函数，输入由调用方给）；这里只是 CI / 推送前（check-pr-judgement）没有显式注入时的默认取法，
// 合并前扫描（scripts/merge-preflight.mjs）用 gh 取数，自己注入同形状的对象。
//
// 谁能读什么（CI 能核什么 / 本机核什么）：
//   · 仓库内的文件（docs/…、tests/perf/results/…）：CI 与本机都从 PR 头（HEAD）读；
//   · 协调目录里的验收报告（D:/Nomi-coord-state/reports/…，绝对路径）和外部链接：CI 读不到 → 返回 undefined（只核正文贴的首行 / HEAD / 验收线，
//     提示「本机核」）；合并前扫描在协调会话本机跑，会读报告本体，读不到就红（那边自己的 readReport 对读不到返回 null）。
//   · PR 当前 head：pull_request 事件的 pull_request.head.sha（CI 检出的 HEAD 是合并提交，不是 PR head）；没有事件就取本地 HEAD。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadManifests } from '../check-board-parity.mjs'

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 报告引用是「本机路径或外部链接」（CI 读不到）还是仓库内相对路径。 */
export const isRepoRelativeRef = (ref) => !/^(?:https?:|[a-z]:[\\/]|[\\/])/i.test(String(ref)) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(String(ref))

export function localEvidenceInputs({ root = process.env.PR_JUDGEMENT_REPO_ROOT || defaultRoot, env = process.env } = {}) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  const showHead = (ref) => { try { return git(['show', `HEAD:${String(ref).split('\\').join('/')}`]) } catch { return null } }
  const headFromEvent = () => {
    if (!env.GITHUB_EVENT_PATH) return null
    try { return JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))?.pull_request?.head?.sha ?? null } catch { return null }
  }
  const headSha = (() => {
    const fromEvent = headFromEvent()
    if (fromEvent) return fromEvent
    try { return git(['rev-parse', 'HEAD']).trim() || null } catch { return null }
  })()
  const boards = (() => { try { return loadManifests(path.join(root, 'docs/design/boards/2026-10-08')) } catch { return null } })()
  return {
    headSha,
    boards,
    readRaw: (ref) => (isRepoRelativeRef(ref) ? showHead(ref) : null),
    readReport: (ref) => (isRepoRelativeRef(ref) ? showHead(ref) : undefined),
  }
}
