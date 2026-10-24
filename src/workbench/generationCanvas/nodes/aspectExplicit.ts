// 节点 meta 上「比例是明确选过的」标记——键名只在这里。
//
// 谁写：用户在比例控件上选（NodeParameterControls）、落地时 Agent / 分镜写了合法比例（buildPlannedNodeMeta）。
// 谁读：视频比例默认值的唯一出处 videoAspectSeed（连线时明确选过的不改，用户 2026-10-22 Q2 拍板）。
// 存量项目里这个键一直叫 `aspect_ratio_user_set`（只有用户选过才写），不改名，免得旧节点丢标记。
export const ASPECT_EXPLICIT_META_KEY = 'aspect_ratio_user_set'
