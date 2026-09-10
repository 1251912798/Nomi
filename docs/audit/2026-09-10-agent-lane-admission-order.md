# Agent lane：执行权限必须先于审批

状态：已评审；本轮实现与局部回归通过，完整交付门另记于 PR #646。

范围为 `electron/agentLane`。这是对 2026-09-07 至 09-10 合同簇的结构续审，承接 09-08 切换评审与 09-09 动态输入评审；以下为单一评审者的六个视角，不代表六位独立审批者。

## 合同簇说明

34 份近期合同集中在宿主接线与所有权。读取可用的 class_root 与前两次结构评审后可分为输入捕获/入队/模型选择，窗口与资源生命周期，旧数据迁移，工具身份与权限，写入回执与候选展示。不能用“刚迁移所以正常”解释它们；共同信号是隔离测试覆盖单个 owner，却漏掉 owner 之间的次序或事实传递。

本轮两种失效正好是两个边界：测试进程把应用构建产物当源码真相；运行时把不可授权的执行前提放在用户确认之后。二者不能合成一个编译故障修复。CI resident 原始收据已有九个 HTTP 请求及成功的删除拒绝，证明它已加载模块。

## Owner 与次序裁决

| 事实/动作 | 唯一 owner 与现状证据 | 裁决 |
|---|---|---|
| 工具身份与 schema | laneToolCatalog.ts、laneCodingTools.mts:33 | 仍从目录派生；schema 常驻不授予执行权限 |
| coding 项目访问 | laneNativeAssembly.mts:39，SDK durable custom entry nomi.coding-access | 保留现有记录、查询与 unlockCoding，不新增布尔缓存或另一份词表 |
| read 的可信技能文件 | laneCodingPaths.mts，canReadProject 查询注入 | read 可读已授信技能，不能因为未开项目 coding 就挡住技能正文；路径边界继续负责判定 |
| surface 执行前提 | laneHost.mts:358，消费的输入 target + canonical capability | 保留在 before_tool；不使用当前草稿或模型参数替代授权事实 |
| coding 执行前提 | laneNativeAssembly.mts:44 的 toolAccessDenial | 同一查询供 before_tool 与直接 execute 使用；所有非 read coding 工具适用 |
| 风险分类与用户审批 | laneNativeApproval.ts:28、laneApprovalGate.ts | 只在执行前提通过后运行；无沙箱 bash 仍需确认，未解锁的操作则根本不问用户 |
| 工具结果及下一次请求 | pi before_tool block，laneHost.mts:364 | 交给 SDK 写 toolResult.isError 并续回合，不自造模型消息或转录 |
| 测试期待值 | tests/ux 共享支持层 + scripts/check-test-waits.mjs | 从源代码加载；实际被测 Electron 进程仍启动真实构建产物 |

最终次序：回合预算 → surface 权限 → coding 权限 → prepare → 风险审批 → 执行。执行 wrapper 仍咨询相同权限查询，覆盖绕过宿主的直接调用；不是两套权限状态。

## 六个视角

- CTO：本轮只补既有 admission 边界，未创建新 runner、审批层或权限存储。合同簇中迁移、输入和回执仍各归原 owner，不能全部塞进 laneHost。
- 后端：coding 准入读取 durable SDK 记录；没有沙箱不代表可授权 coding。反向组合“已开 coding、沙箱不可用”继续由现有 classifier 要求确认。
- 前端：用户不应面对一张确认后仍必定失败的卡。新逻辑直接交回现有错误收据，无新 UI 或等待时间。
- 设计：保留既有拒绝收据与确认卡形态，未改变布局或可见文案设计；已查看 resident 拒绝截图。
- PM：测试须同时证明未执行、模型收到结果、没有无效审批，不能只看 canary 或等待结束。
- 用户：未解锁 bash 会获得可行动的 coding 请求提示；文稿确认、拒绝及冷启动读回已由 resident 实走。

## 结构证据与限制

- 无沙箱 + safe-auto/step × bash/write：原来三条进入错误审批、一条通过；修复后 4/4，连同 surface/native 相关测试共 25/25。真实 lane、HTTP 与转录运行；只替换系统沙箱可用性和外部模型响应。
- 哨兵可写但保持原文；真实模型 wire 含拒绝，projection 的 toolResult.isError 为真。现有 native assembly/approval 测试继续覆盖解锁和沙箱确认规则。
- 测试 import 门岗先抓出五文件九处直接模块声明；迁移共享 MCP 几何、种子和目录的计算路径期待值。完整无产物测试通过：Vitest 11884，runtime 412。
- CI Linux 原始 resident 超时已复核；本机没有伪称 Linux 整条 UI 已复跑。无沙箱差异由确定性类回归覆盖，推送后 Linux CI 验证仍是远端证据。

裁决：现有 owner 可保留，缺口是 admission 的调用次序与测试模块图约束。禁止用增加 CI build、延长等待、放宽沙箱审批或复制 coding 状态来代替此次修复。
