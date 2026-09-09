# 打包成功不证明包来自当前源码

> 📎 教训 · 首次记录 2026-09-09 · 状态：✅ 已固化
> **触发场景**：切分支、合并、修代码后打包验收；源码测试通过而包里仍缺修复。

**结论**：打包入口必须验证构建身份；不能靠操作者记得先构建。

**为什么会踩**：#646 第四轮（b）在 detached 4e50e47c8 执行 dist:mac:dir，只打包已有 dist/，包仍是上一轮渲染层。约 ¥26 的验收建立在过期包上。「清单没到模型」结论作废；视频站、时间轴、导出、体感发现仍有效。缺失的不变量是源码身份与两份产物身份一致。

**怎么用**：
- scripts/package-build-stamp.mjs 在完整构建开始作废旧戳，成功且 HEAD/真实工作树 tree 未变才给两份产物盖戳，保留 dirty 状态。临时 Git index 不改用户暂存区。
- dist 与 dist:mac:dir 共用 verify；缺戳、坏戳、过期戳均退出并提示先 pnpm build；部分构建也作废旧戳。
- Node 回归覆盖两份过期戳、HEAD/staged/unstaged/untracked 变化、失败和部分构建，纳入 check:git-delivery。

**出处**：[方案与证据](../plan/2026-09-09-agent-lane-models-block.md)，package-stamp-{red,green}.log。
