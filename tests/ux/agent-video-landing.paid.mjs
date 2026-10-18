#!/usr/bin/env node
// 真实用户任务 · **真花钱**：「让 Agent 做一段视频 → 我在付费卡上点了生成 → 真视频要跑好一会儿 → 片子落到节点上」。
//
//   NOMI_SPEND_OK=1 node tests/ux/agent-video-landing.paid.mjs [--packaged <Nomi 可执行文件的绝对路径>]
//
// 2026-09-25 用户原话：「AI 付费卡生产出来的东西会一直转圈……视频早就生产出来了，他这里一直显示生成中。」
// `agent-spend-video-landing.walk.mjs` 用 loopback 夹具把那条修复钉住了（零额度，进 CI）；这一条在**真供应商**上
// 把同一条路走完，同样四件事（那份走查文件头 ①–④）：
//   ① 确认之后，节点上是普通生成那张等待画面，不是「整卡模糊 + N 字标」那第二套；
//   ② 真视频跑得比单次观察窗久（这里把窗口压到 OBSERVATION_WINDOW_MS）：窗口过了 Nomi 还在问，而不是永远转圈；
//   ③ 供应商一出片：节点变成结果（真 mp4 落进项目素材库，永久的 nomi-local 地址），任务面板不再说「供应商长时间没有返回新状态」；
//   ④ 英文界面 + 重开之后：节点上的片子还在。
//
// 大脑：APIMart 的 DeepSeek V4 Pro；视频：Seedance 2.0 fast · 480p · 4 秒 · 无音频（最便宜那一档）。
// 花钱之前逐字段核对 Agent 写进制作 Run 的草稿，不是那一档就关卡、一分钱不花（_agentVideoPaid.mjs）。
// 步骤本体在 _agentVideoLandingSteps.mjs（接入 → 开项目 → … → 英文重开，顺序也在那里）；零额度的 loopback 演练是
// agent-video-landing-paid.rehearsal.walk.mjs，调的是同一份——花钱之前先跑它，接入 / 草稿核对 / 落地读数走不通会在那里红。
// 凭据与原库保护见 _paidRun.mjs / _realProfile.mjs：明文 key 不落地、跑完删凭据副本、原库指纹跑前跑后比对。
import { BRAIN, VIDEO } from './_agentVideoPaid.mjs'
import { OBSERVATION_WINDOW_MS, runAgentVideoLanding } from './_agentVideoLandingSteps.mjs'
import { openPaidWalk } from './_paidRun.mjs'

process.env.NOMI_POLL_TIMEOUT_MS = String(OBSERVATION_WINDOW_MS)

const paid = await openPaidWalk('agent-video-landing.paid.mjs', 'agent-video-landing', [BRAIN, VIDEO])
const { walk } = paid
let failure
try {
  const { win } = await walk.start({ first: true })
  await runAgentVideoLanding({ paid, win })
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
