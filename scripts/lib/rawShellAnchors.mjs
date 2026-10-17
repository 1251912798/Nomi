// 「走查绕开 _shell.mjs 自己手抄外壳位置」的判定逻辑（check-walkthroughs.mjs 的 raw-shell-anchor 规则）。
// 抽成独立模块只为可单测（check-walkthroughs.mjs 一 import 就跑整道门岗）。
//
// 为什么要这条规则（2026-10-09，#1136 外壳重设计 CI 全红）：「返回项目库」钮抄了 15 处、Agent 面板的展开 / 收起选择器抄了十几处，
// 外壳一换，没人能一次改全，剩下的全部悬空成假红。外壳位置的唯一出口是 tests/ux/_shell.mjs，
// 其余走查要经过这些位置，一律调它的函数；再手抄就是下一次大面积悬空的种子。
//
// 只盯「为了到达别处而经过的外壳位置」那几串字面量。走查自己要验的外壳细节（几何 / 快捷键 / 拖动）不在其内。

/** 外壳位置的字面量写法。每条 = [正则, 该走哪个出口]。 */
export const RAW_SHELL_PATTERNS = [
  [/getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*(?:\/[^/\n]*|['"])(?:返回项目库|Back to projects)/, 'backToLibrary()'],
  [/\[data-v4-control="(?:collapse|dock-open)"\]/, 'collapseAgentPanel() / ensureAgentPanelOpen()'],
  [/\[data-agent-resident="true"\]\[data-agent-(?:panel|collapsed)="true"\]/, 'AGENT_PANEL / COLLAPSED_SHELL（_shell.mjs 导出）'],
  [/(?:getByText|getByRole|locator)\([^)]*新建空白项目/, 'newProjectEntry()'],
  // 画布底部（拍板稿 Main 板，2026-10-10 用户看真 App 指出加节点条还在左侧、缩放没收紧）：位置一变，这些选择器 / 控件名同时悬空。
  [/generation-canvas-v2-toolbar(?!__node-menu)|generation-canvas-v2__(?:zoom-bar|navigation-stack)/, 'canvasAddBar() / canvasFitViewButton() / CANVAS_* 常量（_shell.mjs）'],
  [/getBy(?:Role|Label)\([^)]*(?:适应视图|Fit view|重置视图|Reset view|缩放比例|Zoom level|画布操作|Canvas controls|画框|Draw Frame)/, 'canvasFitView / canvasResetView / canvasZoomSlider / canvasControlsHelpTrigger…（_shell.mjs）'],
  [/aria-label=\\?"(?:适应视图|重置视图|缩放比例|画框)\\?"/, 'canvasFitViewButton / canvasResetView / canvasZoomSlider（_shell.mjs）'],
  [/generationCommon\.navigation\.(?:resetView|zoomRatio|fitView|zoomIn|zoomOut|viewOptions)|generationCommon\.canvas\.controlsHelp\.aria/, '_shell.mjs 的 canvasResetView / canvasZoomSlider / canvasFitViewButton / canvasControlsHelpDialog…'],
  [/data-testid="open-model-settings"|aria-label="打开模型设置"|name:\s*(?:\/|')打开模型设置/, 'openModelSettings() / modelSettingsEntry()'],
  // 10-15 夜跑分诊（42 条走查在找旧外壳入口）：外壳重设计后下面这些**旧字面量已经没有对应的渲染物**（或已被唯一出口取代），
  // 手抄它们 = 下一次外壳变动时又成片悬空。每条指向 _shell.mjs 里的出口。
  // 左栏抽屉：旧侧栏 `aside nav button`；按「库全名」找导轨钮（现在导轨钮叫 素材 / Skill / 提示词 / 流程，库全名只是抽屉内容区的面板名）。
  [/aside nav button\[aria-label/, 'openRailDrawer(win, "assets" | "skills" | "prompts" | "flows" | "docs" | "catalog")'],
  [/getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*['"](?:素材库|技能库|提示词库|流程库|Asset library|Skill library|Prompt library|Workflow library)['"]/, 'openRailDrawer()'],
  [/button\[aria-label="(?:素材库|技能库|提示词库|流程库|Asset library|Skill library|Prompt library|Workflow library)"\]/, 'openRailDrawer()'],
  // Agent 三态：旧的「收起面板 / 收起创作助手 / 展开创作助手」按钮名（现在收起 = 形态三选一里的「小球」，叫回 = 点小球）。
  [/getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*['"](?:收起面板|收起创作助手|展开创作助手|收起助手面板)['"]/, 'collapseAgentPanel() / ensureAgentPanelOpen()'],
  // 语言：顶栏已经没有语言控件，语言只住设置「通用」里。
  [/aria-label=\\?"(?:语言|Language)\\?"|menuitemradio(?:["']|"\]['"\`])\s*,\s*\{\s*(?:name|hasText):\s*['"]English/, 'setAppLanguage() / readAppLanguage()'],
  // 工作区：在「工作区切换」容器里按文字找「生成 / 预览 / 创作」（名字会随进度附加信息变，上次已经因此落空过一回）。
  [/工作区切换['"]\]['"`]\)\.getBy(?:Text|Role)|getByRole\(\s*['"]navigation['"]\s*,\s*\{\s*name:\s*['"]工作区切换['"]\s*\}\)\.getBy/, 'switchWorkspace(win, "creation" | "generation" | "preview")'],
]

/**
 * 不能 import 的场景，登记在这里（路径 → 为什么）。新增条目要写得出「为什么 import 不了」。
 */
export const RAW_SHELL_EXEMPT = new Map([
  ['tests/ux/_shell.mjs', '出口本身：这些串就是它定义的'],
  ['tests/ux/full-walk/pageProbe.mjs', '页内探针：整段在浏览器里 evaluate，拿不到 Node 侧 import'],
  ['tests/ux/first-launch-system-locale.walk.mjs', '专门验空库首屏随系统语言出哪种文案：newProjectEntry 中英都认，会让这条断言失去判别力'],
  ['tests/ux/library-language-switcher.walk.mjs', '专门验库页切语言后的文案：同上，不能用中英都认的助手'],
  ['tests/ux/pr720-language-switch-mid-session.walk.mjs', '专门验会话中切语言后库页文案：同上'],
  ['tests/ux/smoke.e2e.mjs', '专门验空库首屏主入口动作卡片本身（data-variant=primary），不是借它进项目'],
  ['tests/ux/memory.e2e.mjs', 'CDP 裸页面脚本，没有 Playwright locator，点按钮靠页内 DOM 脚本'],
])

/**
 * @param {string} code 走查源码（已剥注释）
 * @returns {{ line: number, text: string, use: string }[]}
 */
export function findRawShellAnchors(code) {
  const hits = []
  code.split('\n').forEach((line, index) => {
    for (const [pattern, use] of RAW_SHELL_PATTERNS) {
      if (pattern.test(line)) hits.push({ line: index + 1, text: line.trim().slice(0, 120), use })
    }
  })
  return hits
}
