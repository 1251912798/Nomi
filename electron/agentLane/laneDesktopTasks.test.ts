import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createArtifactProjection } from '../productionRun/artifactProjection'
import { applyProductionCommand } from '../productionRun/productionRunReducer'
import type { ProductionRun } from '../productionRun/productionRunTypes'

const domain = vi.hoisted(() => ({ readFull: vi.fn(), readArtifactProjection: vi.fn(), listener: undefined as undefined | ((run: ProductionRun) => void), unsubscribe: vi.fn() }))
vi.mock('../productionRun/productionRunRuntime', () => ({
  getProductionRunService: () => ({ readFull: domain.readFull, readArtifactProjection: domain.readArtifactProjection }),
  subscribeProductionRunChanges: (listener: (run: ProductionRun) => void) => { domain.listener = listener; return domain.unsubscribe },
}))
import { createDesktopLaneTasks } from './laneDesktopTasks'

const run = (changes: Partial<ProductionRun> = {}): ProductionRun => ({
  projectId: 'project-a', runId: 'run-a', status: 'running',
  stages: [{ status: 'completed' }, { status: 'running' }],
  budget: { currency: 'CNY', reserved: 12, actual: 3 }, artifacts: [],
  ...changes,
} as ProductionRun)

describe('lane task cards follow the ProductionRun owner', () => {
  it('does not turn brief/direction artifacts into empty media candidates', () => {
    domain.readFull.mockReturnValue(run({ artifacts: [
      { artifactId: 'brief', kind: 'brief', status: 'ready' },
      { artifactId: 'direction', kind: 'direction', status: 'ready' },
    ] as ProductionRun['artifacts'] }))
    const tasks = createDesktopLaneTasks('project-a', vi.fn())
    expect(tasks.resolve('run-a')).not.toHaveProperty('candidateIds')
    expect(tasks.resolve('run-a')?.candidates).toEqual([])
    tasks.dispose()
  })
  it('refreshes settled facts without rereading task files for every conversation delta', () => {
    vi.clearAllMocks()
    domain.readFull.mockReturnValue(run())
    const refresh = vi.fn()
    const tasks = createDesktopLaneTasks('project-a', refresh)
    expect(tasks.resolve('run-a')).toMatchObject({ status: 'running', stagesDone: 1, stagesTotal: 2,
      progress: 50, currency: 'CNY', spent: 3, estimated: 12, candidates: [] })
    for (let index = 0; index < 50; index += 1) tasks.resolve('run-a')
    expect(domain.readFull).toHaveBeenCalledOnce()
    domain.listener!(run({ status: 'completed', stages: [{ status: 'completed' }] as ProductionRun['stages'],
      budget: { currency: 'USD', actual: 7, reserved: 0 } as ProductionRun['budget'] }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(tasks.resolve('run-a')).toMatchObject({ status: 'complete', progress: 100, currency: 'USD', spent: 7, estimated: 0 })
    expect(domain.readFull).toHaveBeenCalledOnce()
    tasks.dispose()
    expect(domain.unsubscribe).toHaveBeenCalledOnce()
  })

  it('uses verified media previews and domain adoption eligibility for initial and changed tasks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nomi-lane-task-pixels-'))
    try {
      await writeFile(join(root, 'image.png'), 'fixture pixels')
      await writeFile(join(root, 'poster.png'), 'fixture poster')
      const artifacts = [
        { artifactId: 'image', kind: 'image', status: 'candidate', reviewStatus: 'approved', projectRelativePath: 'image.png' },
        { artifactId: 'adopted', kind: 'image', status: 'adopted', reviewStatus: 'approved', projectRelativePath: 'image.png' },
        { artifactId: 'unreviewed', kind: 'image', status: 'candidate', reviewStatus: 'waiting', projectRelativePath: 'image.png' },
        { artifactId: 'video', kind: 'video', status: 'ready', thumbnailRelativePath: 'poster.png' },
        { artifactId: 'missing', kind: 'image', status: 'candidate', projectRelativePath: 'missing.png' },
        { artifactId: 'outside', kind: 'image', status: 'candidate', projectRelativePath: '../outside.png' },
        { artifactId: 'video-without-poster', kind: 'video', status: 'ready', projectRelativePath: 'image.png' },
        { artifactId: 'rejected', kind: 'image', status: 'rejected', projectRelativePath: 'image.png' },
        { artifactId: 'brief', kind: 'brief', status: 'ready', projectRelativePath: 'image.png' },
      ].map(artifact => ({ ...artifact, stageId: 'generate', createdAt: '2026-09-08' })) as ProductionRun['artifacts']
      let current = run({ artifacts })
      domain.readFull.mockReturnValue(current)
      domain.readArtifactProjection.mockImplementation((_projectId, _runId, artifactId) => createArtifactProjection({
        projectRoot: root, run: current, artifact: current.artifacts.find(item => item.artifactId === artifactId)!, secret: 'fixture-secret',
      }))
      const refresh = vi.fn()
      const tasks = createDesktopLaneTasks('project-a', refresh)
      const candidates = tasks.resolve('run-a')!.candidates!
      expect(candidates.map(item => item.artifactId)).toEqual(['image', 'adopted', 'unreviewed', 'video'])
      expect(candidates.map(item => [item.canAdopt, item.adopted])).toEqual([[true, false], [false, true], [false, false], [false, false]])
      expect(candidates.every(item => item.projectId === 'project-a' && item.productionRunId === 'run-a'
        && item.thumbnailUrl.startsWith('nomi-local://production-preview/project-a/run-a/'))).toBe(true)
      const command = { commandId: 'adopt-image', expectedRevision: current.revision, type: 'artifact.adopt',
        payload: { artifactId: 'image' }, issuedAt: '2026-09-08T00:00:00Z' }
      expect(() => applyProductionCommand(current, { ...command, payload: { artifactId: 'unreviewed' } }, command.issuedAt))
        .toThrow('Artifact requires approved review')
      current = applyProductionCommand(current, command, command.issuedAt).run
      domain.listener!(current)
      expect(tasks.resolve('run-a')!.candidates![0]).toMatchObject({ adopted: true, canAdopt: false })
      expect(refresh).toHaveBeenCalledOnce()
      tasks.dispose()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('renews expired previews without rereading on every token delta', () => {
    vi.useFakeTimers()
    try {
      vi.clearAllMocks()
      domain.readFull.mockReturnValue(run({ artifacts: [{ artifactId: 'image', kind: 'image', status: 'candidate' }] as ProductionRun['artifacts'] }))
      domain.readArtifactProjection.mockImplementation(() => ({ projectId: 'project-a', runId: 'run-a', artifactId: 'image',
        preview: { nomiUrl: 'nomi-local://production-preview/image', expiresAt: new Date(Date.now() + 60_000).toISOString() } }))
      const tasks = createDesktopLaneTasks('project-a', vi.fn())
      for (let index = 0; index < 50; index += 1) tasks.resolve('run-a')
      expect(domain.readFull).toHaveBeenCalledOnce()
      vi.setSystemTime(Date.now() + 60_001)
      expect(tasks.resolve('run-a')!.candidates).toHaveLength(1)
      expect(domain.readFull).toHaveBeenCalledTimes(2)
      tasks.dispose()
    } finally { vi.useRealTimers() }
  })

  it('does not paint a different project task as the current project or invent missing facts', () => {
    vi.clearAllMocks()
    domain.readFull.mockImplementation(() => { throw new Error('run not found') })
    const refresh = vi.fn()
    const tasks = createDesktopLaneTasks('project-a', refresh)
    domain.listener!(run({ projectId: 'project-b' }))
    expect(refresh).not.toHaveBeenCalled()
    expect(tasks.resolve('run-a')).toBeUndefined()
    tasks.dispose()
  })
})
