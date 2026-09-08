// Real Electron tasks: draft in composer, find a project, inspect a budget field,
// and edit a storyboard cell. No production DOM/CSS injection or paid generation.
import { expect } from './_assert.mjs'
import {
  createRuntimeWalk, openCanvas, CANVAS_PANEL, COMPOSER, COMPOSER_INPUT, COMPOSER_ADD_FILE,
} from './agent-runtime-walk-support.mjs'
const walk = await createRuntimeWalk('focus-indication')
let failure
try {
  const { win } = await walk.start({ first: true })
  walk.report.focus = []
  walk.report.surfaces = []
  const recordSurface = async (label, root = win.locator('body')) => {
    const counts = await root.locator('input,textarea,button,a[href],select,summary,[tabindex],[contenteditable]').evaluateAll(elements => {
      const visible = elements.filter(e => { const r=e.getBoundingClientRect(); const s=getComputedStyle(e); return r.width>0 && r.height>0 && s.visibility!=='hidden' && !e.closest('[inert]') })
      return { visible: visible.length, enabled: visible.filter(e=>!e.disabled).length }
    })
    walk.report.surfaces.push({ label, ...counts })
  }
  const measure = (target) => target.evaluate(e => {
    const s = getComputedStyle(e)
    const probe = document.createElement('span'); document.body.append(probe)
    probe.style.color='var(--nomi-accent)'; const accent=getComputedStyle(probe).color
    probe.style.color='var(--nomi-focus)'; const token=getComputedStyle(probe).color
    probe.remove()
    return { focused:document.activeElement===e, visible:e.matches(':focus-visible'), outlineStyle:s.outlineStyle, outlineWidth:s.outlineWidth, outlineColor:s.outlineColor, borderColor:s.borderColor, borderWidth:s.borderWidth, accent, token }
  })
  const inspectText = async (label, target, container = target) => {
    await expect(target, label).toBeVisible()
    await target.click()
    const mouse = await measure(target)
    expect(mouse.focused, `${label} actually focused`).toBe(true)
    expect(mouse.outlineStyle, `${label} has no pointer outer ring`).toBe('none')
    await expect.poll(async () => (await measure(container)).borderColor, { message: `${label} container focus color` }).toBe(mouse.accent)
    await walk.snap(`${label}-mouse`)
    await win.keyboard.press('Tab'); await win.keyboard.press('Shift+Tab')
    const keyboard = await measure(target)
    expect(keyboard.focused, `${label} Tab roundtrip`).toBe(true)
    expect(keyboard.outlineStyle, `${label} keyboard text has no outer ring`).toBe('none')
    walk.report.focus.push({ label, mouse, keyboard, container: await measure(container) })
  }
  const search = win.getByRole('searchbox', { name: '搜索项目', exact: true })
  await inspectText('library-search', search, search.locator('..'))
  await search.fill('FOCUS-JOURNEY')
  await expect(search).toHaveValue('FOCUS-JOURNEY')
  await search.fill('')
  await recordSurface('library')
  await walk.newProject()
  await openCanvas(win)
  const input = win.locator(`${CANVAS_PANEL} ${COMPOSER_INPUT}`)
  const composer = win.locator(`${CANVAS_PANEL} ${COMPOSER}`)
  await input.fill('远景，雨后的街道。先保留这条创作草稿。')
  await inspectText('canvas-composer', input, composer)
  await win.keyboard.press('Tab')
  const button = win.locator(`${CANVAS_PANEL} ${COMPOSER_ADD_FILE}`)
  const keyboard = await measure(button)
  expect(keyboard.focused, 'Tab reaches add-file button').toBe(true)
  expect(keyboard.outlineStyle).toBe('solid')
  expect(keyboard.outlineWidth).toBe('2px')
  expect(keyboard.outlineColor).toBe(keyboard.token)
  walk.report.focus.push({ label:'canvas-button-keyboard', keyboard })
  await walk.snap('canvas-button-keyboard')
  await recordSurface('canvas')
  await win.getByRole('button', { name:'设置', exact:true }).click()
  const settings = win.getByRole('dialog', { name:'设置', exact:true })
  await settings.getByRole('button', { name:'AI 策略', exact:true }).click()
  const budget = settings.locator('[data-settings-field="hard-budget"]')
  await inspectText('settings-budget', budget)
  await recordSurface('settings', settings)
  await settings.locator('[data-settings-close]').click()
  await expect(input).toHaveValue('远景，雨后的街道。先保留这条创作草稿。')
  await win.getByRole('button', { name:'创作', exact:true }).click()
  await win.getByRole('button', { name:/^分镜方案,/ }).click()
  const storyboard = win.locator('[data-storyboard-editor="true"]')
  await expect(storyboard).toBeVisible()
  const cell = storyboard.locator('[data-storyboard-row="1"] [contenteditable="true"]')
  await expect(cell).toBeVisible()
  await cell.fill('远景：雨后街道，行人走过路灯。')
  const cellContainer = cell.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " border ")][1]')
  await inspectText('storyboard-cell', cell, cellContainer)
  await expect(cell).toContainText('远景：雨后街道')
  walk.report.focus.push({label:'storyboard-cell', mouse:await measure(cell), ancestors:await cell.evaluate(e=>{const out=[];for(let x=e;x&&out.length<6;x=x.parentElement)out.push({tag:x.tagName,class:x.className,border:getComputedStyle(x).border});return out})})
  await recordSurface('storyboard',storyboard)
} catch (error) { failure=error } finally { await walk.finish(failure) }
