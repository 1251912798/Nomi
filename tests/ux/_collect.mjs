import { AsyncLocalStorage } from 'node:async_hooks'
const context = new AsyncLocalStorage()

// Only active collect stations soften assertions; callers without a station remain fail-fast.
export function collectingExpect(native) {
  function matcherProxy(matchers) {
    return new Proxy(matchers, { get(target, key) {
      const value = Reflect.get(target, key)
      if (['not', 'resolves', 'rejects'].includes(key)) return matcherProxy(value)
      if (typeof value !== 'function') return value
      return (...args) => {
        const fail = error => {
          const active = context.getStore()
          if (!active || active.walk.mode !== 'collect') throw error
          active.walk.record(error, active.entry, { assertion: String(key) })
        }
        try {
          const result = value.apply(target, args)
          return result?.then ? result.catch(fail) : result
        } catch (error) { return fail(error) }
      }
    } })
  }
  return new Proxy(native, {
    apply(target, self, args) { return matcherProxy(Reflect.apply(target, self, args)) },
    get(target, key) {
      if (key === 'poll') return (...args) => matcherProxy(target.poll(...args))
      if (key === 'configure') return (...args) => collectingExpect(target.configure(...args))
      return Reflect.get(target, key)
    },
  })
}

export function createWalkSession({ mode = process.env.NOMI_WALK_MODE ?? 'fail-fast', capture, persist = () => {}, cost = () => 0 } = {}) {
  if (!['collect', 'fail-fast'].includes(mode)) throw Error(`Unknown walk mode: ${mode}`)
  let repaired = false
  const walk = {
    mode, deviations: [], stations: [],
    record(error, entry, details = {}) {
      const row = { id: `D${walk.deviations.length + 1}`, station: entry.id, surface: entry.surface,
        assertion: error.matcherResult?.name ?? details.assertion ?? 'station-action',
        expected: error.matcherResult?.expected ?? entry.expected ?? null,
        actual: error.matcherResult?.actual ?? null, phenomenon: error.message ?? String(error),
        timestamp: new Date().toISOString(), screenshot: entry.screenshot ?? null,
        repaired: false, repairedBy: null, reachedViaRepair: entry.reachedViaRepair,
        layer: details.layer ?? (/Invalid schema/.test(error.message ?? '') ? '契约' : error.matcherResult ? 'UI' : '测试装配'), root_cause_cluster: '', ...details }
      walk.deviations.push(row)
      persist(walk)
      return row
    },
    async station(spec, run) {
      const entry = { id: spec.id, surface: spec.surface, expected: spec.expected, action: spec.action, interruption: spec.interruption,
        started: new Date().toISOString(), reachedViaRepair: repaired, status: 'running' }
      walk.stations.push(entry)
      const first = walk.deviations.length, began = performance.now(), beforeCost = cost()
      let thrown
      try {
        if (spec.requires && !spec.requires()) {
          entry.unreachable = true
          entry.reachedViaRepair = false
          throw Error('站点不可达：前置项目或窗口未准备成功')
        }
        await context.run({ walk, entry }, run)
      } catch (error) {
        thrown = error
        if (mode !== 'collect') throw error
        walk.record(error, entry)
      } finally {
        const repairable = walk.deviations.slice(first)
        try { Object.assign(entry, await capture?.(entry)) }
        catch (error) {
          if (mode !== 'collect') throw error
          walk.record(error, entry, { assertion: 'station-evidence' })
        }
        if (entry.captureDeviation && mode === 'collect') walk.record(Error(entry.captureDeviation), entry, { assertion: 'visual-quiescence', layer: 'UI' })
        for (const issue of entry.captureIssues ?? []) walk.record(Error(issue.phenomenon), entry, issue)
        for (const d of walk.deviations.slice(first)) d.screenshot = entry.screenshot ?? null
        if (repairable.length && !entry.unreachable && spec.repair && mode === 'collect') {
          const failures = repairable
          try {
            await spec.repair.run()
            repaired = true
            for (const d of failures) { d.repaired = true; d.repairedBy = spec.repair.name }
          } catch (error) { walk.record(error, entry, { assertion: 'test-side-repair', repairedBy: spec.repair.name }) }
        }
        entry.status = entry.unreachable ? 'unreachable' : thrown || walk.deviations.length > first ? 'failed' : 'passed'
        entry.ended = new Date().toISOString()
        entry.seconds = (performance.now() - began) / 1000
        entry.costCny = cost() - beforeCost
        persist(walk)
      }
      return entry
    },
  }
  return walk
}
