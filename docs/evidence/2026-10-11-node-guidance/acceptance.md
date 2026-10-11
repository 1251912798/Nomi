# 空节点上下文引导：实现线验收

实现线：I-node-guidance。独立线：V-node-guidance，见 [独立审查](./independent-review.md) 和 [旧功能普查](./independent-census.md)。日期：2026-10-12，macOS；这是任务分支验收，不是 merge SHA 收据。

## 用户结果与设计对账

六个空图片节点的真实分组，浏览时重复引导从 18 行降到 0 行，框外名称和连线端口保留。用户追加反馈 Icon 太小后，浏览态统一为 24px 图标 / 48px 圆形底盘，沿用 Nomi 原图标、颜色和视觉中心；音频与剪辑短条垂直居中。只单选当前节点才展示原有下一步和 composer，新建节点沿用已有自动选择。

生产组件合同：[EmptyStates.board.json](../../design/boards/2026-10-08/EmptyStates.board.json) 的 contextual-guidance/type-mark/activation 三项；[本次语义修订清单](../../design/boards/2026-10-11/ContextualEmptyNodes.board.json)。HTML 源仅为批准过的 exploration，不充当生产实现合同。

已亲眼读取真实截图：中文浅色与英文暗色的分组浏览、单选 composer，文本、剪辑、全景、导演节点；48/24 图标有实际面积，短条没有裁切，单选只有当前节点展示指导。另核中英两种明暗组合及 81 节点远景，均保留各类型标记。

## 根因与结构预防

症状：所有空节点一直重复指导。直接原因：旧 PendingGenerationPlaceholder 的 selected 只写到 DOM 属性，其他空态没有选区输入。类根因：共享空态没有区分教学与业务状态，也没有宿主拥有的交互上下文。

React Flow 唯一宿主将 primarySelection/readOnly 传到共享 Context。NodeEmptyState 将普通教学投影为类型标记或原有引导；waitingUpstream/derivedReady 显式使用 status，因此不会被失选隐藏。上传和白板使用同一激活门，在 pointerdown 时判断准入，click 时重新确认当前选择及只读状态。未包宿主默认不激活，不新增持久化字段或生成入口。

真实 Electron 曾发现 label 转发给 hidden input 的第二个 click 被重置后的准入拒绝，已修为同一手势保留准入至下次 pointerdown/cancel；5 种上传的真实鼠标与文件框走查通过。独立审查明确记录其初版源码审查没有捕获这个问题。

## 验证范围

| 证据 | 结果与边界 |
|---|---|
| 报告用例红灯 | 实现前 6 种媒体浏览态断言失败，暴露无条件引导；实现后通过 |
| 实现线单测 | 12 文件 / 117 项通过，含全部 registry 类型、status、readOnly、上传、白板、排版和配方 |
| 独立线单测 | 5 文件 / 82 项通过，独立源码审查及真实截图/收据复核 |
| 中文浅色完整流程 | [walk-zh-light.json](./walk-zh-light.json)：26 项通过，真实分组与整组选中、15 种类型矩阵、原工具栏创建、文本编辑、5 种真实本地媒体导入、白板 |
| 英文暗色完整流程 | [walk-en-dark.json](./walk-en-dark.json)：相同 26 项通过 |
| 中文暗色视觉/LOD | [walk-zh-dark.json](./walk-zh-dark.json)：23 项通过，含分组/单选/15 类型矩阵、81 节点 51% 轻量渲染、14 类底盘完整边界及 4 项状态补查 |
| 英文浅色视觉/LOD | [walk-en-light.json](./walk-en-light.json)：23 项通过，含同中文暗色视觉矩阵、81 节点远景及 3 种音频运行状态/旧项目缺省 status 的 4 项补查 |
| 静态与编译 | 官方 typecheck、最终生产 build、tokens、board-parity、root-cause-contracts 已通过；完整 lint 78 warnings / 上限 79，通过；walkthroughs、test-waits 重查通过 |

类型矩阵通过 store 准备状态，再使用生产 React Flow 渲染；原入口流程使用实际工具栏、编辑器、鼠标、原生 filechooser 和真实仓库媒体。后者证明创作者操作闭环，前者只证明状态呈现，不代表 Agent 或供应商执行。

大画布按原机制虚拟化离屏节点，验收检查存储内 81 节点及屏内轻量节点，不要求把所有离屏元素挂入 DOM。第一次补充脚本错误要求 81 个 DOM，实际仅挂 20 个，因此失败；修正测试预期后按原机制验证，没有更改生产虚拟化。

### 完整检查发现及基线对照

完整 gates 的设计实验室 179 条视觉用例中，初次有 78 条失败、101 条通过。干净 origin/main `6d28f3863244edbdf6e013bea33d26baff0f9615` 完整对照有 73 条失败、106 条通过：73 条失败名称全部相同，没有主线独有失败。共同失败的 73 张实际 PNG 中，71 张字节相同；另外两张动态画面不完全一致，不用失败名称相同替代像素证明。详细 SHA 与初轮 26 条对照见 [baseline-comparison.json](./baseline-comparison.json)。

完整 contracts 105 门已跑完；初轮 8 门失败。新增的私有等待预算与 Context 混合组件/hooks 的 lint 警告已修正并重查；概念 owner 已登记。干净主线同样出现 `check:claude-hooks` 21 个失败、`check:git-path-quoting` 1 个失败、`check:main-guard` 1 个失败；没有修改这些工程脚本。`check:vocabularies` 初轮因浅历史缺少明确 reference 失败，使用门岗支持的 `VOCAB_BASE_REF=origin/main` 重查。`check:walkthroughs` 的干净主线通过（absence 61），本次脚本增加了 7 处缺少 probe 的负断言（全局 68）；已改用共享 `proveProbe` / `expectAbsent`，先验证可见现场再检查消失，不增加基线。重查后 absence 回到 61，门岗通过。`check:main-guard` 在临时目录使用相同目录的真实路径 `TMPDIR` 后通过，证实本机 `/var` 软链接路径是该项失败的环境因素。本报告不会把完整 gates 写成绿色。

其中 5 条音频状态在干净主线通过，确认为本次连带变化：原 `!hasResult` 新增名称条件把排队/运行/失败也当作普通空态。已收紧到 `!hasResult && status === 'idle'（status 使用现有 `node.status || 'idle'` 归一化）`，不改变原媒体名称规则。以原基线重跑 `pf-audio` 的 queued/submitting/generating/finalizing/failed，5 条全部通过；没有更新任何视觉基线。普通空闲节点仍显示外部名称。


按风险策略另跑全量 Vitest：1910 文件、18502 测试通过，2 项 expected fail、38 项 skipped；1 个未改的 `electron/assets/generatedMediaDecode.test.ts` 套件在 beforeAll 制作 WebP 夹具时，FFmpeg 缺少默认 WebP 编码器而失败（该套件 27 项未执行）。用本机 Homebrew FFmpeg 显式路径定向重查仍在同一夹具步骤失败。该结果不能写成全量单测通过，也不证明安装包媒体行为；随后单独执行被短路的 node-suites：janitor 13、agent-runtime 506、stats 8、legacy-entry 2、engineering 29，共 558 项通过。

本次最终 zh-light 原入口 26 项重跑通过；en-light 新 23 项通过。补强脚本时曾把 Director 的 compact guidance 错当作 Clip 那样整段卸载，复查源码后修正测试预期并重跑通过，没有更改生产 Director 结构。


最后亲眼复核 LOD 截图发现音频短条 48px 底盘下沿被裁：共享占位默认 44px 顶部留白，轻量宿主没有按实际短条 bodyHeight 切换 compact。已复用同一实际 bodyHeight 和既有 compact 最小高度判据，短条沿用现成垂直中心。新增逐一检查 14 类 LOD 底盘的上下边界；旧 build 对音频报红（badge bottom 384.248 > body bottom 378.604），新 build 英文浅色/中文暗色两轨各 23 项全部通过，已亲眼读取新远景截图，音频底盘完整居中。不能只检查 SVG 有面积便宣称无裁切。最终补跑相关 4 文件 / 71 单测、官方 typecheck、board-parity 及生产 build 均通过。

## 限制

Windows、安装包、付费生成未验证；本次未请求生成，供应商花费为 0。pointercancel/readOnly 中途切换有源码及单测层证据，未宣称所有原生设备事件已点验。未改的错误/进度/派生状态通过定向测试和源码保留检查，Clip 拖放、Director 已有内容重试等未重新执行。没有新增性能基准，81 节点只是 LOD 功能收据。

逃逸项：USER-20261011-node-guidance；根因合同：docs/fixes/2026-10-11-contextual-node-guidance.root-cause.json。合入及 merge SHA 原入口验收不在此报告范围内。

## 分支交付

实现提交：`ed77bae9228987d4eae1877cd17e53fb6b3d338b`；草稿 [PR #1181](https://github.com/aqm857886159/Nomi/pull/1181)。状态：已推送待合入。普通 pre-push 门岗通过（37.0s），没有绕过钩子。逃逸项在这份待审 PR diff 中结账并指向本 PR，不表示主线已合入或取得 merge SHA 收据。
