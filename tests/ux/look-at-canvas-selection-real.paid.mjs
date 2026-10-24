#!/usr/bin/env node
// 真模型数字 · look_at_canvas「当前选中」翻页（PR #1283，R13.3）：工具写对率、翻页率、回合成功率。
//
//   pnpm build && NOMI_SPEND_OK=1 node tests/ux/look-at-canvas-selection-real.paid.mjs        （轮数：NOMI_REAL_ROUNDS，缺省 5）
//
// 先跑零花费演练 look-at-canvas-selection-real.rehearsal.walk.mjs（同一份步骤，夹具大脑），过了再跑这条。
// 为什么要它：#1283 让 look_at_canvas 在选区列不全时明说总数、点名下一页的 selectedFrom，并新增这个可选参数。
// 工具说明一改，「外观绿」不等于模型真会用——这条走查让 App 里配好的真模型面对一张选了 40 个节点的画布，
// 问一句非读全选区答不对的话，量它会不会翻页、参数写没写对、最后答得对不对。
//
// 场景与判分见 _lookAtCanvasSelectionScore.mjs，步骤本体见 _lookAtCanvasSelectionSteps.mjs（与演练同一份）。
// 每一轮新开对话、选区设回那 40 个、句子逐字相同。只花文本模型的 token：大脑是 App 里配好的 BRAIN（APIMart 的
// DeepSeek V4 Pro），只授权这一档，不授权任何生成模型；问的是只读的话，不起草、不生成、不改画布。
// 凭据与原库保护见 _paidRun.mjs / _realProfile.mjs：从真实资料目录拷密文进隔离副本、不读 key、跑完删凭据副本、
// 原库指纹跑前跑后比对；产物里找不到本 PR 的标记字面量（SELECTION_PAGING_MARKER）就拒跑，一分钱不花。
// 证据摘要：docs/evidence/2026-10-22-look-at-canvas-selection-truncation/paid/report.json（落盘前查 key）；
// 截图与完整走查报告在 .tmp/pi-look-at-canvas-selection-real-*/。
import { BRAIN } from './_agentVideoPaid.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { SELECTION_PAGING_MARKER, runSelectionJourney, selectionEvidence, writeSelectionEvidence } from './_lookAtCanvasSelectionSteps.mjs'

const SCRIPT = 'look-at-canvas-selection-real.paid.mjs'
const ROUNDS = Number(process.env.NOMI_REAL_ROUNDS || 5)
if (!Number.isInteger(ROUNDS) || ROUNDS < 1) throw new Error(`NOMI_REAL_ROUNDS 要是正整数，拿到 ${process.env.NOMI_REAL_ROUNDS}`)
const startedAt = new Date().toISOString()

const paid = await openPaidWalk(SCRIPT, 'look-at-canvas-selection-real', [BRAIN], { buildMarkers: [SELECTION_PAGING_MARKER] })
const { walk } = paid
const journey = { rounds: [] }
let failure
try {
  await runSelectionJourney(journey, {
    walk, rounds: ROUNDS, expectedModelKey: BRAIN.modelKey, modelLabel: () => paid.label(BRAIN.vendorKey, BRAIN.modelKey),
  })
  walk.report.numbers = journey.numbers
  console.log(`[selection] ${JSON.stringify(journey.numbers)}`)
  // 模型答错是量到的数，不是走查失败；量具自己出了错（某一轮没落地、答话的不是被授权的模型）才判红，那时的数不能用。
  if (journey.gaugeProblems.length) throw new Error(`量具有问题，这一场的数不能用：\n  ${journey.gaugeProblems.join('\n  ')}`)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
  const written = writeSelectionEvidence('report.json', selectionEvidence({
    script: SCRIPT, mode: 'paid', startedAt, journey, walk, failure, model: `${BRAIN.vendorKey}/${BRAIN.modelKey}`,
  }))
  console.log(`[selection] 证据摘要：${written}`)
}
