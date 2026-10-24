#!/usr/bin/env node
// 真实付费核对 · B3 生成框「界面上标为在用的参考图 = 真发给供应商的参考图」（#1269 合并前那一条）。**只写脚本，由协调来跑。**
//
//   pnpm build
//   NOMI_SPEND_OK=1 node tests/ux/composer-b3-reference.paid.mjs [--packaged <Nomi 可执行文件的绝对路径>]
//     # 凭据缺省从真实资料目录拷进隔离副本（key 不经脚本）；也可 APIMART_API_KEY=<key，只从环境读> 走可见接入页。
//   # 花钱之前先跑零花费演练（同一份步骤、不出网、不要 key）：
//   node tests/ux/composer-b3-reference-paid.rehearsal.walk.mjs
//   # 探测模式（走到确认框为止、绝不点生成）：
//   NOMI_SPEND_OK=1 NOMI_PAID_PROBE_DIALOG=1 node tests/ux/composer-b3-reference.paid.mjs
//
// 只花**一条**视频（APIMart 官方渠道）：Seedance 2.0 fast · 480p · 4 秒 · 无音频（_agentVideoPaid.mjs 里被授权的最便宜一档）。
// 步骤本体在 _composerB3ReferenceSteps.mjs（零花费演练用的是同一份）：
//   参考方式下节点的那一份有序参考列表放首帧图、尾帧图、3 张参考 → 点生成框底栏的参数摘要、在参数面板顶部「生成方式」点首尾帧
//   （B3 把方式从生成框里的分段条挪进了参数面板）→ 生成框上首帧、尾帧两格在用，3 张参考淡显「未用到」→ 点 ↑ → 确认框点「生成」。
//   「首尾帧」点不到就在点 ↑ 之前停下（一分钱不花），没有改写 store 顶替的退路：花的钱只证真人那条路。布场景（addNode 一次）
//   是唯一一次写 store；_composerReferenceRow.test.mjs 的 E2E 桥白名单零花费盯着步骤本体和本脚本对 store 的每一处用法。
// 要证明的是**渲染层只发界面上在用的图**：真正发往 api.apimart.ai 的那份请求体里只有首帧、尾帧两张，那 3 张一张都没上传、没发出。
// B3 起主进程参考守（electron/tasks/referenceResidueGuard.ts）是**拒发**、不是剥除：渲染层万一把没在用的图塞进请求，
// 主进程在发出之前拒掉（机器码 reference-not-in-use，请求没离开本机、不花钱），节点上报错——这也判失败并点名，
// 因为那说明界面和请求分了家（剥除时代这种分家会被悄悄剥掉、看不见；拒发让它显形）。
//
// 一次付费之前的整套核对（任何一项不成立就一分钱不花）：
//   ① 节点就是被授权那一档（cheapVideoNodeProblems）；② 方式是首尾帧，首帧图、尾帧图排在参考列表最前；
//   ③ 那 3 张参考还在节点的参考列表里（场景真的布好了，否则这条付费证明不了什么）；
//   ④ 界面：读生产组件渲染出来的生成框参考行（_composerReferenceRow.mjs）——首帧、尾帧两格（[data-asset-slot]）各恰好是那张图，
//      那 3 张在「未用到」淡格里（[data-reference-unused]，清单 ComposerB3 板的 ref.slot.unused），参考数组里没有在用的图。
//   ②③ 只核节点上存的事实；谁在用只认 B3 的唯一推导（placeUploadedImages），脚本只读界面（④）和请求体，不自己推导。
// 花钱后：节点恰好一次提交、结果带供应商任务号、成片 ffprobe 量过并在隔离副本删除前拷进走查输出目录（工作树 .tmp/ 下，不进仓库）；
// 成片落地之后（不是提交那一刻——10-22 实跑那样读账本读早了、误红）按网络闸的最新账本判请求体（_referenceLeakWire.mjs）；
// 节点上没有 reference-not-in-use 拒发。证据摘要写 docs/evidence/2026-10-24-composer-b3-reference/paid/report.json。
//
// 请求体从哪抓：走查网络闸（scripts/walkthrough-network-guard.cjs）在 fetch 层对放行名单上的请求记账（openPaidWalk 的
// recordAllowedBodies）。不记请求头（key 在头里）；正文里的签名查询串、key 形状的串先打码再落盘。托管上传的 multipart 记文件名，
// 上传回的公网地址用来把请求体里的地址对回本地文件名。报告里只留文件名和地址哈希，不留签名参数。
//
// 构建标记：openPaidWalk 的 buildMarkers 用 B3 守卫拒发时的诊断前缀 'reference residue rejected before send'（产物里没有它 =
// 跑在 B3 之前的构建上，拒跑）。旧脚本 reference-leak-hotfix.paid.mjs 用的 'reference residue stripped before send' 随 B3 改成拒发
// 从源码里消失了，它在 B3 上一直跑不起来；_paidRun.test.mjs 的 paidBuildMarkerProblems 现在零花费地盯着每条付费走查的标记。
//
// 探测模式（NOMI_PAID_PROBE_DIALOG=1，照 director-reference-attach.paid.mjs）：供应商的源不进放行名单，就算托管策略是「允许」、
// 点 ↑ 直接提交，网络闸也当场挡下，结构上花不了钱。走到确认框出现为止：截图、点「取消」、核对节点上没有提交记录。
// 已知坑（10-22 实跑）：App 启动时查余额 / 对账的只读请求在探测模式下会被网络闸挡下、走查当场失败并点名被挡主机；
// 用环境变量里的 key 接入时接入页验证 key 也会被挡。遇到就改跑零花费演练 + 正常模式（它在确认框之前同样停下来做整套核对）。
// 探测模式抓不到请求体（请求在确认之后才组装发出）。
//
// 凭据与护栏：全部走 tests/ux/_paidRun.mjs 的 openPaidWalk（CI 拒跑、没有 NOMI_SPEND_OK=1 拒跑、构建产物过期或不含本修复拒跑、
// 隔离资料目录、出网只放行授权供应商与当前托管中转、跑完删凭据副本）；key 只从环境变量读，不进报告 / 日志 / 截图。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VIDEO } from './_agentVideoPaid.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { judgeReferenceWire } from './_referenceLeakWire.mjs'
import {
  APIMART_HOST, COMPOSER_B3_PAID_MODELS, COMPOSER_B3_PAID_OPTIONS, FIRST_FILE, LAST_FILE, REFERENCE_FILES, runComposerB3ReferenceJourney,
} from './_composerB3ReferenceSteps.mjs'

const SCRIPT = 'composer-b3-reference.paid.mjs'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs/evidence/2026-10-24-composer-b3-reference/paid')
const PROBE = process.env.NOMI_PAID_PROBE_DIALOG === '1'

const paid = await openPaidWalk(SCRIPT, 'composer-b3-reference', COMPOSER_B3_PAID_MODELS, { ...COMPOSER_B3_PAID_OPTIONS, vendorNetwork: !PROBE })
const { walk } = paid
const evidence = { script: SCRIPT, mode: PROBE ? 'probe-dialog' : 'paid', startedAt: new Date().toISOString(), model: `${VIDEO.vendorKey}/${VIDEO.modelKey} · fast · 480p · 4s · 无音频` }
let failure
try {
  await runComposerB3ReferenceJourney({
    paid, evidence, probe: PROBE,
    // 在 finish 之前读：env-key 路收尾会删账本原件。
    judgeWire: ({ localUrlOf }) => judgeReferenceWire(paid.readAllowedRequests(), { host: APIMART_HOST, firstFile: FIRST_FILE, lastFile: LAST_FILE, referenceFiles: REFERENCE_FILES, localUrlOf }),
  })
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
  writeEvidence(failure)
}

function writeEvidence(error) {
  const report = {
    ...evidence,
    finishedAt: new Date().toISOString(),
    paidCalls: walk.report.paidCalls ?? null,
    spend: (walk.report.spend?.media ?? []).map(({ taskId, status, model, vendor }) => ({ taskId, status, model, vendor })),
    providerTaskIds: evidence.providerTaskIds ?? (walk.report.spend?.media ?? []).map((entry) => entry.taskId).filter(Boolean),
    networkAllowlist: walk.report.networkAllowlist ?? null,
    networkBlocked: walk.report.networkBlocked ?? [],
    walkOutputDir: walk.report.outputDir ? path.relative(REPO_ROOT, walk.report.outputDir) : null,
    failure: error ? String(error?.message ?? error).slice(0, 2000) : null,
  }
  // 证据摘要进仓库：落盘前最后一道，内容里不许有 key 原串（openPaidWalk 的证据目录自检管不到这里）。
  const key = String(process.env.APIMART_API_KEY ?? '').trim()
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (key.length >= 8 && text.includes(key)) { console.error('[paid] 证据摘要里出现了 key 原串，拒绝写入仓库——请更换这把 key'); process.exitCode = 1; return }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const file = path.join(EVIDENCE_DIR, PROBE ? 'probe-report.json' : 'report.json')
  fs.writeFileSync(file, text)
  console.log(`[paid] 证据摘要：${path.relative(REPO_ROOT, file)}`)
}
