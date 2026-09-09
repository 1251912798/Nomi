import React from 'react'
import WorkbenchShell from '../../../workbench/WorkbenchShell'
import { useWorkbenchStore } from '../../../workbench/workbenchStore'
import { laneClient } from '../../../workbench/ai/lane/laneClient'
import { labAssistantItem, labHostState, labUserItem } from '../v4/agentPanelV4LabHost'

// Read-only lane transport; the real shell, resource tree and editor consume their usual stores.
const snapshot = labHostState({ items: [
  labUserItem('request', '帮我整理这段故事的镜头节奏，先给建议。'),
  labAssistantItem('reply', '可以先用远景交代雨夜的车站，再切到人物手里的信。保留最后一段停顿，让重逢有一点悬念。'),
] })

// Specimen-only overrides. One selector owns all three frames; production has no import here.
const frames = '[&_:is([data-creation-resource-tree],[data-creation-editor],[data-v4-panel])]:rounded-nomi [&_:is([data-creation-resource-tree],[data-creation-editor],[data-v4-panel])]:border [&_:is([data-creation-resource-tree],[data-creation-editor],[data-v4-panel])]:border-nomi-line [&_:is([data-creation-resource-tree],[data-creation-editor],[data-v4-panel])]:bg-nomi-paper [&_:is([data-creation-resource-tree],[data-creation-editor],[data-v4-panel])]:shadow-none [&_:is([data-creation-resource-tree],[data-creation-editor],[data-v4-panel])]:overflow-clip'
const headers = '[&_:is([data-creation-resource-tree]>div:first-child,.workbench-editor-toolbar,[data-v4-panel]>header)]:h-12 [&_:is([data-creation-resource-tree]>div:first-child,.workbench-editor-toolbar,[data-v4-panel]>header)]:px-3 [&_:is([data-creation-resource-tree]>div:first-child,.workbench-editor-toolbar,[data-v4-panel]>header)]:py-0 [&_:is([data-creation-resource-tree]>div:first-child,.workbench-editor-toolbar,[data-v4-panel]>header)]:border-b [&_:is([data-creation-resource-tree]>div:first-child,.workbench-editor-toolbar,[data-v4-panel]>header)]:border-nomi-line-soft [&_:is([data-creation-resource-tree]>div:first-child,.workbench-editor-toolbar,[data-v4-panel]>header)]:bg-nomi-paper [&_[data-creation-editor]]:grid-rows-[48px_minmax(0,1fr)]'
const layout = '[&_.workbench-creation]:!grid-cols-[minmax(0,1fr)_var(--columns-agent-width)] [&_.workbench-shell>main]:p-4 [&_.workbench-shell>main]:gap-4 [&_.workbench-creation]:gap-4 [&_.workbench-creation>div:first-child]:p-0 [&_[data-assistant-pane]]:p-0 [&_[data-assistant-pane]>[role=separator]]:-left-4 [&_[data-assistant-pane]>[role=separator]]:inset-y-0'

export function CreationColumnsStage({ specimen = false }: { specimen?: boolean }): JSX.Element {
  React.useMemo(() => {
    laneClient.connect({ onProjection: listener => { listener(snapshot); return () => undefined },
      send: async () => ({ ok: false, code: 'design_lab_read_only', message: '' }) })
    const current = useWorkbenchStore.getState()
    const first = current.workbenchDocuments[0]
    useWorkbenchStore.setState({
      workspaceMode: 'creation', projectAgentDockCollapsed: false,
      editingPanelLayout: { ...current.editingPanelLayout, assistantWidth: 390 },
      workbenchDocuments: [{ ...first, id: 'columns-draft', title: '雨夜来信', updatedAt: 0,
        contentJson: { type: 'doc', content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '雨夜来信' }] },
          ...['车站外，雨水沿着旧屋檐滴落。林望握着那封迟到了十年的信，站在最后一班列车前。',
            '她抬头看了一眼时钟。十一点五十九分。广播里传来模糊的站名，像某个人在很远的地方喊她。',
            '车门将要关闭时，一个熟悉的身影停在了灯下。'].map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        ] } }], activeDocumentId: 'columns-draft', activeStoryboardId: null,
      storyboardDesignsByDocumentId: {}, projectAgentDraft: '', projectAgentAttachments: [], creationActiveSkill: null,
    })
    return null
  }, [])
  React.useEffect(() => () => laneClient.connect(undefined), [])
  const width = useWorkbenchStore(state => state.editingPanelLayout.assistantWidth)
  return <div data-creation-columns={specimen ? 'specimen' : 'current'}
    className={specimen ? `${frames} ${headers} ${layout}` : undefined}
    style={{ width: 1440, height: 900, '--columns-agent-width': `${width}px` } as React.CSSProperties}>
    <WorkbenchShell generation={null} projectName="雨夜来信" />
  </div>
}
