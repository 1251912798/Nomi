# Stage 4 分支合入 main #652–#654

状态：🚧 验证中

## 范围与取舍

按用户已批准的并线任务执行本地 merge：任务父 e99c70aae，main 父 60f9123c3。保留 pi lane 接线和全部删旧；接收 main 画布三功能、设计系统与 Python gates 锁脚本。预期八个交叉文件逐项核对，Git 实际仅文件大小与词表 baseline 两处冲突。

基线采用文本级编辑：NomiStudioApp 实际 863 行，阈值从 864 降至 863；两边删除的债合并后为 71，保留双方仍有效登记。自动合并的 main/preload/App/package/framework/词表测试另行对账。

## 先查别人

本次只合并已有实现，不选型、不另写能力；复核以下既有来源后沿用原实现。

- 依赖里已有：Mantine 8 与 Radix 菜单已经由 main 锁定在 [pnpm-lock.yaml](../../pnpm-lock.yaml)，本次冻结锁文件安装，合并后锁文件与 main 一致。
- 仓库里已有：pi lane 删旧与承接点见 [阶段 4 原方案](2026-09-08-agent-lane-stage4-switch.md)；main/preload/App 保留这些边界，仅接入 main 新增功能。
- 仓库里已有：基线编辑纪律见 [JSON 基线教训](../lessons/json-baselines-need-surgical-edits.md)，本次只做文本级合并并按实际计数下调。
- 生态/自媒体：不新增调研；用户已明确裁决沿用 #653/#654 的现成实现，本次不引入外部方案。合并评审与 gates 直接复用 [Ponytail 适配器](../../scripts/ponytail-review-hook.mjs) 与 [Python 锁包装](../../scripts/with-gates-lock.py)。
- 结论：全部用已有，实现来源与接线边界不变；唯一手动冲突解决为两个棘轮文件。

## 不动项与回滚

不改 SWITCH-RULINGS.md、PR draft 状态或合并状态，不触及其他 worktree、真实项目库或付费模型，不新增依赖声明。依赖仅同步合入的锁文件。回滚锚点为任务父 e99c70aae；如需撤回合并，另行 revert merge 第一父，不重写远端历史。

## 验收门

四项专项：reference-contract、vocabularies、filesize、boundaries；然后完整 gates。零引用临时文件原为空，改从 origin/main 到任务树的已删除代码路径生成清单，扫描跟踪源码中的静态/动态 import、require 与模块路径，另核查旧宿主/运行时入口。commit/push 均走 Ponytail hooks，只推原任务分支，不合并 PR。
