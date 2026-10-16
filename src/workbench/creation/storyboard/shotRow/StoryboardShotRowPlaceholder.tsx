import React, { type JSX } from 'react'
import { parsePromptSegments } from '../../../assets/promptMentions'
import type { PlanShot } from '../../../generationCanvas/agent/storyboardPlan'
import StoryboardRowShell from './StoryboardRowShell'
import { densityBox, visualColumnWidth, type FrameMediaBox } from './shotFrameGeometry'
import { useStoryboardRowNarrow } from './storyboardRowDensity'

/**
 * 快速滚动时先挂的轻量占位（`storyboardMountPlan`）：同一个行外壳、同一只预览框、提示词的纯文本——
 * 没有编辑器、参数区、参考条，挂一行只是几个 div。滚动一停，表每帧把一行升级成完整行。
 * 不带 `data-storyboard-row`：聚焦、选择、拖拽只认完整行（占位在用户能操作之前就会被换掉）。
 */
export default function StoryboardShotRowPlaceholder({ shot, frameBox }: { shot: PlanShot; frameBox: FrameMediaBox }): JSX.Element {
  const narrow = useStoryboardRowNarrow()
  const box = densityBox(frameBox, narrow)
  const text = parsePromptSegments(shot.prompt).map((segment) => (segment.type === 'mention' ? '@' : segment.value)).join('')
  return (
    <StoryboardRowShell
      dataAttributes={{ 'data-storyboard-row-placeholder': shot.index }}
      visualWidth={visualColumnWidth(frameBox)}
      visual={(
        <div className="relative rounded-nomi border border-dashed border-nomi-ink-20 bg-nomi-ink-05" style={{ width: box.width, height: box.height }} aria-hidden>
          <span className="absolute left-1 top-1 rounded-nomi-sm bg-nomi-ink-10 px-1 text-micro tabular-nums text-nomi-ink-60">
            {String(shot.index).padStart(2, '0')}
          </span>
        </div>
      )}
      prompt={(
        <div className="rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-2 text-body-sm leading-normal text-nomi-ink line-clamp-3 whitespace-pre-wrap">
          {text}
        </div>
      )}
    />
  )
}
