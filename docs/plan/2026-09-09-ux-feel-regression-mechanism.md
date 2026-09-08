# 体感回归机制（2026-09-09）

## 先查别人

|能力|别人怎么做|我们直接用|不做的理由|
|---|---|---|---|
|视觉/交互稳定性|Playwright locator/actionability 与截图|Playwright 页面根节点扫描|不接云服务|
|可达性/对比度|axe-core/@axe-core/playwright|保留 axe 接口位，当前离线规则|不装包（仓库未提供）|
|视觉基线|Chromatic、Percy、Argos diff|状态截图命名与 JSON 接触表|零付费、不接服务|
|交互测试|Storybook interaction/play tests|声明式旅程目录|不引入 Storybook runtime|
|布局缺陷|Meta/Google 的几何检测思路|DOM rect overlap/clipping/viewport/hit|通用 DOM 规则|
|判官|OpenAI/Anthropic rubric|四问 0–3 可插拔量表|今晚离线规则跑一遍|

## 机制
`tests/ux/_feel.mjs` 接受任意 Playwright Page/Locator 根节点与数据规则，输出 findings JSON；不引用产品选择器。规则覆盖文字重叠、裁切、出视口、点击被拦、字号下限，并保留对比度适配位。旅程目录是声明式 JSON，夜跑只消费目录。

## 验收
首轮夜跑必须包含 Agent 面板、HTML 产物、3D 产物三条已知症状；每张截图回答舒服吗/能点吗/看得全吗/读得清吗，0–3 分并登记 owner。未来每个走查通过共享 helper 自动扫描；豁免需登记理由。
