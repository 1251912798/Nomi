焦点真相：真实 Electron composer 的 2px solid outline 色=--nomi-focus，不是 UA 默认色；修前 .tmp/focus-evidence/before.json。
统一定义：tailwind.config.ts 的 workbenchBasePlugin/addBase；文本聚焦高亮既有边框，最近容器含嵌套编辑器；非文本 :focus-visible 用 2px token 环。
覆盖：生产 JSX 831 个可聚焦声明点/220 文件（非活 DOM 数）；四面观测 library 10、canvas 44、settings 199、storyboard 42 个可见候选。
先红后绿：focus-indication.e2e.mjs 文本外环/按钮无环负例必红；14 类文本×明暗及 8 类非文本通过；嵌套容器额外两条先红后绿。
门岗接线：#662 未合，未复制 _feel.mjs；规则提案 docs/plan/2026-09-09-focus-feel-rule-proposal.md，UA 滚动条/表单反例一并提交。
修前图：.tmp/pi-focus-red-development-1788897822444/01-composer-mouse-before.png。
修后四面图与按钮 Tab 图：.tmp/pi-focus-indication-development-1788901489621/；真实任务 passed，付费调用 0。
视觉对账：.tmp/focus-evidence/baseline-comparison.png；仅更新 4 张焦点差异基线，阈值未动。
全量验证：pnpm run gates 通过（12058 tests、122 视觉项，0 阻断失败）；日志 /tmp/nomi-focus-final2.log。
