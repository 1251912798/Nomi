# 「先查别人」要查两层：open PR 之外，还有已合入 main 但你没拉的

> 📎 教训 · 首次记录 2026-09-08 · 状态：现行
> **触发场景**：接到一个红 / 一个 bug，准备动手修之前。

**结论**：`gh pr list` 查 open PR **不够**。已经合进 main、只是你本地还没 fetch 的提交，
**不在 open PR 列表里**。查完 PR 还要看一眼：

```bash
git fetch origin main -q && git log origin/main --oneline --since="6 hours ago" | head -20
```

**为什么会踩**（2026-09-07 夜，同一晚两次，一次躲过一次没躲过）：

- ✅ **躲过的那次**：devlab 类型红 → `gh pr list` 查到 #612 正在修 → 没重复修。教训生效。
- ❌ **没躲过的那次**：`check:design-lab` 白屏 → 查 open PR **没有匹配的** → 从零诊断了一遍
  （花了三轮）→ 写了修复 → 并上最新 main 才发现 **b3cde2b49（22:42）早就修好了**，
  而且比我的更完整。我 23:0x 并的是 `ee20fc102`，那条修复走 #614 在 23:28 才合入——
  **我处在「答案已经存在、只是我手上这份还没有」的状态**。

后果不只是白做：合并后 `optimizeDeps.include` 里 `@earendil-works/pi-ai` 出现了两次，
**我造了一份并行版（违 P1）**，还得再提一个 revert 撤掉。

**怎么用**：
- 动手修任何红之前，**两条命令一起跑**：`gh pr list --state open` + `git log origin/main --since=...`。
- 尤其在「main 合并很密」的时段（那晚 22:42 / 22:58 / 23:28 / 00:02 / 00:08 连着五次）——
  你 fetch 的那一刻和你动手的那一刻之间，答案可能已经出现了。
- 并上 main 之后**回头看一眼自己改过的文件有没有变成两份**，这是重复修最典型的痕迹。

**关联**：[[check-open-prs-before-fixing-reported-bugs]]（本条是它的补丁：那条只说了 open PR）、
[[main-repo-sits-on-stale-conflicted-branch]]（同族：下结论前先证明你站在哪个 checkout）。
