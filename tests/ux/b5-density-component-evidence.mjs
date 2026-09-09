// Real Electron component rendering. Synthetic props only; explicitly not an E2E user journey.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
const origin = process.env.B5_COMPONENT_ORIGIN || 'http://127.0.0.1:5217'
const baselineDir = path.join(repoRoot, 'tests/ux/fixtures/b5-density/.baseline')
const outputDir = path.join(repoRoot, 'docs/plan/2026-09-10-b5-density-evidence/component-evidence')
const baselineRef = process.env.B5_COMPONENT_BASE_REF || 'origin/main'
const sourcePaths = ['src/workbench/taskCenter/TaskCenterPanel.tsx', 'src/workbench/taskCenter/exportJobTaskCenter.ts', 'src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts', 'src/i18n/resources.ts', 'src/workbench/creation/storyboard/StoryboardPlanStrategyPanel.tsx', 'src/i18n/locales/storyboardEditor.ts']
fs.mkdirSync(baselineDir, { recursive: true }); fs.mkdirSync(outputDir, { recursive: true })
// Preserve actual baseline source; only resolve its relative imports from the original location.
for (const sourcePath of sourcePaths) {
  const source = execFileSync('git', ['show', `${baselineRef}:${sourcePath}`], { cwd: repoRoot, encoding: 'utf8' })
  let resolved = source.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (_, prefix, specifier, suffix) => `${prefix}/${path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier))}${suffix}`)
  if (sourcePath === 'src/i18n/resources.ts') resolved = resolved.replace('/src/i18n/locales/storyboardEditor', '/tests/ux/fixtures/b5-density/.baseline/storyboardEditor.ts')
  fs.writeFileSync(path.join(baselineDir, path.basename(sourcePath)), resolved)
}
let launched
try {
  launched = await launchNomiApp({ name: 'b5-density-component-evidence', env: { VITE_DEV_SERVER_URL: origin } })
  await launched.win.setViewportSize({ width: 1000, height: 640 })
  for (const scene of ['dc22', 'b4', 'dc23', 'dc24']) for (const version of ['before', 'after']) {
    await launched.win.goto(`${origin}/tests/ux/fixtures/b5-density/index.html?scene=${scene}&version=${version}`)
    await launched.win.locator('h1').waitFor()
    if (scene === 'b4' || scene === 'dc23') await launched.win.locator('.mantine-Notification-root').first().waitFor()
    await launched.win.evaluate(() => document.fonts.ready)
    await launched.win.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))))
    await launched.win.screenshot({ path: path.join(outputDir, `${scene}-${version}.png`) })
    console.log(scene, version, await launched.win.locator('body').innerText())
  }
  fs.writeFileSync(path.join(outputDir, 'provenance.json'), JSON.stringify({ kind: 'component-evidence', userJourney: false, baselineCommit: execFileSync('git', ['rev-parse', baselineRef], { encoding: 'utf8' }).trim(), sourcePaths, capturedAt: new Date().toISOString(), note: 'Production components rendered in isolated Electron; synthetic props, no canvas store injection, no paid actions. DC23 policy unchanged between before and after.' }, null, 2))
} finally {
  await launched?.app.close()
  fs.rmSync(baselineDir, { recursive: true, force: true })
}
