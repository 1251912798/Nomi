import { describe, expect, it } from 'vitest'

import { lastShotEngine } from './decideShotClaim'
import { IN_APP_AGENT_ORIGIN_HOST } from './productionGenerationPresentation'
import type { GenerationHandOver, GenerationPresentation, ProductionJob, ProductionRun, ProductionShotClaim } from '../productionRun/productionRunTypes'

// 失败之后节点上那颗「重试」走回哪一台发动机（D2 第③步：一台发动机）。
// 付费卡 / 「直接生成」档交给画布、在画布上失败的那一镜，重试必须还是画布（节点上再生成一次）；
// 制作流程自己派过作业的那一镜（外部宿主 / 调度器 / 升级前批过的旧卡）才走返工链。
// 同一类问题的每一个来路各一格：交接的每一种落定 × 两种决定方（手势 / 策略）、节点认领、制作作业、新旧尝试先后。

const NOW = '2026-10-24T00:00:00.000Z'

function job(shotId: string, attempt = 1): ProductionJob {
  return {
    jobId: `job-${shotId}-${attempt}`, stageId: 'generate', status: 'needs_attention', errorCode: 'provider_failed', attempt,
    provider: 'apimart', model: 'video', idempotencyKey: `k-${shotId}-${attempt}`, metadata: { shotId }, createdAt: NOW, updatedAt: NOW,
  }
}

function run(opts: {
  host?: string
  handOvers?: GenerationHandOver[]
  claim?: ProductionShotClaim
  jobs?: ProductionJob[]
  presentation?: boolean
}): ProductionRun {
  const candidate = { candidateId: 'cand-1', revision: 1, moduleId: 'm', providerId: 'apimart', modelId: 'video', mode: 't2v', prompt: '', parameters: {}, references: [] }
  const presentation: GenerationPresentation = {
    shotIds: ['s1', 's2'], openedAt: NOW, fromGate: 0,
    closed: { by: 'handed_to_canvas', at: NOW },
    ...(opts.handOvers ? { handOvers: opts.handOvers } : {}),
  }
  return {
    schemaVersion: 1, runId: 'op-1', projectId: 'proj-1', revision: 1, status: 'running', stageId: 'generate',
    playbook: { name: 'generation.multi-shot', version: '1.0.0' }, origin: { host: opts.host ?? IN_APP_AGENT_ORIGIN_HOST },
    policy: { trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 1, minimizeUploads: true },
    budget: { currency: 'CNY', authorized: 0, reserved: 0, actual: 0, unsettled: 0, unknownInFlight: 0 },
    planVersion: 1, snapshotCursor: 0, stages: [], gates: [], jobs: opts.jobs ?? [], artifacts: [],
    generationPlan: {
      operationId: 'op-1', state: 'draft', candidate,
      ...(opts.presentation === false ? {} : { presentations: [presentation] }),
      shots: ['s1', 's2'].map((shotId) => ({
        shotId, candidate: { ...candidate, candidateId: shotId }, updatedAt: NOW,
        ...(shotId === 's1' && opts.claim ? { claim: opts.claim } : {}),
      })),
      updatedAt: NOW,
    },
    createdAt: NOW, updatedAt: NOW,
  } as ProductionRun
}

const handOver = (by: GenerationHandOver['by'], outcome?: NonNullable<GenerationHandOver['settled']>['outcome']): GenerationHandOver => ({
  shotId: 's1', by, at: NOW, canvasRunId: 'canvas-run-1', ...(outcome ? { settled: { at: NOW, outcome } } : {}),
})

describe('lastShotEngine：失败之后重试走回跑过它的那一台', () => {
  it.each([
    ['gesture', 'accepted'], ['gesture', 'unknown'], ['gesture', 'not_sent'], ['gesture', 'withdrawn'], ['gesture', undefined],
    ['policy', 'accepted'], ['policy', 'unknown'], ['policy', 'not_sent'], ['policy', 'withdrawn'], ['policy', undefined],
  ] as const)('交给画布的那一镜（%s 交出去，落定 %s）→ 画布，不是制作流程的返工链', (by, outcome) => {
    expect(lastShotEngine(run({ handOvers: [handOver(by, outcome)] }), 's1')).toBe('canvas')
  })

  it('交给画布之前制作流程跑过一次（旧尝试有作业）→ 仍是画布：这一次是画布跑的', () => {
    expect(lastShotEngine(run({ handOvers: [handOver('gesture', 'accepted')], jobs: [job('s1')] }), 's1')).toBe('canvas')
  })

  it('节点上认领了这一次尝试（用户在节点上点了生成）→ 画布', () => {
    expect(lastShotEngine(run({ claim: { by: 'canvas', attempt: 1, claimedAt: NOW, via: 'node' } }), 's1')).toBe('canvas')
    expect(lastShotEngine(run({ claim: { by: 'canvas', attempt: 1, claimedAt: NOW, via: 'node' }, jobs: [job('s1')] }), 's1')).toBe('canvas')
  })

  it('画布认领的是上一次尝试、制作流程又派了新的一次 → 制作', () => {
    expect(lastShotEngine(run({ claim: { by: 'canvas', attempt: 1, claimedAt: NOW }, jobs: [job('s1', 1), job('s1', 2)] }), 's1')).toBe('production')
  })

  it('外部宿主 / 调度器：制作流程自己派过作业、没有交接 → 制作（返工链照旧）', () => {
    expect(lastShotEngine(run({ host: 'semantic-mcp', jobs: [job('s1')], presentation: false }), 's1')).toBe('production')
    expect(lastShotEngine(run({ jobs: [job('s1')] }), 's1')).toBe('production')
  })

  it('一笔都没派过（节点上生成的）→ 画布', () => {
    expect(lastShotEngine(run({}), 's1')).toBe('canvas')
    expect(lastShotEngine(run({ presentation: false }), 's1')).toBe('canvas')
  })

  it('只看这一镜：别的镜的交接不算它的', () => {
    const other: GenerationHandOver = { ...handOver('gesture', 'accepted'), shotId: 's2' }
    expect(lastShotEngine(run({ handOvers: [other], jobs: [job('s1')] }), 's1')).toBe('production')
  })
})
