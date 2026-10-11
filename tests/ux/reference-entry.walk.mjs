// Production Electron + genuine UI asset import. Only the text supplier is loopback.
// Asset ids are observed through main and on the actual outbound request, never seeded.
import fs from 'node:fs'
import path from 'node:path'
import { expect, clickOrFail } from './_assert.mjs'
import { canvasAddBar, canvasAddMoreMenu, canvasFitView, collapseAgentPanel, ensureAgentPanelOpen } from './_shell.mjs'
import { createRuntimeWalk, CREATION_PANEL, CANVAS_PANEL, COMPOSER, COMPOSER_INPUT, openCanvas,
  recorded, waitForV4TurnIdle, chooseAssistantModel, readProject } from './agent-runtime-walk-support.mjs'
import { readLaneTranscripts } from './agent-lane-observer.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from './agent-runtime-fixture.mjs'

const walk = await createRuntimeWalk('reference-entry')
const snapshots = []
let textTargetId
const capture = async (win, label, selector) => {
  snapshots.push({ label, html: await win.locator(selector).last().evaluate(root => {
    const clone = root.cloneNode(true)
    const properties = ['display','color','background-color','border','border-radius','padding','gap','font-size','font-weight','font-family','line-height','flex-direction','align-items','justify-content','width','height','min-width','max-width','min-height','max-height','box-sizing','flex-grow','flex-shrink','flex-basis','overflow','white-space','object-fit','vertical-align']
    const originals = [root, ...root.querySelectorAll('*')]
    const copies = [clone, ...clone.querySelectorAll('*')]
    originals.forEach((node,index) => { const style=getComputedStyle(node); copies[index].setAttribute('style', properties.map(key=>`${key}:${style.getPropertyValue(key)}`).join(';')) })
    return clone.outerHTML
  }).then(html => html.replace(/nomi-local:\/\/asset\/[^/]+\/([^\"]+)/g, (url, relative) => {
    const file = path.join(walk.report.projectRoot, decodeURIComponent(relative))
    return fs.existsSync(file) ? `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}` : url
  })) })
}
let failure
try {
  const { win } = await walk.start({ first: true })
  win.on('console', message => { if (message.type()==='error') console.error('[renderer]',message.text()) })
  win.on('pageerror', error => console.error('[pageerror]',error.stack))
  const { projectId, projectRoot } = await walk.newProject()
  const panel = win.locator(CREATION_PANEL)
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  const files = [path.resolve('src/devlab/designLab/videoNodeNext/fixtures/frame-current.jpg'), path.resolve('public/fixtures/node-label-video.mp4')]
  await panel.locator('input[type="file"]').setInputFiles(files)
  await expect.poll(() => win.evaluate(async id => (await window.nomiDesktop.assets.list({ projectId:id, limit:100 })).items.length, projectId)).toBe(2)
  const input = panel.locator(COMPOSER_INPUT)
  await expect(panel.locator('[data-reference-entry]')).toHaveText('')
  await expect(panel.locator('[data-reference-entry] svg')).toBeVisible()
  await input.click()
  const atoms = input.locator('[data-storyboard-mention-chip]')
  await expect(atoms).toHaveCount(2)
  await expect(panel.locator('[data-v4-chip="file"]')).toHaveCount(0)
  // Delete the references from the sentence; their originals remain in the asset library.
  await input.fill('')
  await expect(atoms).toHaveCount(0)
  const composer=panel.locator(COMPOSER)
  const small=await composer.evaluate(el=>el.getBoundingClientRect().height)
  await input.fill(Array.from({length:35},(_,i)=>`Line ${i}: a real paragraph`).join('\n'))
  await expect.poll(()=>composer.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(small)
  await input.fill('')
  await expect.poll(()=>composer.evaluate(el=>el.getBoundingClientRect().height), {message:'board:ReferenceEntry/agent.height.shrinks'}).toBeLessThanOrEqual(small+2)
  await input.pressSequentially('@frame-current')
  await expect(win.locator('[data-mention-list]'), 'board:ReferenceEntry/agent.at.search').toBeVisible()
  await input.press('Enter')
  await expect(atoms).toHaveCount(1)
  await input.press('End')
  await input.pressSequentially(' change the background')
  await input.press('Shift+Enter')
  await expect(input.locator('br')).not.toHaveCount(0)
  await input.pressSequentially('@node-label-video')
  await expect(win.locator('[data-mention-list]')).toBeVisible()
  await input.press('Enter')
  await expect(atoms).toHaveCount(2)
  await input.press('End')
  const marker = 'REFERENCE_ENTRY_EXACT_ORIGINALS'
  await input.pressSequentially(` animate the movement ${marker}`)
  await expect(panel.locator('[data-v4-chip="file"]')).toHaveCount(0)
  const answer = walk.fixture.expectText({ label:'inline references with separate instructions', match:body=>flattenRequestText(body).includes(marker), reply:{type:'text',text:'REFERENCE_ENTRY_DONE'} })
  await walk.snap('agent-inline-references-zh')
  await capture(win, 'agent-inline-reference', `${CREATION_PANEL} ${COMPOSER}`)
  await input.press('Enter')
  const wire = await recorded(answer.received,'real Agent inline reference request')
  const assets = await win.evaluate(async id => (await window.nomiDesktop.assets.list({ projectId:id, limit:100 })).items, projectId)
  const latest = wire.body.messages.filter(message => message.role === 'user').at(-1)
  const requestText = flattenRequestText({ messages:[latest] })
  for (const asset of assets) expect(requestText).toContain(asset.id)
  expect(requestText).toContain('@image1 change the background\n@video1 animate the movement')
  expect(requestText).toContain('have not been watched or listened to')
  expect(JSON.stringify(latest)).toContain('data:image/')
  await waitForV4TurnIdle(win, { panel:CREATION_PANEL, settledBy:panel.getByText('REFERENCE_ENTRY_DONE', { exact:true }) })
  walk.report.wire = { canonicalAssetIds:assets.map(item=>item.id), imageBytes:true, videoOriginalIdentity:true, semanticAV:false }
  await openCanvas(win)
  const canvasPanel = win.locator(CANVAS_PANEL)
  await collapseAgentPanel(win)
  const toolbar = canvasAddBar(win)
  const nodeAssertions = {
    image: { visible: 'board:ReferenceEntry/node.image.visible', direct: 'board:ReferenceEntry/node.image.direct' },
    video: { visible: 'board:ReferenceEntry/node.video.visible', direct: 'board:ReferenceEntry/node.video.direct' },
    text: { visible: 'board:ReferenceEntry/node.text.visible', direct: 'board:ReferenceEntry/node.text.direct' },
  }
  for (const kind of ['image','video','text']) {
    const direct = toolbar.locator(`[data-node-kind="${kind}"]`).first()
    if (await direct.isVisible()) await direct.click()
    else { await toolbar.locator('[data-canvas-add-more="true"]').click(); await canvasAddMoreMenu(win).locator(`[data-node-kind="${kind}"]`).click() }
    await canvasFitView(win, `show ${kind} node and its reference entry`)
    const composer = win.locator('.generation-canvas-v2-node__composer').last()
    await expect(composer.locator('[data-reference-entry]'), nodeAssertions[kind].visible).toBeVisible()
    await walk.snap(`${kind}-reference-first-open-zh`)
    await capture(win, `node-${kind}`, '.generation-canvas-v2-node__composer')
    await composer.locator('[data-reference-entry]').click()
    await expect(win.locator('[data-canvas-pick-bar]'), nodeAssertions[kind].direct).toBeVisible()
    await expect(win.getByTestId('asset-picker')).toHaveCount(0)
    await walk.snap(`${kind}-direct-canvas-pick-zh`)
    await win.keyboard.press('Escape')
    if (kind === 'text') {
      const targetId = await composer.locator('[data-reference-entry]').evaluate(button => button.closest('[data-node-id]').getAttribute('data-node-id'))
      textTargetId=targetId
      await composer.locator('[data-reference-add]').click()
      await expect(win.getByTestId('asset-picker')).toBeVisible()
      await capture(win,'node-plus-picker','[data-testid="asset-picker"]')
      await win.getByTestId('asset-picker').getByRole('button', { name:path.basename(files[0]), exact:true }).click()
      await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.edges.some(edge=>edge.target===targetId), { message:'board:ReferenceEntry/node.text.connected' }).toBe(true)
      walk.report.textReferenceEdge = true
    }
  }
  const projectBefore=await readProject(win,projectId)
  const targetNode=win.locator(`.react-flow__node[data-id="${textTargetId}"]`)
  await targetNode.click({position:{x:8,y:8}})
  await expect(targetNode).toHaveClass(/selected/)
  const selectedTargetIds=await win.locator('.react-flow__node.selected').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-id')))
  const sourceId=projectBefore.payload.generationCanvas.edges.find(edge=>edge.target===textTargetId).source
  await canvasFitView(win,'show the actual source node before picking')
  // From creation, the pointer changes surface and must enter point mode on the first click.
  await win.getByRole('button',{name:'创作',exact:true}).click()
  await ensureAgentPanelOpen(win)
  await panel.locator('[data-reference-entry]').click()
  await expect(win.locator('[data-canvas-pick-bar]'), 'board:ReferenceEntry/agent.creation.direct').toBeVisible()
  await expect(win.getByTestId('asset-picker')).toHaveCount(0)
  await win.locator(`.react-flow__node[data-id="${sourceId}"]`).click()
  const canvasInput=canvasPanel.locator(COMPOSER_INPUT)
  await expect(canvasInput.locator('[data-storyboard-mention-chip]')).toHaveCount(1)
  expect(await win.locator('.react-flow__node.selected').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-id'))),'board:ReferenceEntry/agent.target.preserved').toEqual(selectedTargetIds)
  await canvasInput.press('End')
  const targetMarker='REFERENCE_ENTRY_TARGETED_EDIT'
  await canvasInput.pressSequentially(` adjust this node ${targetMarker}`)
  await walk.snap('agent-direct-inline-reference-zh')
  await capture(win,'agent-direct-reference',`${CANVAS_PANEL} ${COMPOSER}`)
  const targeted=walk.fixture.expectText({label:'inline canvas node mapping',match:body=>flattenRequestText(body).includes(targetMarker),reply:{type:'text',text:'REFERENCE_TARGET_DONE'}})
  await canvasInput.press('Enter')
  const targetedWire=await recorded(targeted.received,'targeted inline reference outbound request')
  expect(flattenRequestText(targetedWire.body)).toContain(sourceId)
  expect(flattenRequestText(targetedWire.body)).toContain('@image1')
  await waitForV4TurnIdle(win,{panel:CANVAS_PANEL,settledBy:canvasPanel.getByText('REFERENCE_TARGET_DONE',{exact:true})})
  const targetedInput=readLaneTranscripts(projectRoot).flatMap(session=>session.entries).find(entry=>entry.type==='message'&&entry.message.role==='nomi.input'&&entry.message.content.includes(targetMarker))
  expect(targetedInput.message.context.target,'board:ReferenceEntry/agent.target.sent').toEqual({kind:'canvas',nodeIds:selectedTargetIds})
  expect(targetedInput.message.context.attachments).toHaveLength(1)
  expect(targetedInput.message.context.contextSnapshot.handles.some(handle=>handle.targetId===sourceId&&handle.intentRole==='source')).toBe(true)
  walk.report.targetedEdit={nodeIds:selectedTargetIds,sourceNodeId:sourceId,canonicalAttachments:targetedInput.message.context.attachments}

  await win.getByRole('button', { name:/^(设置|Settings)$/ }).first().click()
  await win.locator('[data-settings-tab-id="general"]').click()
  await win.locator('[data-settings-locale="en"]').click()
  // Appearance toggle is an existing preference, not renderer state injection.
  const theme = win.getByRole('button', { name:/Switch to dark|切换.*深色|Dark mode/i }).first()
  await expect(theme).toBeVisible()
  await theme.click()
  await win.locator('[data-settings-close]').click()
  await walk.resizeWindow(1100,720)
  await expect(canvasPanel.locator('[data-reference-entry]'), 'board:ReferenceEntry/agent.entry.visible').toBeVisible()
  await expect(canvasPanel.locator('[data-reference-entry]')).toHaveText('')
  await expect(canvasPanel.locator('[data-reference-entry]')).toHaveAttribute('aria-label', 'Add reference')
  await canvasPanel.locator('[data-reference-entry]').click()
  await expect(win.locator('[data-canvas-pick-bar]')).toBeVisible()
  await walk.snap('agent-direct-pick-en-dark-narrow')
  await win.keyboard.press('Escape')
  await canvasInput.pressSequentially('@frame')
  await expect(win.locator('[data-mention-list]')).toBeVisible()
  await walk.snap('agent-at-picker-en-dark-narrow')
  await capture(win,'agent-at-en-dark','[data-mention-list]')
  await win.keyboard.press('Escape')
  fs.writeFileSync(path.join(walk.report.outputDir,'production-dom.html'), `<!doctype html><html><meta charset="utf-8"><body style="background:#f6f5f4;padding:24px">${snapshots.map(item=>`<section style="width:560px;margin-bottom:32px"><h2>${item.label}</h2>${item.html}</section>`).join('')}</body></html>`)
  walk.report.boundary = 'Actual macOS development Electron, genuine local JPG/MP4 imports and shared selector, production admission/main identity/provider serialization. Loopback supplier only; paid provider and Windows unverified.'
} catch (error) { failure = error }
await walk.finish(failure)
