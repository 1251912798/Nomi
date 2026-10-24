// 真 AnchoredPopover + 设计系统 Tooltip + 真 React Flow 空白处（d3-zoom 吞 mousedown 的那块），给
// tests/ux/anchored-popover-focus.test.mjs 用：浮层以不同方式关掉之后，焦点去哪。
// onClose 照 ClipNode.closePicker 的写法：忙（上传中）时拒关，浮层继续开着。
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AnchoredPopover, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../src/design'

declare global {
  interface Window { popoverFocus: { setBusy: (busy: boolean) => void } }
}

function Harness(): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const anchorRef = React.useRef<HTMLButtonElement>(null)
  const busyRef = React.useRef(false)
  const close = React.useCallback(() => {
    if (busyRef.current) return
    setOpen(false)
  }, [])
  React.useEffect(() => {
    window.popoverFocus = { setBusy: (busy) => { busyRef.current = busy } }
  }, [])
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button ref={anchorRef} type="button" data-focus-trigger onClick={() => setOpen((value) => !value)}>trigger</button>
        </TooltipTrigger>
        <TooltipContent side="right">Trigger tip</TooltipContent>
      </Tooltip>
      <div style={{ width: 900, height: 480 }}>
        <ReactFlowProvider>
          <ReactFlow nodes={[]} edges={[]} panOnDrag={[0, 1]} />
        </ReactFlowProvider>
      </div>
      {open ? (
        <AnchoredPopover anchorRef={anchorRef} onClose={close}>
          <div data-focus-popover style={{ background: '#fff', border: '1px solid #999', padding: 8 }}>
            <button type="button" data-focus-item onClick={() => setOpen(false)}>pick</button>
          </div>
        </AnchoredPopover>
      ) : null}
    </TooltipProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('anchored-popover-focus harness root is missing')
createRoot(root).render(<Harness />)
