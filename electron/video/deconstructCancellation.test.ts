// 拆解取消 · 主进程侧的**现状特征测试**（2026-10-27 钉住；修复时整段翻转成「取消后付费调用不再增长」）。
//
// 实测两件前提（设计卡 docs/plan/2026-10-27-deconstruct-cancel.md）：
//   ① 取消那一刻主进程里还有哪些调用在跑——四个时机各拍一张在途清单；
//   ② 编排里的子步骤拿不拿得到 signal——给 options 塞一个 signal 并在那一刻 abort，看它传不传得下去。
// 现状（修复前）：主进程没有任何取消入口，编排把 signal 当不存在，取消之后付费调用照样发满报价的行数，
// 整次还以「成功」收尾（渲染层再自己把结果作废）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    /** 每一次子步骤调用：哪一步、收到几个参数、参数里有没有 AbortSignal。 */
    calls: [] as Array<{ step: string; argCount: number; carriesSignal: boolean }>,
    /** 此刻挂着没回来的调用（标签 → 放行）。在途清单就是它的键。 */
    pending: new Map<string, () => void>(),
    holdQuote: false,
    holdAudio: false,
    holdFrameOfShot: 0,
  }
  const carriesSignal = (args: unknown[]): boolean => args.some((arg) => arg instanceof AbortSignal
    || (Boolean(arg) && typeof arg === 'object' && Object.values(arg as Record<string, unknown>).some((value) => value instanceof AbortSignal)))
  const record = (step: string, args: unknown[]) => { state.calls.push({ step, argCount: args.length, carriesSignal: carriesSignal(args) }) }
  /** 挂起一步，直到测试放行；不挂的步骤立即回。 */
  const hold = <T>(label: string, held: boolean, value: T): Promise<T> => (held
    ? new Promise<T>((resolve) => { state.pending.set(label, () => resolve(value)) })
    : Promise.resolve(value))
  return { state, record, hold }
})

// 6 镜（切点 2/4/6/8/10 秒，片长 12 秒），有音轨。framesPerShot=1 时第 n 镜在 (2n-1) 秒抽一帧。
vi.mock('../export/mediaProbe', () => ({
  probeMediaMetadata: vi.fn(async (...args: unknown[]) => { h.record('probe', args); return { durationSeconds: 12, hasAudio: true } }),
}))
vi.mock('./detectShotCuts', () => ({
  detectShotCuts: vi.fn(async (...args: unknown[]) => {
    h.record('cuts', args)
    return { cuts: [2, 4, 6, 8, 10].map((seconds) => ({ seconds, score: 0.9 })), coverage: { detectedCuts: 5, keptCuts: 5, appliedThreshold: 0.1, capped: false, coveredSeconds: 10, durationSeconds: 12 } }
  }),
}))
vi.mock('./extractVideoFrame', () => ({
  resolveVideoLocalPath: vi.fn(async () => ({ filePath: '/isolated/video.mp4', cleanup: () => undefined })),
  extractVideoFrameToAsset: vi.fn((...args: unknown[]) => {
    h.record('frame', args)
    const shot = Math.floor(Number((args[0] as { which: number }).which) / 2) + 1
    return h.hold(`frame#${shot}`, h.state.holdFrameOfShot === shot, { url: `nomi-local://isolated/frame-${shot}.png` })
  }),
}))
vi.mock('./extractAudioTrack', () => ({
  extractAudioTrack: vi.fn((...args: unknown[]) => {
    h.record('audio', args)
    return h.hold('audio', h.state.holdAudio, { url: 'nomi-local://isolated/audio.mp3', hasAudio: true, durationSeconds: 12 })
  }),
}))
// 两处付费出口：每一次都挂起，由测试逐个放行——这样「此刻在途的是哪几次」才拍得下来。
vi.mock('../runtime', () => ({
  runTask: vi.fn((...args: unknown[]) => {
    h.record('runTask', args)
    const request = (args[0] as { request: { kind: string; extras: { referenceImages?: string[] } } }).request
    if (request.kind === 'transcribe') {
      return h.hold('transcribe', true, { raw: { text: 'hello', segments: [{ start: 0, end: 1, text: 'hello' }] } })
    }
    const shot = /frame-(\d+)\.png/.exec(request.extras.referenceImages?.[0] ?? '')?.[1] ?? '?'
    return h.hold(`vision#${shot}`, true, { raw: { choices: [{ message: { content: '{"shotSize":"中景","visual":"a door"}' } }] } })
  }),
}))
vi.mock('./deconstructVisionLeg', () => ({ resolveVisionLeg: () => ({ ok: true, vendor: 'vision-vendor', modelKey: 'vision-model' }) }))
vi.mock('../catalog/executableModel', () => ({
  findExecutableModel: () => ({ vendor: { key: 'vision-vendor' }, model: { modelKey: 'vision-model' } }),
  findExecutableModelForMode: () => ({ vendor: { key: 'stt-vendor' }, model: { modelKey: 'stt-model' } }),
  findExecutableModelInMode: () => ({ vendor: { key: 'stt-vendor' }, model: { modelKey: 'stt-model' } }),
}))
vi.mock('../catalog/catalogStore', () => ({ readCatalog: () => ({ mappings: [] }) }))
vi.mock('../settings/vendorPreferenceSettings', () => ({ readVendorPreferenceSettings: () => ({ orderedVendorKeys: [] }) }))
vi.mock('../logging/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }))

import { deconstructVideo, type DeconstructSpendPlan } from './deconstructVideo'
// 转写腿在发请求前动态 import 进度总线：静态装进模块缓存，「让出事件循环」才拍得到稳定的在途清单。
import '../localSpeech/localSpeechProgressBus'

/** 让编排把能走的都走完、停在下一个挂起点上（不靠墙钟：只让出事件循环）。 */
async function letOrchestrationRun(): Promise<void> {
  for (let round = 0; round < 30; round += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

const inFlight = () => [...h.state.pending.keys()].sort()
const countOf = (step: string) => h.state.calls.filter((call) => call.step === step).length
const paidCalls = () => countOf('runTask')

function start(signal: AbortSignal) {
  let plan: DeconstructSpendPlan | undefined
  const authorizeSpend = async (quoted: DeconstructSpendPlan) => {
    plan = quoted
    return h.hold('quote', h.state.holdQuote, 'grant-isolated')
  }
  let settled = false
  // options 现在没有 signal 这一格：照「修好之后会怎么传」把它塞进去，看编排认不认。
  const done = deconstructVideo(
    { videoUrl: 'nomi-local://isolated/video.mp4', projectId: 'isolated-project', nodeId: 'table-1', framesPerShot: 1 },
    { authorizeSpend, signal } as never,
  ).then((result) => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error })).finally(() => { settled = true })
  return { done, plan: () => plan, settled: () => settled }
}

/** 取消之后把挂着的全部放行，直到这次调用自己收尾。 */
async function releaseUntilSettled(settled: () => boolean): Promise<void> {
  for (let round = 0; round < 40 && !settled(); round += 1) {
    for (const [label, release] of [...h.state.pending]) { h.state.pending.delete(label); release() }
    await letOrchestrationRun()
  }
}

function releaseOne(label: string): void {
  const release = h.state.pending.get(label)
  if (!release) throw new Error(`expected ${label} to be in flight, in flight: ${inFlight().join(', ')}`)
  h.state.pending.delete(label)
  release()
}

type Timing = {
  name: string
  hold: Partial<Pick<typeof h.state, 'holdQuote' | 'holdAudio' | 'holdFrameOfShot'>>
  reach: () => Promise<void>
  inFlightAtCancel: string[]
  paidCallsAtCancel: number
}

const TIMINGS: Timing[] = [
  {
    name: '切点刚出、报价待定（还没铸令牌）',
    hold: { holdQuote: true },
    reach: letOrchestrationRun,
    inFlightAtCancel: ['quote'],
    paidCallsAtCancel: 0,
  },
  {
    name: '取音轨中（读图已并发 4 镜）',
    hold: { holdAudio: true },
    reach: letOrchestrationRun,
    inFlightAtCancel: ['audio', 'vision#1', 'vision#2', 'vision#3', 'vision#4'],
    paidCallsAtCancel: 4,
  },
  {
    name: '第一镜读完（第五镜已起跑、转写在途）',
    hold: {},
    reach: async () => { await letOrchestrationRun(); releaseOne('vision#1'); await letOrchestrationRun() },
    inFlightAtCancel: ['transcribe', 'vision#2', 'vision#3', 'vision#4', 'vision#5'],
    paidCallsAtCancel: 6,
  },
  {
    name: '下一镜即将起跑（第五镜抽帧中、读图未发）',
    hold: { holdFrameOfShot: 5 },
    reach: async () => { await letOrchestrationRun(); releaseOne('vision#1'); await letOrchestrationRun() },
    inFlightAtCancel: ['frame#5', 'transcribe', 'vision#2', 'vision#3', 'vision#4'],
    paidCallsAtCancel: 5,
  },
]

beforeEach(() => {
  h.state.calls.length = 0
  h.state.pending.clear()
  h.state.holdQuote = false
  h.state.holdAudio = false
  h.state.holdFrameOfShot = 0
})

describe('现状特征：取消那一刻主进程里还在跑什么、取消之后又发了几次（修复前钉住）', () => {
  it.each(TIMINGS)('$name', async (timing) => {
    Object.assign(h.state, timing.hold)
    const controller = new AbortController()
    const run = start(controller.signal)
    await timing.reach()

    // ① 在途清单：这一刻主进程手里还攥着哪些调用。
    expect(inFlight()).toEqual(timing.inFlightAtCancel)
    expect(paidCalls()).toBe(timing.paidCallsAtCancel)

    // 用户点取消。主进程今天收不到任何东西——能做的只有把 signal abort 掉，看编排认不认。
    controller.abort()
    await releaseUntilSettled(run.settled)
    const outcome = await run.done

    // ② 现状：取消之后付费调用继续增长，一直发满报价的行数；整次以成功收尾。
    const quoted = run.plan()?.lines.length ?? -1
    expect(quoted).toBe(7)
    expect(paidCalls()).toBe(quoted)
    expect(paidCalls()).toBeGreaterThan(timing.paidCallsAtCancel)
    expect(outcome.ok).toBe(true)
    // 本地重活也一镜不少：6 次抽帧、1 次取音轨。
    expect(countOf('frame')).toBe(6)
    expect(countOf('audio')).toBe(1)
  })

  it('一开始就给一个已 abort 的 signal：照样走完全部本地步骤和付费调用——编排里没有任何一步拿到它', async () => {
    const controller = new AbortController()
    controller.abort()
    const run = start(controller.signal)
    await letOrchestrationRun()
    await releaseUntilSettled(run.settled)
    const outcome = await run.done

    expect(outcome.ok).toBe(true)
    expect(paidCalls()).toBe(7)
    expect(countOf('cuts')).toBe(1)
    // signal 可达性：每一个子步骤收到的参数里都没有 AbortSignal；runTask 只收到 payload 一个参数（没有 signal 那一格）。
    expect(h.state.calls.some((call) => call.carriesSignal)).toBe(false)
    expect(h.state.calls.filter((call) => call.step === 'runTask').every((call) => call.argCount === 1)).toBe(true)
    for (const step of ['probe', 'cuts', 'frame', 'audio']) {
      expect(h.state.calls.filter((call) => call.step === step).every((call) => call.argCount === 1)).toBe(true)
    }
  })
})
