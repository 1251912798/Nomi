// Browser test of the production composer and shared input contract, without an app profile.
import assert from 'node:assert/strict'
import process from 'node:process'
import { log } from 'node:console'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
import { chromium } from 'playwright'
const dir = '.tmp/b1-browser'
if (process.argv.includes('--build')) {
  await mkdir(dir, { recursive: true })
  await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import i18n from 'i18next'; import { initReactI18next } from 'react-i18next';
    import { zhAgentPanelV4 } from './src/i18n/locales/agentPanelV4';
    import { AgentPanelV4Composer } from './src/workbench/ai/v4/AgentPanelV4Composer';
    import { laneComposerIntent } from './electron/shared/agentLane/laneComposerIntent';
    i18n.use(initReactI18next).init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: { agentPanelV4: zhAgentPanelV4 } } } });
    globalThis.commands = [];
    function Fixture() {
      const [value, setValue] = React.useState('等等别动');
      return <AgentPanelV4Composer mode="running" value={value} onValueChange={setValue}
        onSubmit={choice => { const intent = laneComposerIntent({ running: true, pending: globalThis.pending }, value);
          globalThis.commands.push((choice === 'secondary' ? intent.secondary : intent.primary).command); }} />;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` }, bundle: true, platform: 'browser', outfile: `${dir}/fixture.js`, define: { 'process.env.NODE_ENV': '"production"' } })
  await writeFile(`${dir}/index.html`, '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>')
} else {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto('http://127.0.0.1:18741')
    await page.waitForLoadState('networkidle')
    const input = page.locator('[data-v4-control="input"]')
    await input.waitFor({ state: 'visible' })
    await input.press('Enter')
    await input.press('Alt+Enter')
    await page.evaluate(() => { globalThis.pending = { toolCallId: 'approval', toolName: 'nomi_canvas_write' } })
    await input.press('Enter')
    const commands = await page.evaluate(() => globalThis.commands)
    assert.deepEqual(commands, [
      { kind: 'steer', text: '等等别动' }, { kind: 'follow-up', text: '等等别动' }, { kind: 'steer', text: '等等别动' },
    ])
    const buttonLabels = await page.locator('button').allTextContents()
    assert.ok(!buttonLabels.some(text => /排队|等等|等它/.test(text)))
    await writeFile('docs/plan/agent-lane-b1-evidence/composer-gesture.json', JSON.stringify({ commands, noQueueTextButton: true }, null, 2))
    log('Browser gesture: Enter steer; Alt+Enter follow-up; approval Enter steer; no queue text button. PASS')
  } finally { await browser.close() }
}
