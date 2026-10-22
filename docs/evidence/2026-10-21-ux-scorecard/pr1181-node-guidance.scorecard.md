# 体验成绩单：空节点上下文引导：浏览时认类型，单选时给下一步

- 改动：空节点上下文引导：浏览时认类型，单选时给下一步（#1181）
- 验收 head：`477e22090a453651f295ec286808a48f02f82de7`（已合入 main（10-12）的 merge SHA；独立审查当时看的是未提交工作树，不是这个 SHA）
- 场景 id：`empty-node-next-step`
- 谁验：V-node-guidance（独立于实现线 I-node-guidance）（独立验收）
- 日期：2026-10-12；成绩单整理：I-scorecard 2026-10-21，对 docs/evidence/2026-10-11-node-guidance/ 里已合入的收据做对账，没有重跑

**用户这次能完成：**新建空节点后，单选时看到下一步；点空白去浏览分组时，只看每个节点的类型图标

**能力变化：**新增：浏览态 24px 类型图标 / 48px 底盘；改变：空节点引导只在单选时展开；去掉：无

## 结果

- 机器：完成 **4 / 7**（失败 3 条，原样列在下表，不丢）
- 首次尝试成功：null（未采集：需要真人首次操作，AI 不代填）

| 尝试 | 结果 | 说明 | 证据 |
| --- | --- | --- | --- |
| en-dark 全流程（26 项，含真实上传首击 / 二击、白板、原工具栏创建文本） | 通过 |  | docs/evidence/2026-10-11-node-guidance/walk-en-dark.json |
| zh-light 全流程（26 项） | 通过 |  | walk-zh-light.json |
| zh-dark 走查（合入的收据 26 项） | 通过 |  | walk-zh-dark.json |
| en-light 走查（合入的收据 26 项） | 通过 |  | walk-en-light.json |
| 修复前：label 转发的两个 click 被第二次准入拦住 | **失败** | 源码审查没看出来，真 Electron 走查复现；上传首击 / 二击行为错 | independent-review.md「上传首次点击与 label 转发」 |
| 修复前：音频短条里 48px 圆盘下沿越界 | **失败** | 独立线看过远景截图也漏判；几何断言才抓到：下沿 384.248 超过允许的 378.604 | independent-review.md「LOD 裁切逃逸与最终复核」 |
| 修复前：音频 queued / submitting / generating / finalizing / failed 五项旧基线图 | **失败** | 外部名称条件过宽，5 项视觉回归；收紧后原 golden 重跑通过，没有改基线 | independent-review.md「完整门岗与音频回归边界」 |

## 机器测的

来源：walk-log
设备 / 窗口 / 语言：macOS，已构建的 Electron / 默认窗口；LOD 一项在 51% 缩放、81 个节点 / zh 与 en 各两种主题（zh-light / en-dark / zh-dark / en-light）。边界：隔离夹具矩阵；不请求生成，不花钱；Windows、安装包没验

| 主指标 / 指标 | 现状 → 当前 | 单位 | 样本数 | 口径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 六空卡分组里非当前节点的引导行数 | 18 → 0 | 行 | 1 | 脚本计数（真事件，非采集器） | 现状 18 来自设计卡 ★1（六个空卡，非当前节点的引导行），没有重新测过；当前 0 来自 walk-en-dark.json 的 guidance.group.icon-only（six empty nodes … zero instructional rows）。样本是一组夹具 |
| 浏览态图标尺寸 | 18 → 24 | px | 15 | 脚本计数（真事件，非采集器） | 图标 18 到 24（底盘 36 到 48）。用户 10-12 反馈浏览态图标太小后改的；当前值来自 15 类空态的几何断言 |
| 完成耗时 / 点击数 | null → null | ms / 次 | 1 | 未采 | 没采：这条走查没接 collect.mjs；只有断言结果，没有逐步事件和耗时 |

## 真人给的（和上面分开记）

- SEQ（1–7）：null（未采集）
- 误点：null · 回退：null · 求助：null · 首次尝试成功：null
- 说明：没有真人做过；「看到下一步」靠不靠谱没有观察数据，只有几何和事件断言

## 护栏

| 护栏 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| 浏览时第一次点击不打开文件框（5 种上传类节点） | 通过 | walk-en-dark.json guidance.upload.*：首击只选中，二击才打开 |
| 业务状态（排队 / 运行 / 报错）不被引导收起 | 通过 | independent-review.md；最终收据含 guidance.operational.audio.* 与 guidance.legacy.status-omitted |
| 单选时原入口保留（原工具栏创建、文本编辑、白板） | 通过 | walk-en-dark.json 全流程项 |
| 完整 gates 全绿 | 未验证 | 独立审查原文：完整 gates 明确未全绿；对照干净 main 为共同失败、主线独有 0；2 张 PNG 没法用像素对照排除 |

## 最大摩擦点与决定

- 摩擦：短音频条里 48px 的圆盘下沿越出条外，远景图上不显眼：独立线亲眼看过图还是漏了，靠几何断言才抓到
- 决定：修（已修）并保留这条几何断言；以后这类「看过图」的结论要配一个能红的几何判据，不靠再多看一遍
- 协调决定：已合入（#1181）

## 没验证的

| 缺口 | owner | 复查条件 |
| --- | --- | --- |
| 真人首击：新建节点后找不找得到下一步 | 协调会话 | 有参与者时补 SEQ 与首次尝试；在此之前为 null |
| 键盘全程、读屏激活、拖动、pointercancel | I-node-guidance | 独立线列为未点验；补真事件走查 |
| Windows、安装包、真付费、最大规模性能 | 协调会话 | 发版前全量跑 |
| Clip 拖放、Director 已有内容与失败重试 | I-node-guidance | 源码未改原行为，但「没改」不等于验过 |

## 证据路径

- docs/evidence/2026-10-11-node-guidance/independent-review.md（独立审查，含失败保留）
- docs/evidence/2026-10-11-node-guidance/walk-en-dark.json、walk-zh-light.json、walk-zh-dark.json、walk-en-light.json
- docs/evidence/2026-10-11-node-guidance/01-group-browsing-en-dark.png、02-single-selected-en-dark.png、03-dense-zoomed-out-en-light.png
- docs/plan/2026-10-11-contextual-node-guidance.md（设计卡与用户原话）

> 这一页不出总分：机器数、真人数、护栏、未验证各看各的。
