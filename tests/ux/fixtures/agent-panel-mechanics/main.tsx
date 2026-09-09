import React from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../../src/i18n'
import '../../../../src/styles/index.css'
import '../../../../src/workbench/generationCanvas/styles/generationCanvas.css'
import { AgentPanelV4Panel } from '../../../../src/workbench/ai/v4/AgentPanelV4Panel'
import { V4ModelPopover } from '../../../../src/workbench/ai/v4/AgentPanelV4Composer'
import { collapseV4Flow } from '../../../../src/workbench/ai/v4/agentPanelV4Collapse'
import { residentPlanShots } from '../../../../src/workbench/ai/resident/residentExceptionProjections'
import NodeMediaPreviewDialog from '../../../../src/workbench/generationCanvas/nodes/NodeMediaPreviewDialog'
import type { V4FlowItem } from '../../../../src/workbench/ai/v4/agentPanelV4Types'
const sample = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="tan"/><text x="100" y="180" font-size="40">Preview fixture</text></svg>')
function Fixture() {
 const panelWidth = Number(new URLSearchParams(location.search).get('width')) || 390
 const [longAnswer, setLongAnswer] = React.useState(false)
 const [approval, setApproval] = React.useState(false)
 const [preview, setPreview] = React.useState(false)
 const [model, setModel] = React.useState(false)
 const [queue, setQueue] = React.useState([{ title: '继续制作下一镜', status: 'queued' as const, destructiveAction: '取消这条指令' }])
 const flow: V4FlowItem[] = [{kind:'user',text:Array.from({length:8},(_,i)=>`第 ${i+1} 段剧本`).join('\n')}, ...Array.from({length:3},()=>[{kind:'thinking',label:'思考',meta:'检查工具组'} as V4FlowItem,{kind:'tool',receipt:{label:'准备工具',action:'write',status:'output-available'}} as V4FlowItem]).flat(), {kind:'assistant',status:'complete',text:(longAnswer ? Array.from({length:30},(_,i)=>`- 镜头 ${i+1}：已有画面。`).join('\n')+'\n\n' : '')+'分镜已写好。\n\n下一步：补齐角色参考图，再开始生成。'}]
 return <I18nextProvider i18n={i18n}><MantineProvider><main className="workbench-generation" style={{display:'flex',gap:16,padding:24,height:760}}>
 <section className="workbench-generation__canvas" style={{position:'relative',flex:1,background:'var(--nomi-ink-05)'}}><div data-canvas-content><button onClick={()=>setLongAnswer(!longAnswer)}>切换长回答</button><button onClick={()=>setApproval(!approval)}>切换审批卡</button><button onClick={()=>setPreview(true)}>打开媒体预览</button><img src={sample} alt="预览素材" /></div></section>
 <aside className="workbench-generation__ai" style={{width:panelWidth,position:'relative'}}><AgentPanelV4Panel slot={approval ? {kind:'plan',title:'确认这两个镜头',plan:residentPlanShots({shots:[{prompt:'小禾走到河边旧街。举起相机。',modelKey:'MiniMax-H3',params:{resolution:'768P',duration:8,aspect_ratio:'16:9'}},{prompt:'师傅低头修鞋，阳光穿过蓝布。',modelKey:'MiniMax-H3',params:{resolution:'768P',duration:8,aspect_ratio:'16:9'}}]}).map(shot=>({label:shot.title,detail:shot.description,checked:true}))} : undefined} height={700} width={panelWidth} flow={collapseV4Flow(flow,(key,args)=>String(i18n.t(key,args)))} context={{used:33200,max:1048576,input:'195.7K',output:'7.1K',cache:'104.4K',cost:'USD 0.29'}} queue={queue} queueHandlers={{onDestructiveAction:()=>setQueue([])}} composer={{modelLabel:'DeepSeek V4 Pro · APIMart',onTogglePopover:()=>setModel(!model)}} />{model && <div style={{position:'absolute',bottom:90,left:10}}><V4ModelPopover rows={[{slot:'对话',name:'DeepSeek V4 Pro',selectedValue:'ds',options:[{value:'ds',label:'DeepSeek V4 Pro · APIMart'}],cost:'¥0.02/M'}]}/></div>}</aside>
 {preview && <NodeMediaPreviewDialog mediaType="image" title="预览素材" url={sample} onClose={()=>setPreview(false)}/>}
 </main></MantineProvider></I18nextProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
