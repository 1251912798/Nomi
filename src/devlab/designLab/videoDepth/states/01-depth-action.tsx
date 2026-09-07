// 设计实验室 · 「提取深度」五态（2026-09-07 用户拍板的形态：动作挂在视频节点上，不是独立节点）。
//
// 五格分别钉住一条动线上的五个时刻：选中视频看得见这个动作吗 → 点开只问一个问题吗 →
// 第一次要下 47MB 时它说人话吗 → 跑起来的时候我知道它在看什么吗 → 跑完它像不像一个普通视频节点。
// 每格都把**源节点一起截进来**：这一屏最要紧的判断是「这几件东西看着是不是一家的」，
// 只截浮条或只截面板都答不了那个问题。
//
// 光暗各一套（`scheme`）：暗色 token 只定义在 `:root[data-mantine-color-scheme="dark"]` 上，
// 组件自己加个 class 翻不动它，所以必须由注册项声明。
//
// 顺序有意义：`labStates.mjs` 按本屏目录里 `NN-*.tsx` 的文件名排序解析，汇总口按同样顺序拼接；
// 接触表两列 → 每一行正好是同一态的光/暗一对。
import React from 'react'

import NodeVideoFrameToolbar from '../../../../workbench/generationCanvas/nodes/NodeVideoFrameToolbar'
import { VideoDepthActionPanel } from '../../../../workbench/generationCanvas/videoDepth/VideoDepthActionPanel'
import { parseVideoDepthSettings } from '../../../../../electron/shared/canvas/videoDepth'
import type { GenerationCanvasNode } from '../../../../workbench/generationCanvas/model/generationCanvasTypes'
import {
  DEPTH_ACTION_CELL_WIDTH,
  DEPTH_CARD,
  DepthActionStage,
  DepthDerivationEdge,
  DepthNodeCard,
  DepthProcessingOverlay,
  DEPTH_FRAME,
  SOURCE_FRAME,
} from '../videoDepthLabKit'
import type { LabState } from '../../labScreen'

const NOOP = (): void => {}

const SOURCE_TITLE = '镜头 1 · 推门走进来'
const DERIVED_TITLE = '镜头 1 · 深度'

/** 现役 schema 的默认档（518 / 30fps / 0.35 平滑）。手抄一份就等于第二个真相源。 */
const DEFAULT_SETTINGS = parseVideoDepthSettings({})!

/** 喂给现役浮条的源节点。真组件读的就是 result.type/url 与 title，所以这里给全。 */
const SOURCE_NODE = {
  kind: 'video',
  title: SOURCE_TITLE,
  position: { x: 0, y: 0 },
  status: 'success',
  categoryId: 'shots',
  result: { id: 'src-r', type: 'video', url: 'nomi-local://asset/demo.mp4', createdAt: 1 },
} as unknown as GenerationCanvasNode

/** 单卡布局（一、二、三格）：卡居中，浮条比卡宽得多，居中才不会被取景框裁掉一头。 */
const SOLO_LEFT = Math.round((DEPTH_ACTION_CELL_WIDTH - DEPTH_CARD.width) / 2)
const SOLO_TOP = 200

/** 双卡布局（四、五格）：源 + 派生并排，缝 64（与现役落位规则同一个数）。 */
const PAIR_GAP = 64
const PAIR_LEFT = Math.round((DEPTH_ACTION_CELL_WIDTH - (DEPTH_CARD.width * 2 + PAIR_GAP)) / 2)
const PAIR_RIGHT = PAIR_LEFT + DEPTH_CARD.width + PAIR_GAP

function SoloStage({ children }: { children?: React.ReactNode }): JSX.Element {
  return (
    <DepthActionStage>
      <div className="absolute" style={{ left: SOLO_LEFT, top: SOLO_TOP }}>
        <DepthNodeCard
          title={SOURCE_TITLE}
          frame={SOURCE_FRAME}
          selected
          toolbar={
            <NodeVideoFrameToolbar
              node={SOURCE_NODE}
              downloading={false}
              onDownload={NOOP}
              onPreview={NOOP}
              onOpenProvenance={NOOP}
            />
          }
        />
      </div>
      {children}
    </DepthActionStage>
  )
}

/**
 * 面板落点：贴在浮条里「提取深度」那颗按钮下方（真机走 AnchoredPopover 贴同一处）。
 * 那颗按钮在浮条里偏右一点，所以这里从舞台中心往右挪半个面板多一点，而不是居中。
 */
const PANEL_LEFT = Math.round(DEPTH_ACTION_CELL_WIDTH / 2) + 10
function PanelSlot({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="absolute" style={{ left: PANEL_LEFT, top: SOLO_TOP - 12 }}>
      {children}
    </div>
  )
}

function PairStage({ overlay, derivedFrame }: { overlay?: React.ReactNode; derivedFrame?: string }): JSX.Element {
  return (
    <DepthActionStage>
      <div className="absolute" style={{ left: PAIR_LEFT, top: SOLO_TOP }}>
        <DepthNodeCard title={SOURCE_TITLE} frame={SOURCE_FRAME} />
      </div>
      <DepthDerivationEdge
        left={PAIR_LEFT + DEPTH_CARD.width}
        top={SOLO_TOP + Math.round(DEPTH_CARD.height / 2)}
        width={PAIR_GAP}
      />
      <div className="absolute" style={{ left: PAIR_RIGHT, top: SOLO_TOP }}>
        <DepthNodeCard title={DERIVED_TITLE} frame={derivedFrame} selected>
          {overlay}
        </DepthNodeCard>
      </div>
    </DepthActionStage>
  )
}

const PANEL_SOURCE = '本轮方案 · 「深度视频 = 视频节点上的一个动作」（2026-09-07 用户拍板）'

export const DEPTH_ACTION_STATES: readonly LabState[] = [
  {
    id: 'depth-action-01-toolbar',
    name: '选中视频 · 浮条上多了「提取深度」',
    source: PANEL_SOURCE,
    coverage: 'shell',
    // 这一格要回答的是「这个能力找得到吗、它跟旁边那几个动作是不是一伙的」。
    // 独立节点那一版的答案是「找不到」——它藏在加号菜单的「更多」里，而用户手上明明就有那段片子。
    render: () => <SoloStage />,
  },
  {
    id: 'depth-action-01-toolbar-dark',
    name: '选中视频 · 浮条（暗色）',
    source: PANEL_SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <SoloStage />,
  },
  {
    id: 'depth-action-02-panel',
    name: '小面板 · 一个必答选择 +「高级」收起',
    source: PANEL_SOURCE,
    coverage: 'shell',
    // 上一版在这里摆了八行参数。这一格看的就是那件事有没有真的被裁掉：
    // 第一屏只剩「输出」三选一 + 一颗开始，其余全在那行「高级」后面。
    render: () => (
      <SoloStage>
        <PanelSlot>
          <VideoDepthActionPanel
            settings={DEFAULT_SETTINGS}
            onSettingsChange={NOOP}
            advancedOpen={false}
            onToggleAdvanced={NOOP}
            onStart={NOOP}
          />
        </PanelSlot>
      </SoloStage>
    ),
  },
  {
    id: 'depth-action-02-panel-dark',
    name: '小面板（暗色）',
    source: PANEL_SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => (
      <SoloStage>
        <PanelSlot>
          <VideoDepthActionPanel
            settings={DEFAULT_SETTINGS}
            onSettingsChange={NOOP}
            advancedOpen={false}
            onToggleAdvanced={NOOP}
            onStart={NOOP}
          />
        </PanelSlot>
      </SoloStage>
    ),
  },
  {
    id: 'depth-action-03-downloading',
    name: '第一次用 · 进度长在「开始」按钮里',
    source: PANEL_SOURCE,
    coverage: 'shell',
    // 权重不进安装包（用户拍板①），第一次用要下 47MB。这一格看的是那句话说得够不够清楚，
    // 以及它有没有变成第二段解释文字——按的是这颗按钮，答案就该回在这颗按钮上。
    render: () => (
      <SoloStage>
        <PanelSlot>
          <VideoDepthActionPanel
            settings={DEFAULT_SETTINGS}
            onSettingsChange={NOOP}
            advancedOpen={false}
            onToggleAdvanced={NOOP}
            download={{ totalBytes: 49_642_442, percent: 38 }}
            onStart={NOOP}
          />
        </PanelSlot>
      </SoloStage>
    ),
  },
  {
    id: 'depth-action-03-downloading-dark',
    name: '第一次用 · 下载中（暗色）',
    source: PANEL_SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => (
      <SoloStage>
        <PanelSlot>
          <VideoDepthActionPanel
            settings={DEFAULT_SETTINGS}
            onSettingsChange={NOOP}
            advancedOpen={false}
            onToggleAdvanced={NOOP}
            download={{ totalBytes: 49_642_442, percent: 38 }}
            onStart={NOOP}
          />
        </PanelSlot>
      </SoloStage>
    ),
  },
  {
    id: 'depth-action-04-processing',
    name: '派生节点处理中 · 实时深度帧 + 预计剩余 + 取消',
    source: PANEL_SOURCE,
    coverage: 'shell',
    // 遮罩里那张灰白的图是**假深度帧**（实验室夹具）。真机上它是 worker 每批回传的最新一帧。
    // 这一格要回答的是：跑分钟级的时候，用户能不能看出「它在看的是我那段片子」——
    // 一根光秃秃的进度条答不了这个问题。
    render: () => (
      <PairStage
        overlay={<DepthProcessingOverlay percent={42} message="正在逐帧推理 · 预计还要 1:20" />}
      />
    ),
  },
  {
    id: 'depth-action-04-processing-dark',
    name: '派生节点处理中（暗色）',
    source: PANEL_SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => (
      <PairStage
        overlay={<DepthProcessingOverlay percent={42} message="正在逐帧推理 · 预计还要 1:20" />}
      />
    ),
  },
  {
    id: 'depth-action-05-done',
    name: '完成 · 它就是一个普通视频节点，标题带出身',
    source: PANEL_SOURCE,
    coverage: 'shell',
    // 跑完之后**没有第三种节点**：它是一段普通视频，能播、能下载、能再抽帧、能拖进任何参考槽。
    // 出身写在标题里（「镜头 1 · 深度」）和那根边上，不需要用户自己记。
    render: () => <PairStage derivedFrame={DEPTH_FRAME} />,
  },
  {
    id: 'depth-action-05-done-dark',
    name: '完成（暗色）',
    source: PANEL_SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <PairStage derivedFrame={DEPTH_FRAME} />,
  },
]
