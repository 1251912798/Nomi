import { beforeAll, beforeEach, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { useBrowserFixture } from './_browserFixture.mjs'

const ENTRY = 'tests/ux/fixtures/selection-drag-lifecycle-harness.html'
// 冷启动（vite 首次转译整棵画布 store）在准备阶段由 _browserFixture.mjs 编完，每个用例前的 goto 只是执行页面。
const fixture = useBrowserFixture({ entries: [ENTRY], browserType: chromium, ready: '#group' })
let page
beforeAll(async () => { page = await fixture.browser.newPage() })
beforeEach(async () => {
  await page.goto(fixture.url(ENTRY))
  await page.locator('#group').waitFor()
  await frames()
})
const frames = () =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const snapshot = () => page.evaluate(() => window.selectionDragFixture.snapshot())
async function start(target) {
  await page
    .locator(`#${target}`)
    .dispatchEvent('pointerdown', { pointerId: 7, button: 0, clientX: 10, clientY: 10, bubbles: true })
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 40, clientY: 35, bubbles: true })),
  )
}
const release = () =>
  page.evaluate(() =>
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 90, clientY: 90, bubbles: true })),
  )
async function interrupt(reason) {
  await page.evaluate((reason) => {
    if (reason === 'blur') window.dispatchEvent(new Event('blur'))
    else if (reason === 'hidden') window.selectionDragFixture.hide()
    else if (reason === 'unmount') window.selectionDragFixture.unmount()
    else if (reason === 'readOnly') window.selectionDragFixture.readOnly()
    else window.dispatchEvent(new PointerEvent(reason, { pointerId: 7, bubbles: true }))
  }, reason)
  await frames()
}
// 唯一的拖动入口是组框（生产里从没有别的所有者）：每一种收尾方式都必须只在落点写一次、拖动途中 revision / events 纹丝不动。
const target = 'group'
// 收尾方式矩阵：每一种结束 / 打断手势的方式都要走同一个共享 settle 边界。
const SETTLE_REASON_MATRIX = ['pointerup', 'blur', 'hidden', 'unmount', 'readOnly', 'pointercancel', 'lostpointercapture']
it.each(SETTLE_REASON_MATRIX)(
  `${target} settles applied positions once on %s`,
  async (reason) => {
    const before = await snapshot()
    expect(before.groups).toHaveLength(1)
    await start(target)
    await frames()
    const moved = await snapshot()
    // Group drag keeps React Flow's measured wrappers stationary during the
    // gesture; the production shell and member shells move through the DOM preview
    // and the store commits the final position at settle.
    expect(moved.nodes[0].position).toEqual({ x: 10, y: 20 })
    expect(moved.groupPreview).toBe('30px 25px')
    expect(moved.memberPreview).toBe('30px 25px')
    expect(moved.revision).toBe(before.revision)
    expect(moved.events).toEqual([])
    await interrupt(reason)
    const settled = await snapshot()
    expect(settled.nodes[0].position).toEqual({ x: 40, y: 45 })
    expect(settled.groupPreview).toBe('')
    expect(settled.memberPreview).toBe('')
    expect(settled.revision).toBe(before.revision + 1)
    expect(settled.events.filter((event) => event.type === 'canvas.node.moved')).toHaveLength(2)
    expect(settled.groups[0].frameBounds).toMatchObject({ x: 30, y: 25 })
    expect(settled.dragging).toBeNull()
    await release()
    expect(await snapshot()).toEqual(settled)
    await page.evaluate(() => window.selectionDragFixture.undo())
    expect((await snapshot()).nodes.map((node) => node.position)).toEqual(before.nodes.map((node) => node.position))
    await page.evaluate(() => window.selectionDragFixture.redo())
    expect((await snapshot()).nodes.map((node) => node.position)).toEqual(settled.nodes.map((node) => node.position))
  },
)
it.each(['replaceGraph', 'switchProject'])(
  `${target} ignores queued movement and late release after %s with reused IDs`,
  async (replacement) => {
    await start(target)
    await frames()
    await page.evaluate((replacement) => window.selectionDragFixture[replacement](), replacement)
    const replaced = await snapshot()
    await page.evaluate(() =>
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 90, clientY: 90, bubbles: true })),
    )
    await interrupt('blur')
    await release()
    const after = await snapshot()
    expect(after.nodes).toEqual(replaced.nodes)
    expect(after.groups).toEqual(replaced.groups)
    expect(after.revision).toBe(replaced.revision)
    expect(after.events).toEqual(replaced.events)
    expect(after.dragging).toBeNull()
  },
)
it('flushes the original pending RAF on blur before the first frame', async () => {
  const before = await snapshot()
  await page
    .locator('#group')
    .dispatchEvent('pointerdown', { pointerId: 7, button: 0, clientX: 10, clientY: 10, bubbles: true })
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 40, clientY: 35, bubbles: true }))
    window.dispatchEvent(new Event('blur'))
  })
  const settled = await snapshot()
  expect(settled.nodes[0].position).toEqual({ x: 40, y: 45 })
  expect(settled.revision).toBe(before.revision + 1)
  expect(settled.events.filter((event) => event.type === 'canvas.node.moved')).toHaveLength(2)
})
it.each(['replaceGraph', 'invalidateProject'])(
  'rejects a queued RAF after %s before it writes',
  async (replacement) => {
    await page
      .locator('#group')
      .dispatchEvent('pointerdown', { pointerId: 7, button: 0, clientX: 10, clientY: 10, bubbles: true })
    await page.evaluate((replacement) => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 40, clientY: 35, bubbles: true }))
      window.selectionDragFixture[replacement]()
    }, replacement)
    const replaced = await snapshot()
    await frames()
    await interrupt('blur')
    await release()
    const after = await snapshot()
    expect(after.nodes).toEqual(replaced.nodes)
    expect(after.groups).toEqual(replaced.groups)
    expect(after.revision).toBe(replaced.revision)
    expect(after.events).toEqual(replaced.events)
    expect(after.dragging).toBeNull()
  },
)
// 门岗：目标在按下时解析一次并持有，拖动帧内不许再做全局 DOM 查询（P-dragframe：querySelectorAll 曾占每帧 96%）。
it('group drag resolves its targets once at pointerdown, never per frame', async () => {
  await page.evaluate(() => window.selectionDragFixture.countQueries())
  await page
    .locator(`#${target}`)
    .dispatchEvent('pointerdown', { pointerId: 7, button: 0, clientX: 10, clientY: 10, bubbles: true })
  const afterDown = await page.evaluate(() => window.selectionDragFixture.queryCalls())
  for (let step = 1; step <= 6; step += 1) {
    await page.evaluate(
      (step) =>
        window.dispatchEvent(
          new PointerEvent('pointermove', { pointerId: 7, clientX: 10 + step * 5, clientY: 10 + step * 4, bubbles: true }),
        ),
      step,
    )
    await frames()
  }
  expect((await snapshot()).memberPreview).not.toBe('')
  expect(await page.evaluate(() => window.selectionDragFixture.queryCalls())).toBe(afterDown)
  await release()
  expect((await snapshot()).nodes[0].position).toEqual({ x: 40, y: 44 })
})
it('survives a member being deleted and unmounted mid-drag: no error, nothing resurrected, rest lands once', async () => {
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  const before = await snapshot()
  await start('group')
  await frames()
  await page.evaluate(() => window.selectionDragFixture.dropMember())
  await frames()
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 60, clientY: 50, bubbles: true })),
  )
  await frames()
  await release()
  const settled = await snapshot()
  expect(errors).toEqual([])
  expect(settled.nodes.map((node) => node.id)).toEqual(['one'])
  expect(settled.nodes[0].position).toEqual({ x: 60, y: 60 })
  expect(settled.groupPreview).toBe('')
  expect(settled.revision).toBeGreaterThan(before.revision)
  expect(settled.dragging).toBeNull()
})
it('ignores Escape while dragging: the gesture still settles once, undoable', async () => {
  const before = await snapshot()
  await start('group')
  await frames()
  await page.keyboard.press('Escape')
  await frames()
  await release()
  const settled = await snapshot()
  expect(settled.nodes[0].position).toEqual({ x: 40, y: 45 })
  expect(settled.revision).toBe(before.revision + 1)
  await page.evaluate(() => window.selectionDragFixture.undo())
  expect((await snapshot()).nodes[0].position).toEqual(before.nodes[0].position)
})
