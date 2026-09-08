# 体验量表

唯一旅程目录：`../journeys/catalog.json`；唯一夜跑入口：`scripts/feel-nightly.mjs`。

```sh
pnpm run build
pnpm run feel:nightly
pnpm run experience:report
pnpm run experience:test
node tests/ux/experience/manual-example.mjs
```

默认执行 catalog 中标记 `experience` 的三条真实任务，供应商替换成仓库现有 loopback；启动器隔离项目/设置/userData。选中任务失败时命令非零退出，目录中没选中的任务不能称通过。可用 `--journey=agent-panel` 选择单条，其他同理。

产物在 `artifacts/experience/`：`manifest.json` 记录这一次的身份；`runs/<journey>/steps.json` 为每一步 before/after PNG（带哈希）、DOM、实际事件、目标 rect、动作/完成/反馈耗时、第一层 findings；`trace.zip` 可用 `pnpm exec playwright show-trace` 查看；`report.md` / `report.json` 为维度表与分诊。截图不需要上传。输入值不进入控件文案检查，密码框截图遮盖。

`rubric.json` 是维度、阈值、棘轮指标和聚合方式的真源。0–3 机械分是代理规则状态；理解、图标盲猜、舒适度等主观分离线保持 null，表里显示待评审；没有对标数据不宣称路径最短。Nielsen 严重度是独立的 0–4，目前未知，不从几何数量猜严重度。

基线第一次由 `pnpm run experience:report -- --initialize-baseline` 建立。只有完整终态、步骤顺序、事件、有限指标和真实截图哈希都通过才能写入。后续同命令只能收紧，恶化或口径不一致拒绝写入；不自动学习失败结果。平台/窗口/DPR/主题/采集与量表源码哈希组成比较身份，应用 SHA 单独记录以允许比较产品版本。当前 v1 拒绝所有非空豁免；维度的 exemption 说明只是提醒人工核对的例外，不能自动放行。增加维度或改口径要正式评审基线迁移，不能用“更新”抹掉退化。

`scrolls` 是真实 wheel 事件，自动 scroll 事件另记，不把输入框自动滚动算用户额外操作。`inputs` 是实际 input 事件数，本任务每个 fill 都是独立步骤；一个框多次填会据实增加。Fitts 使用相邻实际点击和运动方向上的矩形宽度；首点缺起点，不计算。反馈已在操作前可见时不报“零延迟”。首屏 ready 是 actionability 代理并明确包含启动器观测开销；动作耗时不是 INP，longTaskBlockingMs 不是 Lighthouse TBT，loopback 时间不是供应商服务时间。

VLM/Opus：`judgeWithAdapter(input, { model, evaluate })` 是显式依赖注入接口，不读任何环境密钥、不自行联网。先用 manual-example 对一次真实采集执行 synthetic adapter 验证（零调用），输出 `manual-judge-example.json`；真实适配器由调用方显式提供，返回每个主观维度的 score（0–3 或 null）、reason、evidence.step。页面文字作为不可信证据。图标盲猜须单独提供不含 DOM/名称/tooltip 的裁图，锁定猜测再揭露真值；目前未实施盲猜执行器，正确率为未知。

研究依据、阈值来源及六角色审查见 `docs/plan/2026-09-09-ux-experience-rubric.md`。首轮发现的问题只列不修；机械候选不等于已确认产品 bug。
