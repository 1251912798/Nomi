/* global document, innerWidth, innerHeight, getComputedStyle, localStorage */
import console from 'node:console'
import process from 'node:process'
// Audit-only harness. Production UI, IPC, lane and tool execution; only model endpoint is synthetic.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, clickOrFail, screenshotSettled } from '../../../tests/ux/_assert.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from '../../../tests/ux/agent-runtime-fixture.mjs'
import { createRuntimeWalk, chooseAssistantModel, CREATION_PANEL, COMPOSER_MODEL, COMPOSER_PERMISSION,
 DOCUMENT, APPROVAL_CARD, permissionTier, newConversation, sendCreation, recorded, hasToolResult,
 waitForV4TurnIdle, rejectPendingIntervention } from '../../../tests/ux/agent-runtime-walk-support.mjs'
const out = path.dirname(fileURLToPath(import.meta.url))
const code = '// 中文注释：逐镜计算时长，不调用任何供应商\nconst shots = [\n' + Array.from({length:14},(_,i)=>`  { id: ${i+1}, title: "镜头${i+1}：窗边光影", seconds: 3 },`).join('\n') + '\n];\nconst total = shots.reduce((sum, shot) => sum + shot.seconds, 0);\nconsole.log(`总时长：${total} 秒`);'
const cases = [
 ['01-table','请用表格比较三个示例模型。','| 模型名称 | 中文画面与运镜描述 | 时长（秒） | 适用场景 |\n| :--- | :--- | ---: | :---: |\n| 示例模型甲 | 清晨，人物推开窗户；镜头缓慢推进。 | 5 | 人物叙事 |\n| 示例模型乙（长名称测试） | 雨后街道，霓虹灯倒映在水面，保持主体一致性。 | 10 | 城市场景 |\n| 示例模型丙 | 特写：茶汤注入白瓷杯，蒸汽自然升起。 | 8 | 产品展示 |'],
 ['02-code','请给我一段含中文注释的 TypeScript 示例代码。','```typescript\n'+code+'\n```'],
 ['03-nested','请用三层嵌套列表安排拍摄。','1. 前期准备\n   - 场景勘察\n     - 室内：检查窗边自然光。\n     - 室外：避开正午直射光。\n   - 人物准备\n     - 服装：暖色棉麻衬衫。\n     - 道具：白瓷杯与木桌。\n2. 正式拍摄\n   - 镜头执行\n     - 先拍全景，再补细节。\n     - 每个镜头预留两秒剪辑余量。'],
 ['04-tasks','请输出带完成状态的任务列表。','- [x] 确认故事主题：清晨的一杯茶。\n- [x] 整理参考图和道具清单。\n- [ ] 拍摄人物特写。\n  - [x] 测试窗边补光。\n  - [ ] 校准对白音量。\n- [ ] 剪辑并导出成片。'],
 ['05-inline','请混排粗体、行内代码、链接与中文标点。','**创作建议**：将 `durationSeconds` 设为 `8`，保持「人物、道具、光线」一致。\n\n查看 [公开规范](https://spec.commonmark.org/) 与 [本段脚注](#user-content-fn-note)，不要把「停顿」误写成“静止”。\n\n中文邻接：这是**「重点」**的句子，使用 `model_name`，再做~~「删除」~~测试。\n\n这段有脚注[^note]。\n\n[^note]: 脚注内容：只用于零付费渲染审计。'],
 ['06-storyboard','请给出一份完整的八镜分镜方案。','# 《清晨的一杯茶》：八镜分镜方案\n\n**目标**：用 32 秒记录一个人从忙乱到安静的清晨。比例为 `16:9`，以下只是创作方案，没有发起生成。\n\n'+Array.from({length:8},(_,i)=>`## 镜头 ${i+1}｜${['晨光入室','人物入画','取出茶叶','热水入杯','蒸汽升起','人物轻饮','放下茶杯','窗外远景'][i]}\n\n- **时长**：4 秒。\n- **画面**：窗边的木桌上放着白瓷杯，清晨柔光从左侧照入，人物保持自然呼吸，动作从容，不突然停顿。\n- **景别与运镜**：${i%2?'近景，镜头缓慢前推。':'中景，固定机位保持构图。'}\n- **声音**：保留环境声和轻微衣料摩擦声；音乐只作背景，避免压过关键动作。\n- **连续性**：杯柄朝右，人物服装、发型、窗光方向与前一镜保持一致。\n- **剪辑点**：动作进行到自然停顿时切换，让观众看清情绪变化。`).join('\n\n')+'\n\n**交付前检查**：核对八镜顺序、32 秒总时长，以及人物和道具连续性。'],
]
fs.writeFileSync(path.join(out,'payloads.json'),JSON.stringify({cases,code},null,2))
const walk=await createRuntimeWalk('markdown-audit')
const evidence=[]
let failure
try {
 const {win,app}=await walk.start({first:true})
 await walk.resizeWindow(1440,1000)
 const project=await walk.newProject()
 await chooseAssistantModel(win,FIXTURE_TEXT_MODEL_LABEL)
 await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_MODEL}`),'关闭模型菜单')
 const panel=()=>win.locator(CREATION_PANEL)
 async function snap(name,theme,target){
  if(target) await target.scrollIntoViewIfNeeded()
  await screenshotSettled(win,{path:path.join(out,`${name}-${theme}.png`),scale:'css'})
  const facts=await panel().evaluate(el=>({rect:{width:el.clientWidth,height:el.clientHeight},
   theme:document.documentElement.getAttribute('data-mantine-color-scheme'),viewport:{width:innerWidth,height:innerHeight},
   markdown:Array.from(el.querySelectorAll('[data-v4-markdown]')).map(m=>({folded:m.getAttribute('data-folded'),clientHeight:m.clientHeight,scrollHeight:m.scrollHeight,text:m.innerText})),
   tables:Array.from(el.querySelectorAll('table')).map(t=>({width:t.clientWidth,scrollWidth:t.parentElement.scrollWidth,container:t.parentElement.clientWidth,rows:t.rows.length,cells:Array.from(t.querySelectorAll('th,td')).map(c=>({text:c.textContent,width:c.clientWidth,align:getComputedStyle(c).textAlign}))})),
   code:Array.from(el.querySelectorAll('pre code')).map(c=>({text:c.textContent,font:getComputedStyle(c).fontFamily,spanCount:c.querySelectorAll('span').length,preHeight:c.parentElement.clientHeight,preScroll:c.parentElement.scrollHeight})),
   lists:{ul:el.querySelectorAll('ul').length,ol:el.querySelectorAll('ol').length,checkboxes:el.querySelectorAll('input[type=checkbox]').length},
   links:Array.from(el.querySelectorAll('[data-v4-markdown] a')).map(a=>({text:a.textContent,href:a.getAttribute('href'),target:a.target})),
   tools:Array.from(el.querySelectorAll('[data-v4-block=tool]')).map(t=>t.innerText),
   approval:el.querySelector('[data-v4-block=intervention]')?.innerText,
  }))
  evidence.push({name,theme,screenshot:`${name}-${theme}.png`,...facts})
  fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(evidence,null,2))
  console.log('CAPTURE',name,theme)
 }
 for(const theme of ['light','dark']){
  if(theme==='dark'){
   await win.evaluate(()=>localStorage.setItem('nomi-color-scheme','dark'))
   await win.reload({waitUntil:'domcontentloaded'})
   await expect(win.getByRole('button',{name:'创作',exact:true})).toBeVisible({timeout:30000})
   await clickOrFail(win.getByRole('button',{name:'创作',exact:true}),'重载恢复项目后返回创作')
   await expect(panel()).toBeVisible({timeout:30000})
   await expect(win.locator('html')).toHaveAttribute('data-mantine-color-scheme','dark')
  }
  for(const [id,prompt,text] of cases){
   await newConversation(win,CREATION_PANEL)
   const marker=`AUDIT_${theme}_${id}`
   const request=walk.fixture.expectText({label:marker,match:b=>flattenRequestText(b).includes(marker),reply:{type:'text',text}})
   await sendCreation(win,`${marker} ${prompt}`)
   await recorded(request.received,marker)
   const md=panel().locator('[data-v4-markdown]').last()
   await expect(md).toBeVisible()
   await waitForV4TurnIdle(win,{panel:CREATION_PANEL,settledBy:md})
   await snap(id,theme,md)
   if(id==='02-code'){
    await app.evaluate(({clipboard})=>clipboard.writeText('B2E_COPY_PENDING'))
    await md.locator('[data-streamdown=code-block-copy-button]').click()
    await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe(code+'\n')
    const copied=await app.evaluate(({clipboard})=>clipboard.readText())
    evidence.at(-1).copy={expected:code+'\n',actual:copied,match:copied===code+'\n'}
    fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(evidence,null,2))
   }
   if(id==='05-inline'){
    const route=win.url()
    await md.locator('a[data-footnote-ref]').click()
    expect(win.url()).toBe(route)
    await md.getByRole('link',{name:'本段脚注',exact:true}).click()
    expect(win.url()).toBe(route)
    const target=await md.getByRole('link',{name:'本段脚注',exact:true}).getAttribute('href')
    await expect(md.locator(`[id="${target.slice(1)}"]`)).toBeVisible()
   }
   if(id==='06-storyboard'){
    await expect(md.locator('h2')).toHaveCount(8)
    await snap('06-storyboard-tail',theme,md.locator('strong').last())
   }
  }
  await newConversation(win,CREATION_PANEL)
  const receiptMd='## 拍摄参数\n\n| 参数 | 值 |\n| --- | --- |\n| 比例 | **16:9** |\n| 时长 | `8 秒` |\n\n- 保留中文标点。\n- 保持窗光方向。'
  await win.locator(DOCUMENT).fill(receiptMd)
  const marker=`AUDIT_${theme}_07-receipt`
  const req=walk.fixture.expectText({label:marker,match:b=>flattenRequestText(b).includes(marker),reply:{type:'tool',id:marker,name:'read_full_text',args:{}}})
  const done=walk.fixture.expectText({label:marker+' done',match:b=>hasToolResult(b,marker),reply:{type:'text',text:'已读取文稿中的拍摄参数，未发起生成。'}})
  await sendCreation(win,marker+' 请读取当前文稿。')
  await recorded(req.received,marker);await recorded(done.received,marker+' done')
  await waitForV4TurnIdle(win,{panel:CREATION_PANEL,settledBy:panel().getByText('已读取文稿中的拍摄参数，未发起生成。',{exact:true})})
  const processRow=panel().locator('[data-v4-block=process]'); if(await processRow.count()) await processRow.locator(':scope > summary').click();
  const receipt=panel().locator('[data-v4-block=tool]').last()
  await receipt.locator('summary').click()
  await expect(receipt.locator('table')).toBeVisible()
  await snap('07-receipt',theme,receipt)
  await newConversation(win,CREATION_PANEL)
  await clickOrFail(panel().locator(COMPOSER_PERMISSION),'打开权限')
  await clickOrFail(win.locator(permissionTier('step')),'每步问')
  const approval=`AUDIT_${theme}_08-approval`
  const req2=walk.fixture.expectText({label:approval,match:b=>flattenRequestText(b).includes(approval),reply:{type:'tool',id:approval,name:'append_to_end',args:{content:'\n- **镜头一**：窗边全景。\n- **镜头二**：茶杯特写。\n- **镜头三**：人物轻饮。'}}})
  const reject=walk.fixture.expectText({label:approval+' declined',match:b=>hasToolResult(b,approval),reply:{type:'text',text:'已取消追加，文稿保持原样。'}})
  await sendCreation(win,approval+' 请将这三条镜头列表追加到文稿，先让我确认。')
  await recorded(req2.received,approval)
  const card=panel().locator(APPROVAL_CARD)
  await expect(card).toBeVisible()
  await snap('08-approval',theme,card)
  await rejectPendingIntervention(win,CREATION_PANEL,'审计结束，不写入。')
  await recorded(reject.received,approval+' declined')
  await waitForV4TurnIdle(win,{panel:CREATION_PANEL,settledBy:panel().getByText('已取消追加，文稿保持原样。',{exact:true})})
 }
 walk.fixture.assertClean()
 walk.report.evidence=evidence.map(e=>e.screenshot)
 walk.report.verified=['6 markdown response forms in both themes','native document read tool result','native pending approval','real code copy action']
 fs.writeFileSync(path.join(out,'requests-summary.json'),JSON.stringify({requests:walk.fixture.requests.map(r=>({path:r.path,model:r.body.model,stream:r.body.stream})),images:walk.fixture.images.length,unexpected:walk.fixture.unexpected,projectRoot:project.projectRoot},null,2))
}catch(error){failure=error;console.error(error);process.exitCode=1}
finally{await walk.finish(failure);fs.copyFileSync(path.join(walk.outputDir,'report.json'),path.join(out,'runtime-report.json'));if(failure&&fs.existsSync(path.join(walk.outputDir,'FAIL.png')))fs.copyFileSync(path.join(walk.outputDir,'FAIL.png'),path.join(out,'FAIL.png'))}
