// C66–C68: isolated real Electron, prompt-driven tools, computed hierarchy and focus.
import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, applyColorSchemeForShot, screenshotSettled } from './_assert.mjs'
import { measureDisclosureHierarchy } from './_feel.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from './agent-runtime-fixture.mjs'
import { createRuntimeWalk, chooseAssistantModel, sendCreation, recorded, hasToolResult, waitForV4TurnIdle, CREATION_PANEL, DOCUMENT } from './agent-runtime-walk-support.mjs'

const out = path.resolve('docs/plan/agent-process-tone-evidence')
await fs.mkdir(out, { recursive: true })
const walk = await createRuntimeWalk('agent-process-tone')
let failure
try {
  const { win } = await walk.start({ first: true })
  await walk.newProject()
  await win.locator(DOCUMENT).fill('清晨，女孩推开窗户，看见远处的山。')
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  await win.keyboard.press('Escape')
  await win.locator(DOCUMENT).click()
  const ask = '请读取两次文稿并核对'
  const calls = ['tone-read-1', 'tone-read-2']
  const first = walk.fixture.expectText({ label: 'first read', match: body => flattenRequestText(body).includes(ask) && !hasToolResult(body, calls[0]), reply: { type: 'tool', id: calls[0], name: 'nomi_document_read', args: { scope: 'full' } } })
  walk.fixture.expectText({ label: 'second read', match: body => hasToolResult(body, calls[0]) && !hasToolResult(body, calls[1]), reply: { type: 'tool', id: calls[1], name: 'nomi_document_read', args: { scope: 'full' } } })
  const done = walk.fixture.expectText({ label: 'comparison', match: body => hasToolResult(body, calls[1]), reply: { type: 'text', text: '已核对，两次读取的文稿一致。' } })
  await sendCreation(win, ask)
  await recorded(first.received, 'first document read')
  await recorded(done.received, 'comparison')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL, settledBy: win.getByText('已核对，两次读取的文稿一致。', { exact: true }) })
  const processRow = win.locator('[data-v4-block="process"]')
  await expect(processRow).toHaveCount(1)
  const summary = processRow.locator(':scope > summary')
  const evidence = {}
  for (const scheme of ['light', 'dark']) {
    await applyColorSchemeForShot(win, scheme)
    if (await processRow.evaluate(el => el.open)) await summary.click()
    await screenshotSettled(win, { path: path.join(out, `${scheme}-collapsed.png`) })
    await summary.click()
    const groupRow = processRow.locator('[data-v4-block="tool-group"]')
    if (!await groupRow.evaluate(el => el.open)) await groupRow.locator(':scope > summary').click()
    const receipt = processRow.locator('[data-v4-block="tool"] > summary').first()
    if (!await receipt.evaluate(el => el.parentElement.open)) await receipt.click()
    await screenshotSettled(win, { path: path.join(out, `${scheme}-expanded.png`) })
    const hierarchy = await measureDisclosureHierarchy(processRow, { exclude: 'svg, .text-nomi-success, .text-nomi-danger, .text-nomi-accent, [data-process-elapsed]' })
    console.log(scheme, 'hierarchy', JSON.stringify(hierarchy))
    expect(hierarchy.violations, 'C66: children must not be darker or bolder than summary').toEqual([])
    expect(await summary.innerText()).not.toContain('0 次重试')
    const focuses = []
    for (const target of [summary, processRow.locator('[data-v4-block="tool-group"] > summary'), receipt]) {
      await target.click()
      const mouse = await target.evaluate(el => ({ visible: el.matches(':focus-visible'), color: getComputedStyle(el).outlineColor, style: getComputedStyle(el).outlineStyle }))
      expect(mouse.visible, 'C67 mouse must not show focus ring').toBe(false)
      expect(mouse.style).toBe('none')
      if (target === summary) await screenshotSettled(win, { path: path.join(out, `${scheme}-mouse.png`) })
      await win.keyboard.press('Shift+Tab')
      await win.keyboard.press('Tab')
      await expect(target).toBeFocused()
      const keyboard = await target.evaluate(el => {
        const css = getComputedStyle(el)
        const probe = document.createElement('span')
        probe.style.color = 'var(--nomi-accent)'
        el.append(probe)
        const accent = getComputedStyle(probe).color
        probe.remove()
        return { visible: el.matches(':focus-visible'), width: css.outlineWidth, color: css.outlineColor, accent }
      })
      expect(keyboard.visible).toBe(true)
      expect(keyboard.width).toBe('2px')
      expect(keyboard.color).toBe(keyboard.accent)
      if (target === summary) await screenshotSettled(win, { path: path.join(out, `${scheme}-tab.png`) })
      focuses.push({ mouse, keyboard })
      // Ensure descendants stay available for the next summary probe.
      if (!await processRow.evaluate(el => el.open)) await summary.click()
      const group = processRow.locator('[data-v4-block="tool-group"]')
      if (!await group.evaluate(el => el.open)) await group.locator(':scope > summary').click()
    }
    evidence[scheme] = { hierarchy, focuses }
  }
  // Independent entry: ungrouped receipt containing headings, bold and syntax colors.
  await win.locator(DOCUMENT).fill('# 核对标题\n\n**重点**\n\n```js\nconst scene = "山"\n```')
  const formatAsk = '请再读取文稿并核对格式'
  const formatRead = walk.fixture.expectText({ label: 'formatted document read', match: body => flattenRequestText(body).includes(formatAsk) && !hasToolResult(body, 'tone-format'), reply: { type: 'tool', id: 'tone-format', name: 'nomi_document_read', args: { scope: 'full' } } })
  const formatDone = walk.fixture.expectText({ label: 'format answer', match: body => hasToolResult(body, 'tone-format'), reply: { type: 'text', text: '格式核对完成。' } })
  await sendCreation(win, formatAsk)
  await recorded(formatRead.received, 'formatted document read')
  await recorded(formatDone.received, 'format answer')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL, settledBy: win.getByText('格式核对完成。', { exact: true }) })
  const formatted = win.locator('[data-v4-block="process"]').last()
  await formatted.locator(':scope > summary').click()
  const formattedReceipt = formatted.locator('[data-v4-block="tool"]')
  if (!await formattedReceipt.evaluate(el => el.open)) await formattedReceipt.locator(':scope > summary').click()
  await expect(formatted.locator('[data-v4-markdown] strong')).toHaveText('重点')
  await expect(formatted.locator('[data-streamdown="code-block"]')).toContainText('const scene')
  for (const scheme of ['light', 'dark']) {
    await applyColorSchemeForShot(win, scheme)
    const hierarchy = await measureDisclosureHierarchy(formatted, { exclude: 'svg, .text-nomi-success, .text-nomi-danger, .text-nomi-accent, [data-process-elapsed]' })
    expect(hierarchy.violations, 'C66 includes Markdown emphasis and code in ungrouped receipts').toEqual([])
    evidence[scheme].formatted = hierarchy
  }
  walk.fixture.assertClean()
  await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify({ paidCalls: 0, toolCalls: 3, completedTurns: 2, evidence }, null, 2))
} catch (error) { failure = error } finally { await walk.finish(failure) }
