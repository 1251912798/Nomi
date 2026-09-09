/* global document, localStorage */
import console from 'node:console'
import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect,clickOrFail,screenshotSettled} from '../../../tests/ux/_assert.mjs'
import {FIXTURE_TEXT_MODEL_LABEL,flattenRequestText} from '../../../tests/ux/agent-runtime-fixture.mjs'
import {createRuntimeWalk,chooseAssistantModel,CREATION_PANEL,COMPOSER_MODEL,COMPOSER_SEND,DOCUMENT,newConversation,sendCreation,recorded,hasToolResult,waitForV4TurnIdle} from '../../../tests/ux/agent-runtime-walk-support.mjs'
const out=path.dirname(fileURLToPath(import.meta.url));const observations=[];const reports=[]
for(const theme of ['light','dark']){
 const walk=await createRuntimeWalk('markdown-edge-'+theme);let failure
 try{
  const {win}=await walk.start({first:true});await walk.resizeWindow(1440,1000)
  if(theme==='dark') {await win.evaluate(()=>localStorage.setItem('nomi-color-scheme','dark'));await win.reload({waitUntil:'domcontentloaded'})}
  await walk.newProject();await chooseAssistantModel(win,FIXTURE_TEXT_MODEL_LABEL);await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_MODEL}`),'关闭模型弹层')
  const panel=win.locator(CREATION_PANEL)
  async function snap(id,target){
   await target.scrollIntoViewIfNeeded();await screenshotSettled(win,{path:path.join(out,id+'-'+theme+'.png'),scale:'css'})
   observations.push({id,theme,screenshot:id+'-'+theme+'.png',...(await panel.evaluate(e=>({text:e.innerText,html:e.innerHTML,theme:document.documentElement.dataset.theme,tableCount:e.querySelectorAll('table').length,markdownCount:e.querySelectorAll('[data-v4-markdown]').length})))})
   fs.writeFileSync(path.join(out,'edge-observations.json'),JSON.stringify(observations,null,2));console.log('CAPTURE',id,theme)
  }
  const cases=[['09-no-language','```\n第一行：未标注语言的代码块。\n    第二行：保留四个空格。\n第三行：print("中文注释")\n```\n\n正文的 `inline_code` 应与上面代码块有区别。'],
   ['10-image-math','**参考图**\n\n![窗边白瓷杯](https://example.com/nomi-audit-never-fetch.png)\n\n公式：$E = mc^2$。\n\n```mermaid\ngraph LR\n  A[创作] --> B[分镜]\n```']]
  for(const [id,text] of cases){await newConversation(win,CREATION_PANEL);const marker='EDGE_'+theme+'_'+id
   const req=walk.fixture.expectText({label:marker,match:b=>flattenRequestText(b).includes(marker),reply:{type:'text',text}})
   await sendCreation(win,marker+' 请展示此格式。');await recorded(req.received,marker)
   const md=panel.locator('[data-v4-markdown]').last();await waitForV4TurnIdle(win,{panel:CREATION_PANEL,settledBy:md});await snap(id,md)
  }
  await newConversation(win,CREATION_PANEL)
  const marker='EDGE_'+theme+'_11-interrupt'
  const req=walk.fixture.expectText({label:marker,match:b=>flattenRequestText(b).includes(marker),reply:{type:'hold',text:'**正在检查**\n\n| 镜头 | 状态 |\n| --- | --- |\n| 一 | 已检查 |\n| 二 | 待检查 |\n\n1. 保留窗光。\n2. 核对杯柄。'}})
  await sendCreation(win,marker+' 请先逐镜检查。');await recorded(req.received,marker)
  await expect(panel.locator('table')).toBeVisible();await snap('11-before-stop',panel.locator('[data-v4-markdown]'))
  await clickOrFail(panel.locator(COMPOSER_SEND),'停止当前流式回复')
  const interrupted=panel.locator('[data-v4-block=assistant][data-status=interrupted]')
  await expect(interrupted).toBeVisible();await expect(interrupted.locator('table')).toBeVisible();await snap('11-after-stop',interrupted)
  req.release({type:'text',text:''})
  await newConversation(win,CREATION_PANEL)
  await win.locator(DOCUMENT).fill(Array.from({length:16},(_,i)=>`- 核对第 ${i+1} 镜的光线和道具连续性。`).join('\n'))
  const proc='EDGE_'+theme+'_12-process'
  const p1=walk.fixture.expectText({label:proc,match:b=>flattenRequestText(b).includes(proc),reply:{type:'tool',id:proc+'a',name:'read_full_text',args:{},text:'**检查步骤**\n\n- 先读当前文稿。\n- 再核对镜头编号。\n\n'}})
  const p2=walk.fixture.expectText({label:proc+'2',match:b=>hasToolResult(b,proc+'a'),reply:{type:'tool',id:proc+'b',name:'read_full_text',args:{},text:'| 检查项 | 结果 |\n| --- | --- |\n| 文稿 | 已读取 |\n\n'}})
  const p3=walk.fixture.expectText({label:proc+'3',match:b=>hasToolResult(b,proc+'b'),reply:{type:'text',text:'两次检查完成，未修改文稿。'}})
  await sendCreation(win,proc+' 请读取两次文稿并核对。');await recorded(p1.received,proc);await recorded(p2.received,proc+'2');await recorded(p3.received,proc+'3')
  await waitForV4TurnIdle(win,{panel:CREATION_PANEL,settledBy:panel.getByText('两次检查完成，未修改文稿。',{exact:true})})
  const process=panel.locator('[data-v4-block=process]');await process.locator(':scope > summary').click();await snap('12-process',process)
  const group=process.locator('[data-v4-block=tool-group]');await group.locator(':scope > summary').click()
  await group.locator('[data-v4-block=tool]').first().locator(':scope > summary').click()
  const folded=process.locator('[data-process-folded]')
  await expect(folded).toHaveAttribute('data-process-folded','true')
  await snap('13-process-12-lines',process)
  await process.locator(':scope > button').click();await expect(folded).toHaveAttribute('data-process-folded','false')
  await snap('13-process-expanded',process)
  await newConversation(win,CREATION_PANEL)
  const longMarker='EDGE_'+theme+'_14-user'
  const longUser=longMarker+'\n'+Array.from({length:13},(_,i)=>`第 ${i+1} 行拍摄约束。`).join('\n')
  const userReq=walk.fixture.expectText({label:longMarker,match:b=>flattenRequestText(b).includes(longMarker),reply:{type:'text',text:'已收到全部拍摄约束。'}})
  await sendCreation(win,longUser);await recorded(userReq.received,longMarker)
  await waitForV4TurnIdle(win,{panel:CREATION_PANEL,settledBy:panel.getByText('已收到全部拍摄约束。',{exact:true})})
  const user=panel.locator('[data-v4-block=user] details')
  await expect(user).not.toHaveAttribute('open','')
  await snap('14-user-12-lines',user)
  await user.locator('summary').click();await expect(user).toHaveAttribute('open','')
  await expect(user.locator('p')).toContainText('第 13 行拍摄约束。')
  await snap('14-user-expanded',user)
  walk.fixture.assertClean()
 }catch(e){failure=e;console.error(e);process.exitCode=1}
 finally{await walk.finish(failure);reports.push(JSON.parse(fs.readFileSync(path.join(walk.outputDir,'report.json'))));fs.writeFileSync(path.join(out,'edge-runtime-reports.json'),JSON.stringify(reports,null,2))}
}
