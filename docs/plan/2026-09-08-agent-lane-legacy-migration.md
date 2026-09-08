# 阶段 4 · 第 3 步旧对话迁移

状态：实施中。第 2 步已完成并推送 a3636be0c；本节接续已批准总任务书 §3 和迁移 readiness / implementation brief。

## 范围与顺序

1. 从 tests/agent-runtime/replayShadowSources.mts 抽共享纯解包 owner laneLegacySources.ts。保留每个原项 raw/sourceIndex、每个独立会话、容器与 leaf/clear 事实；L2 只从结果派生窄回放视图，不能把丢字段后的回放输入当迁移数据。
2. 完整性与转换：严格核验 pi envelope/branch/compaction、host checksum/binding、context v4 record key；同一会话的优先级只由绑定证明。未知内容只归档，不执行。
3. 事务：固定来源路径、跨 await admission/锁、原字节 hash 归档、公开 append API 前缀恢复、冷验、manifest 完成后清理活跃源。G5 收据完全不动。迁移入口在 workspace 开放前。
4. 顶部来源提示只在迁移 lane 显示，事实从同一 transcript metadata 派生；三来源 tmp 夹具和真实 Electron 无额度走查。

## 先查别人 / 既有承接

- pi 0.85.1 公开 appendMessage / appendCustomEntry 是既有获批持久化入口；使用已安装 node_modules/.pnpm/@earendil-works+pi-agent-core@0.85.1_*/node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.d.ts，禁止直写 JSONL。规范：https://github.com/earendil-works/pi/tree/main/packages/agent-core 。本次没有自定义第二套对外转录。
- 旧三来源以真实 writer 为格式规范：electron/harness/context/contextStore.ts:25（v2/v3/v4 容器）；electron/harness/runtime/pi/snapshot.mts:19（信封与 SHA）；electron/projectAgentHost/projectAgentRepository.ts:97（host checksum base）。领域偏差：只保留旧数据，不重放旧命令，不恢复旧授权。
- 现有 SessionRepo owner electron/agentLane/laneSession.mts:56；现有 legacy 锁/搬移手法 electron/projectAgentHost/projectAgentMigration.ts。不得调用会删除 receipt 的旧整套迁移。
- 纯解包不授予绑定/完整性信任：parser 标出格式与原始身份；事务入口必须完成上述验证后才能 append/归档清理。

## 验收与回滚

每个原数组成员有唯一 sourceIndex/raw；不按时间重排，不跨 thread 混合，不吞未知项；空/损坏/不支持区分。三来源用 os.tmpdir 夹具，不读真实项目。转换、前缀恢复、锁跨 await、崩溃断点、冷重启均须测试。每个子任务 commit/push 更新 SWITCH-LAST.md。回滚 revert 对应提交；落盘阶段原件永久保留于本次 archive，不用恢复开关。

边界实测补充：原 private-session-snapshot-envelope 规则仅匹配字符串，误把旧格式的只读比较当 writer。保留信封声明/常量命中，排除严格相等/不等的格式检查；真实登记表正反夹具先红后绿。不新增框架债。

## 首个子任务验证

共享 decoder 与 L2 适配已实现；6 条 tmp 夹具覆盖 direct pi、context v2/v3/v4、AI SDK null/混合内容、host 跨线程与未知项、非法 UTF-8/空文件，以及三个文件入口。把旧 reader 放回做对照，同一夹具只读到 2 条会话而应为 4 条；新 reader 6/6 通过。解包不验证 checksum、不授予项目绑定信任，未接 workspace 导入、未写 lane、未搬旧文件。完整性转换、归档/前缀恢复、顶部提示仍待后续子任务。
