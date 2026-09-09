import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { screenshotSettled } from '../_assert.mjs'
import { installFeelObserver } from '../_feel-observer.mjs'
import { installProbe, summarizeDom } from './dom.mjs'

export const hash = (value) => createHash('sha256').update(value).digest('hex')
export const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
export const rubricFile = new URL('./rubric.json', import.meta.url)

export async function createCollector({ journey, outputDir, identity }) {
  const rubric = await readJson(rubricFile)
  await fs.mkdir(outputDir, { recursive: true })
  const run = {
    version: 1,
    journey: journey.id,
    title: journey.title,
    expectedSteps: journey.steps,
    identity,
    provider: 'loopback',
    status: 'started',
    outcome: null,
    steps: [],
    startedAt: new Date().toISOString(),
  }
  let feelObserver
  let page,
    previousPointer = null
  const save = () => fs.writeFile(path.join(outputDir, 'steps.json'), JSON.stringify(run, null, 2) + '\n')
  async function attach(win) {
    if (page) throw new Error('Collector already attached')
    page = win
    await page.setViewportSize(rubric.viewport)
    feelObserver = installFeelObserver(page, { name: `experience-${journey.id}` })
    await page.addInitScript(installProbe)
    await page.evaluate(installProbe)
    run.startup = await page.evaluate(() => ({
      observedAtNavigationMs: performance.now(),
      domInteractiveMs: performance.getEntriesByType('navigation')[0]?.domInteractive ?? null,
      note: 'Observer attached after DOMContentLoaded; not a validated first-interactive time',
    }))
    await page.context().tracing.start({ screenshots: true, snapshots: true })
  }
  async function snapshot(name) {
    await screenshotSettled(page, { path: path.join(outputDir, name), mask: [page.locator('input[type=password]')] })
    return {
      screenshot: name,
      sha256: hash(await fs.readFile(path.join(outputDir, name))),
      dom: await page.evaluate(summarizeDom, rubric),
    }
  }
  async function step(id, action, { type = 'click', target, feedback, complete, confirmation = false } = {}) {
    if (journey.steps[run.steps.length] !== id)
      throw new Error(`Unexpected step ${id}; expected ${journey.steps[run.steps.length]}`)
    const prefix = `${String(run.steps.length + 1).padStart(2, '0')}-${id}`
    const before = await snapshot(`${prefix}-before.png`)
    const targetRect = target ? await target.boundingBox() : null
    await page.evaluate(
      ({ selector }) => {
        const state = window.__experienceProbe
        state.events = []
        state.longTasks = []
        state.start = performance.now()
        state.feedbackAt = null
        state.longTaskObserver?.takeRecords()
        if (selector) {
          const initial = document.querySelector(selector)
          const initiallyVisible = Boolean(
            initial && initial.getBoundingClientRect().width > 0 && getComputedStyle(initial).visibility !== 'hidden',
          )
          state.feedbackInitiallyVisible = initiallyVisible
          const check = () => {
            const el = document.querySelector(selector)
            if (
              !initiallyVisible &&
              el &&
              el.getBoundingClientRect().width > 0 &&
              getComputedStyle(el).visibility !== 'hidden'
            ) {
              state.feedbackAt ??= performance.now()
            }
          }
          state.feedbackObserver = new MutationObserver(check)
          state.feedbackObserver.observe(document, { subtree: true, attributes: true, childList: true })
        }
      },
      { selector: feedback || null },
    )
    const started = performance.now()
    let error, actionMs, completionMs
    try {
      await action()
      actionMs = performance.now() - started
      if (complete) await complete()
      completionMs = performance.now() - started
    } catch (caught) {
      error = caught
      actionMs ??= performance.now() - started
      completionMs = performance.now() - started
    }
    const observed = await page.evaluate(() => {
      const state = window.__experienceProbe
      state.feedbackObserver?.disconnect()
      const pending = state.longTaskObserver?.takeRecords() || []
      const tasks = [...state.longTasks, ...pending.map((e) => ({ start: e.startTime, duration: e.duration }))].filter(
        (e) => e.start >= state.start,
      )
      return {
        events: state.events,
        feedbackMs: state.feedbackAt === null ? null : state.feedbackAt - state.start,
        longTaskBlockingMs: state.longTaskObserver
          ? tasks.reduce((sum, e) => sum + Math.max(0, e.duration - 50), 0)
          : null,
      }
    })
    // Capture/scanning overhead is deliberately outside action and completion durations.
    const after = await snapshot(`${prefix}-after.png`)
    const feel = feelObserver.records.findLast((record) => record.screenshot === path.join(outputDir, after.screenshot))
    if (!feel) throw new Error('Shared feel observer did not record the step screenshot')
    let pointerDistancePx = 0,
      fittsSum = 0,
      pointerPairs = 0
    for (const event of observed.events) {
      if (!event.pointer) continue
      if (previousPointer) {
        const dx = event.pointer.x - previousPointer.x,
          dy = event.pointer.y - previousPointer.y,
          d = Math.hypot(dx, dy)
        // Rectangle chord along the movement direction; for zero movement ID=0.
        const w =
          d === 0
            ? Math.min(event.rect.width, event.rect.height)
            : Math.min(
                Math.abs(dx) > 0 ? (event.rect.width * d) / Math.abs(dx) : Infinity,
                Math.abs(dy) > 0 ? (event.rect.height * d) / Math.abs(dy) : Infinity,
              )
        if (w > 0) {
          event.distancePx = d
          event.effectiveWidthPx = w
          event.fittsId = Math.log2(d / w + 1)
          pointerDistancePx += d
          fittsSum += event.fittsId
          pointerPairs++
        }
      }
      previousPointer = event.pointer
    }
    const panelSwitches = JSON.stringify(after.dom.panels) !== JSON.stringify(before.dom.panels) ? 1 : 0
    const metrics = {
      clicks: observed.events.filter((e) => e.type === 'click').length,
      inputs: observed.events.filter((e) => e.type === 'input').length,
      keys: observed.events.filter((e) => e.type === 'keydown').length,
      scrolls: observed.events.filter((e) => e.type === 'wheel').length,
      automaticScrollEvents: observed.events.filter((e) => e.type === 'scroll').length,
      confirmations: confirmation ? observed.events.filter((e) => e.type === 'click').length : 0,
      panelSwitches,
      pointerDistancePx,
      fittsSum,
      pointerPairs,
      actionMs,
      completionMs,
      feedbackMs: observed.feedbackMs,
      longTaskBlockingMs: observed.longTaskBlockingMs,
    }
    run.steps.push({
      id,
      type,
      status: error ? 'failed' : 'completed',
      error: error?.message,
      targetRect,
      before,
      after,
      events: observed.events,
      metrics,
      feel,
    })
    await save()
    if (error) throw error
  }
  async function finish(outcome, error) {
    run.outcome = outcome
    run.status =
      !error && outcome?.passed === true && run.steps.length === journey.steps.length ? 'completed' : 'failed'
    run.error = error?.message
    run.finishedAt = new Date().toISOString()
    if (page) await page.context().tracing.stop({ path: path.join(outputDir, 'trace.zip') })
    await save()
    return run
  }
  return { attach, step, finish, run }
}
