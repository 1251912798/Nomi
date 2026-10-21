import React, { type JSX } from 'react'
import { parsePromptSegments } from '../../../assets/promptMentions'
import type { PlanShot } from '../../../generationCanvas/agent/storyboardPlan'
import StoryboardRowShell from './StoryboardRowShell'
import { densityBox, visualColumnWidth, type FrameMediaBox } from './shotFrameGeometry'
import { useStoryboardRowDensity } from './storyboardRowDensity'

/**
 * 快速滚动时先挂的轻量占位（`storyboardMountPlan`）：同一个行外壳、同一只预览框、提示词的纯文本——
 * 没有编辑器、参数区、参考条，挂一行只是几个 div。滚动一停，表每帧把一行升级成完整行。
 * 不带 `data-storyboard-row`：聚焦、选择、拖拽只认完整行。
 *
 * 用户可能在它还没换掉时就点上来（V-1210 复验 R2-1：点完马上打字，字落到了编辑器外面）。所以按下的那一刻
 * （pointerdown，早于焦点转移）就交给表：同步把这一镜升级成完整行，焦点直接落进提示词（点在提示词处）或行上，
 * 并拦下这一下的默认聚焦——随后的按键全部进编辑器。
 */
export default function StoryboardShotRowPlaceholder({ shot, frameBox, onActivate }: {
  shot: PlanShot
  frameBox: FrameMediaBox
  /** 按下即激活：`prompt` = 点在内容列（提示词 + 底栏）处，焦点进编辑器；`row` = 点在别处，焦点落在行上。 */
  onActivate: (target: 'prompt' | 'row') => void
}): JSX.Element {
  const box = densityBox(frameBox, useStoryboardRowDensity())
  const text = parsePromptSegments(shot.prompt).map((segment) => (segment.type === 'mention' ? '@' : segment.value)).join('')
  return (
    <StoryboardRowShell
      dataAttributes={{ 'data-storyboard-row-placeholder': shot.index }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        // 完整行的内容列整块就是「提示词 + 底栏」的输入框：点在内容列任何地方，都按点进提示词处理。
        onActivate(event.target instanceof Element && event.target.closest('[data-storyboard-content-column]') ? 'prompt' : 'row')
      }}
      visualWidth={visualColumnWidth(frameBox, false)}
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
