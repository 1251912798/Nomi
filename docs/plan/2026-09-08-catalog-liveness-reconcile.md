# 阶段 5b 目录活性实施

> 状态：🚧 进行中；明暗样张待主会话拍板。

## 先查别人
- [获派方案 §3.3 / §7 岔路 3](2026-09-07-agent-rebuild-stage3-5-deep-plan.md)：自动禁用，保留配置；恢复列出不自动启用。
- [现役完整分页探测](../../electron/ai/onboarding/modelListProbe.ts)：复用失败分类、鉴权、分页安全限制，不把部分列表当删除证据。
- [现役健康探测](../../electron/ai/onboarding/vendorHealth.ts)：复用主进程凭据读取、指纹、并发合流与 TTL。
- [旧安装种子迁移](../../electron/catalog/apimartTextMigration.test.ts)：保留退役行，不再自动剪掉文本配置。

## 范围与共享边界
目录 Model 持有 unlisted；catalog 事务写 enabled 与 unlisted。完整成功列表只作用于文本种子；失败、部分列表、旧凭据结果不改变目录。恢复只清旁注。删除后用同一目录的 seed suppression 记录避免下次读取重新播种。列表是可逆风险信号，不是付费调用成功证据。
UI 复用真实模型编辑行；legacy 分类唯一读取点在 modelIdentity。明暗设计实验室待主会话拍板，不录基线。
供应商档案声明最低价探针，雷达按周运行；应用内只 GET 列表。新鲜度 generatedAt、ETag 条件请求不推进审批基线。

## 不动项
Agent lane、技能、MCP、主 checkout、其他 worktree、已有视觉基线；不添加依赖或门岗。

## 回滚
回退本 PR 提交；新目录字段旧版忽略，禁用仍保留为用户可编辑状态。无用户数据删除迁移。

## 验收
缺 id → 禁用与旁注；恢复 → 仅清旁注；另一 vendor / 手动模型 / 不完整列表不误伤；迁移幂等；条件请求 304 与凭据变更；明暗截图及操作走查；gates 全绿，PR 不合并。

## 官方请求对账（2026-09-08 实读）
[APIMart 非流式通用聊天](https://docs.apimart.ai/en/api-reference/texts/general/chat-completions-nostream.md)：POST /api/v1/chat/completions、Bearer、model/messages/stream:false、max_tokens 是整数；响应 choices。周探针以 max_tokens:1 限制生成，复用 HttpOperation/buildHttpRequest 的既有模板格式，无格式扩展。没有声明探针的家不猜协议；缺环境凭据明确记 credential-missing，不读用户资料库。雷达探针结果与人工批准基线分开，永不自动改 baseline。

## 验证记录
- 改前：退役保留迁移 2 条失败（原实现返回 undefined）。
- 已跑零额度目录/列表/模型身份/投影回归：119/119。
- `pnpm run gates` 退出 0：73 门岗中 72 通过、0 阻断、1 上游研究来源 advisory；11,856 单测通过（2 skipped），前端与 Electron 构建通过。明暗两格真实组件已走通展开更多、未列出模型手动启用、一键删除，零 pageerror，未更新基线。
- 接触表：`tests/ux/shots/design-lab-catalog-liveness/_contact-sheet.png`；`calibration.json` 登记待拍板。
- R30：本阶段不改 Agent lane 或工具 schema；真实模型花费 ¥0，周探针行为由零额度 HTTP 夹具验证。
