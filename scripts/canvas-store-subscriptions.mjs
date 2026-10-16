// 画布 store 的「整表订阅」名单：只减不增（10-16 P-canvas，方向检查 docs/engineering/direction-checks/2026-10-16-canvas-shell-subscriptions.md）。
//
// 整表订阅 = 组件里 `useGenerationCanvasStore((s) => s.nodes)` / `s.edges`：画布上任何一张卡写一次（生成进度、拖完落位置、改标题），
// 订阅它的组件就整个重渲。React Flow 官方性能指南点名的头号反模式（https://reactflow.dev/learn/advanced-use/performance
// 「Avoid accessing nodes in components」）；该用的是按 id 的选择器（store/canvasNodeGenerationIndex.ts）、位置无关的稳定投影
// （store/canvasNodeProjection.ts）、只取一个标量的选择器，或在事件回调里 `useGenerationCanvasStore.getState()`。
//
// 两道门共用这一份名单：
// - eslint.config.mjs 的 no-restricted-syntax：名单外的文件写出整表订阅，lint 当场红（ESLint 自带能力，不自写扫描器）；
// - scripts/canvas-store-subscriptions.test.mjs：名单内每个文件的处数必须**等于**这里记的数——多了红（只减不增），
//   少了也红（改完记得把数降下来 / 把文件从名单删掉，名单不留虚数）。
//
// 只收 nodes / edges 两张表。选区 `selectedNodeIds` 不是表（几个 id），由真正画选区的组件订阅是对的；
// 画布壳不许订阅选区另有一条规则（SHELL_SELECTION_SELECTORS，只管壳那一个文件）。

export const CANVAS_SHELL_FILE = 'src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx'

/** 文件 → 允许的整表订阅处数（2026-10-16 普查冻结；只许往下改）。 */
export const WHOLE_TABLE_SUBSCRIPTION_BASELINE = Object.freeze({
  // 设计实验室：样张页，不上生产画布。
  'src/devlab/designLab/canvasHandles/canvasHandlesLabKit.tsx': 1,
  'src/devlab/designLab/nodeQuickActions/nodeQuickActionsLabKit.tsx': 1,
  'src/devlab/designLab/v4/states/07-spend-params.tsx': 1,
  'src/devlab/designLab/versionCards/versionCardsFlowLabKit.tsx': 1,
  'src/devlab/designLab/versionCards/versionCardsLabKit.tsx': 1,
  // 生产路径存量（交协调排期逐个收窄，见本线报告「整表订阅普查」）。
  'src/workbench/ai/v4/useAgentPanelSpendConfirm.ts': 2,
  'src/workbench/ai/v4/useDirectorPatchNotices.ts': 1,
  'src/workbench/creation/DocumentListSidebar.tsx': 1,
  'src/workbench/creation/storyboard/StoryboardPlanEditor.tsx': 1,
  'src/workbench/generation/list/generationListSource.ts': 1,
  'src/workbench/generationCanvas/components/BatchPlanOverlay.tsx': 2,
  'src/workbench/generationCanvas/nodes/ClipNode.tsx': 1,
  'src/workbench/generationCanvas/nodes/NodeInputReferenceEntry.tsx': 2,
  'src/workbench/generationCanvas/nodes/NodeParameterControls.tsx': 2,
  'src/workbench/generationCanvas/nodes/shotTable/ShotTableNode.tsx': 1,
  // 画布壳：投影链的源头，nodes / edges 两处是它本职（卡片按 id 自取数据之前，见方向检查第 6 节）。
  [CANVAS_SHELL_FILE]: 2,
})

const WHOLE_TABLE_MESSAGE = '别整表订阅画布 nodes / edges：任何一张卡写一次，这个组件就整个重渲。用按 id 的选择器（canvasNodeGenerationIndex）、位置无关的稳定投影（canvasNodeProjection）、只取一个标量的选择器，或在回调里 useGenerationCanvasStore.getState()。存量名单在 scripts/canvas-store-subscriptions.mjs，只减不增。'

export const WHOLE_TABLE_SUBSCRIPTION_SELECTORS = [
  {
    selector: "CallExpression[callee.name='useGenerationCanvasStore'] > ArrowFunctionExpression.arguments > MemberExpression.body[computed=false][property.name=/^(nodes|edges)$/]",
    message: WHOLE_TABLE_MESSAGE,
  },
  {
    // React Flow 自己的整表钩子：同一个反模式，今天零处。
    selector: "CallExpression[callee.name=/^use(Nodes|Edges)$/]",
    message: WHOLE_TABLE_MESSAGE,
  },
]

const SHELL_SELECTION_MESSAGE = '画布壳不订阅选区（数组或张数）：选中一张卡不许让整个画布壳重渲。画选区的组件（视口层、浮层）自己订阅；壳的回调里用 useGenerationCanvasStore.getState().selectedNodeIds；壳真要的派生值用只在结果变时才变的选择器（例：selectedGroupId）。'
const STORE_SELECTOR = "CallExpression[callee.name='useGenerationCanvasStore'] > ArrowFunctionExpression.arguments"
export const SHELL_SELECTION_SELECTORS = [
  { selector: `${STORE_SELECTOR} > MemberExpression.body[computed=false][property.name='selectedNodeIds']`, message: SHELL_SELECTION_MESSAGE },
  { selector: `${STORE_SELECTOR} > MemberExpression.body[property.name=/^(length|size)$/] > MemberExpression.object[property.name='selectedNodeIds']`, message: SHELL_SELECTION_MESSAGE },
  { selector: `${STORE_SELECTOR} > BinaryExpression.body MemberExpression[property.name='selectedNodeIds']`, message: SHELL_SELECTION_MESSAGE },
]

/** 与上面 ESLint 选择器同口径的源码计数（只认 `(x) => x.nodes` / `x.edges` 这一种写法，其余写法由 lint 兜）。 */
export function countWholeTableSubscriptions(source) {
  const pattern = /useGenerationCanvasStore\(\s*\(?\s*\w+(?:\s*:\s*[\w.<>[\]]+)?\s*\)?\s*=>\s*\w+\.(?:nodes|edges)\s*[,)]/g
  const reactFlowHooks = /\buse(?:Nodes|Edges)\(/g
  return (source.match(pattern)?.length ?? 0) + (source.match(reactFlowHooks)?.length ?? 0)
}
