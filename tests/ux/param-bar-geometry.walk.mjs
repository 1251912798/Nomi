// R13 几何实测：D2 参数栏在「多供应商 Seedance」下是否截断（供应商下拉 + 多参数 pill 超 880px）。
// 用法: node tests/ux/param-bar-geometry.walk.mjs
// 隔离目录 + 当场构造的多视频节点项目（Seedance 各模式 + 参数多的图片 / 视频模型），内置目录，不拷真实目录、
// 不读真实项目。选中节点后量 composer 卡 / 参数栏 / 生成钮的几何，判断是否裁切。
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { screenshotSettled } from './_assert.mjs'
import { makeTempDir } from '../../scripts/_test-temp.mjs'
const shotsDir = path.join(repoRoot, 'tests/ux/shots/parambar')
fs.mkdirSync(shotsDir, { recursive: true })

const base = makeTempDir('nomi-parambar-')
const settingsDir = path.join(base, 'settings')
const projectsDir = path.join(base, 'projects')
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(projectsDir, { recursive: true })

// 项目夹具当场造（hydrate 只读 payload，见 fixtures/journey-project-fixture.mjs 头注释）。
// 以前拿作者本机「文稿/Nomi Projects」里的一个真实项目当模板，别的机器（含夜跑）ENOENT，本机则读到用户真实资料。
const mk = (id, kind, x, y, meta) => ({ id, kind, title: id, position: { x, y }, size: { width: 340, height: 270 }, prompt: '镜头', references: [], history: [], status: 'idle', categoryId: 'shots', shotIndex: 1, renderKind: 'shot-frame', meta })
const seedance = (modeId) => ({ modelKey: 'doubao-seedance-2.0', modelLabel: 'Seedance 2.0', modelVendor: 'apimart', archetype: { id: 'seedance-2-apimart', modeId } })
const nodes = [
  mk('v-omni', 'video', 120, 120, seedance('omni')),
  mk('v-t2v', 'video', 520, 120, seedance('t2v')),
  mk('v-firstlast', 'video', 920, 120, seedance('firstlast')),
  mk('v-wan', 'video', 120, 480, { modelKey: 'wan2.7', modelLabel: 'Wan 2.7', modelVendor: 'apimart', archetype: { id: 'wan-2.7', modeId: 't2v' } }),
  mk('i-seedream', 'image', 520, 480, { modelKey: 'doubao-seedream-4.5', modelLabel: 'Seedream 4.5', modelVendor: 'apimart', archetype: { id: 'seedream', modeId: 't2i' } }),
]
const projectId = 'parambar-walk-0001'
const dstDir = path.join(projectsDir, 'parambar-walk')
fs.mkdirSync(path.join(dstDir, '.nomi'), { recursive: true })
const generationCanvas = { nodes, edges: [], selectedNodeIds: [], groups: [] }
const project = { id: projectId, name: '参数栏几何实测', version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1, lastKnownRootPath: dstDir,
  workbenchDocument: null, timeline: null, generationCanvas,
  payload: { workbenchDocument: null, timeline: null, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false } }
fs.writeFileSync(path.join(dstDir, 'project.json'), JSON.stringify(project))
fs.writeFileSync(path.join(dstDir, '.nomi', 'project.json'), JSON.stringify(project))

let n = 0
const snap = async (win, name) => { n += 1; await screenshotSettled(win, { path: path.join(shotsDir, `${String(n).padStart(2,'0')}-${name}.png`) }); console.log(`  · shot ${name}`) }

const { app, win } = await launchNomiApp({
  name: 'param-bar-geometry',
  userDataDir: settingsDir,
  settingsDir,
  projectsDir,
})
await win.evaluate(() => { for (const k of ['nomi:splash:v1','nomi:journey-tour:v1','nomi:canvas-gesture-hint:v1']) window.localStorage.setItem(k,'seen') })
await win.reload(); await win.waitForTimeout(1500)
for (let i=0;i<6;i++){ const s=win.locator('button,[role="button"],a',{hasText:/跳过|开始创作|进入|完成/}).first(); if(await s.count()) await s.click({timeout:1200}).catch(()=>{}); await win.keyboard.press('Escape').catch(()=>{}); await win.waitForTimeout(300) }

// 开项目
const card = win.getByText('参数栏几何实测',{exact:false}).first()
if (await card.count()) { await card.click({timeout:4000}).catch(()=>{}); await win.waitForTimeout(400); const ok=win.getByText('继续创作',{exact:false}).first(); if(await ok.count()) await ok.click({timeout:3000}).catch(()=>{}) }
await win.waitForTimeout(3000)
const inCanvas = await win.evaluate(()=>/生成方式|全能参考|导出|时间轴/.test(document.body.innerText)&&!/Nomi 项目库/.test(document.body.innerText))
console.log('  inCanvas=', inCanvas)
await snap(win, 'canvas')

// 缩小画布把更多节点（含视频节点）带进视口：在画布中央 Ctrl+滚轮缩小几次。
for (let i=0;i<6;i++){ await win.mouse.move(700,380); await win.keyboard.down('Control'); await win.mouse.wheel(0,120); await win.keyboard.up('Control'); await win.waitForTimeout(120) }
await win.waitForTimeout(500)
await snap(win, 'zoomed-out')
// 遍历所有可见节点：逐个选中，记录每个 composer 卡的几何 + 是否视频节点 + 供应商下拉，报最大值。
const nodeBoxes = await win.evaluate(() => Array.from(document.querySelectorAll('.generation-canvas-v2-node')).map(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+12)}}).filter(b=>b.y>60&&b.y<700&&b.x>200&&b.x<1180))
console.log('  node candidates:', nodeBoxes.length)
const measures = []
for (const b of nodeBoxes.slice(0, 18)) {
  await win.mouse.click(b.x, b.y).catch(()=>{})
  await win.waitForTimeout(350)
  const m = await win.evaluate(() => {
    const card = document.querySelector('.generation-canvas-v2-node__composer-card')
    const bar = document.querySelector('.generation-canvas-v2-node__params--parameters')
    if (!card) return null
    const txt = card.textContent || ''
    return {
      cardW: card.getBoundingClientRect().width,
      cardClip: card.scrollWidth > card.clientWidth + 1,
      barW: bar ? bar.getBoundingClientRect().width : 0,
      barOverflow: bar ? bar.scrollWidth > bar.clientWidth + 1 : false,
      isVideo: /全能参考|首尾帧|图生视频|时长|生成音频/.test(txt),
      hasProvider: /供应商/.test(txt),
      hasNegPrompt: /负向|negative/i.test(txt),
    }
  })
  if (m) measures.push(m)
}
const videoM = measures.filter(m=>m.isVideo)
const maxCard = measures.reduce((a,m)=>Math.max(a,m.cardW),0)
const anyClip = measures.some(m=>m.cardClip||m.barOverflow)
console.log('  measured nodes:', measures.length, '| video nodes:', videoM.length)
console.log('  max card width:', Math.round(maxCard), 'px (cap=880)')
console.log('  any clip/overflow:', anyClip)
console.log('  any provider dropdown:', measures.some(m=>m.hasProvider), '| any negative_prompt:', measures.some(m=>m.hasNegPrompt))
console.log('  video samples:', JSON.stringify(videoM.slice(0,4).map(m=>({cardW:Math.round(m.cardW),clip:m.cardClip,provider:m.hasProvider}))))
await snap(win, 'node-selected')
const geo = { maxCard: Math.round(maxCard), anyClip }
console.log('  GEO=', JSON.stringify(geo))

// 方案 B：点「更多」弹层，截图看收纳的参数
const moreBtn = win.locator('button[aria-label="更多参数"]').first()
console.log('  更多按钮数:', await moreBtn.count())
if (await moreBtn.count()) {
  await moreBtn.click({ timeout: 3000 }).catch(() => {})
  await win.waitForTimeout(500)
  await snap(win, 'more-popover')
}
await app.close()
console.log(`\n截图在 ${shotsDir}`)
