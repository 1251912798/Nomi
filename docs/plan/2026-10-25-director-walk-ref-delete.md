# 导演台走查：参考删除产品修复与英文轨设计卡

改动名：导演台参考真删除与 J1/J6 英文轨 · 线/负责人：`fix/director-walk-ref-delete` · 类别：bug 修复（参考删除共享 owner）

## ★1 用户怎么用

当协调线需要确认导演台的参考挂接生命周期时，我想让走查按真实用户入口删掉参考，并能在中文、英文两种界面完成 J1 / J6，以便走查结果代表实际操作而不是测试直接改状态。

步骤：①启动隔离的导演台走查工程；②让镜头挂上 3D-BOX 预演参考；③在目标节点参考条找到该视频对应的稳定删除按钮并点击；④核对参考数组与对应连边清空、视频 @ 引用清掉、运镜标记保留，方式按 B3 回到文生且预演没有被对账器挂回；⑤只换方式时核对单份参考列表保留，切回参考仍在；⑥换模型时核对对账器重挂，再继续 B2 / C / D；⑦以中文、英文各跑走查并逐张阅读截图。

已知坑：参考删除按钮只有悬停或聚焦时显现；若节点控件在视口外，走查才可调用同一删除 owner，并在代码注释说明原因。真实任务：导演参考挂接免费演练 A/B/B2/C/D；J1 三人场景；J6 截图与录制降级。主指标：目标 → 走查复现真实入口 → `director-reference-attach.walk.mjs` 的 A/B/B2/C/D 全通过、J1/J6 中英文各一轮全通过；质量指标：删除后参考数组、边和 @ 标记一致，英文截图无中文漏出且文字不截断 → 底层回归 + 人眼读取 `tests/ux/shots/director/<journey>/`；护栏指标：不跑付费脚本、不改真实资料 → 命令记录与隔离资料目录。基线 / 目标：当前 B2 前因直接写 store 红；目标为真实删除后全链通过；量具：底层 Vitest、上述走查脚本、截图目录、`git diff`。

### ★1b 连带界面

只验证现有节点参考条和导演台实验室界面，不新增文案或状态：参考条的 × 由现有 `assetLibrary.removeNamed` / `assetLibrary.refRow.disconnect` 词典提供；J1/J6 所有按钮、菜单和状态选择器从 `director.ts` 取当前语言。证据：走查截图与脚本输出。

## ★2 谁说了算

「参考从节点移除」的唯一 owner 是 `src/workbench/generationCanvas/nodes/controls/referenceWrites.ts` 的 `removeFromArray`，它按来源断开连边或按 URL 清理 meta，并对图片、视频、音频统一清理最新 prompt 中的 @ 标记；`cameraMoveAttachedUrl` 保留。走查只通过节点上的 `[data-asset-tile-remove]` 触发该 owner，无法点到时才调用同一 owner 的包装函数。走查状态由现有画布 store / 页面 i18n 所有，脚本不新增事实。允许消费者是该节点参考控件和走查断言；没有第二份参考删除判据，也不靠数组消失猜用户意图，意图是显式点击删除。

证据命令：`node scripts/door-map.mjs removeFromArray`；`rg -n "reference(Video|Image)Urls|disconnectEdge|updateNode" tests/ux -g '*.mjs'`。

## ★3 一致与复用

复用生产 `AssetTile` 的稳定 `data-asset-tile-remove` 锚点、现有 `removeFromArray` 删除 owner、`_directorLab.mjs` 的 `directorText` / `uiText` 词典读取和 `i18n` 的 `nomi:locale:v1` 初始语言机制；不新增删除或翻译判据，不复制中英字符串。走查之间统一经 `launchDirectorLab` 的 `locale` 参数初始化语言。证据命令：`git grep -n "data-asset-tile-remove\|removeFromArray\|directorText"`、`pnpm run check:test-copy-literals`。

## ★4 全状态

- 空参考：节点没有参考条，走查继续报告当前状态；不触发删除。
- 加载 / 悬停：参考条出现，删除按钮按稳定 data 属性可见或可聚焦；不可见时记录同 owner fallback 原因。
- 成功：点击后 `referenceVideoUrls` 为空、对应边为空、prompt 中该 URL 的 @ 标记被清掉、`cameraMoveAttachedUrl` 仍在，方式回到文生且对账器不挂回；随后 B2 重新挂接。
- 失败：删除动作和断言失败，走查截图并退出，不伪造状态。
- 部分成功：同一节点有用户片和预演片时，只删除预演对应 tile，用户片保持，C 继续核对顺序。
- 取消中：不适用；删除是同步本地编辑，无异步取消态。
- 过期：不适用；本改动不改变存储格式或外部资源。
- 能力不可用：导演实验室英文初始化或参考删除锚点缺失时，走查明确报前置 / 结构错误并保留失败截图；下一步是修复走查入口，不改产品逻辑。所有新增选择器文案走现有词典；本改动不新增界面文案。

证据：走查输出、`tests/ux/shots/director-reference-attach/`、J1/J6 中英文截图。

## ★9 验收与回滚

动手前验收清单（实现线逐项自验，独立线只核这份）：

1. 工作树路径、分支正确且开工前干净；改动只在任务书范围与设计卡、报告草稿辅助文件。
2. `director-reference-attach.walk.mjs` 中文从头跑，A / B / B2 / C / D 全通过；B 的删除通过真实 `[data-asset-tile-remove]` 或明确注释的同 owner fallback；截图逐张阅读。
3. `director-reference-attach.paid.mjs` 只静态检查没有同样假删除；不执行，不设 `NOMI_SPEND_OK`。
4. `tests/ux` 同类扫描列出所有直接改参考数组 / 断边的走查，并区分产品入口模拟所需的 fixture 写入与假装用户动作；导演台范围内全部改完，范围外只列清单。
5. `launchDirectorLab({ locale })` 在页面模块加载前写 `nomi:locale:v1`；中文默认调用行为不变。
6. J1 中文、J1 英文、J6 中文、J6 英文各跑一遍；英文截图界面为英文、无中文漏出、无截断；中文截图和原行为无退化。
7. `pnpm run check:test-copy-literals`、改动走查 eslint、helper 的 `node --test`（若存在）通过；工作树最终干净。
8. 反例：直接 `updateNode(... referenceVideoUrls: [])` 仍在本范围脚本；应为 0。反例：按第几个按钮或写死中文选择器；应为 0。反例：删除视频 / 音频数组后 @ 标记仍在；底层矩阵应红。反例：英文页面出现中文或被截断；截图验收失败。反例：系统回文生、用户切方式或同档案变体触发预演重挂；对账键测试应失败。反例：删除连边来源后只清 meta、边仍在导致参考复活；应由真实 owner 断边或走查失败。

根因与边界：症状是 B2 前的走查红；直接原因一部分是上一轮走查绕过真实删除入口，另一部分是生产删除 owner 只清理图片 @ 标记，视频 / 音频数组留下孤儿引用；另外，预演对账器把 B3 系统回文生和用户换方式都当作模型变化。类根因是数组删除和模型身份对账没有共享生命周期边界，且 J1/J6 没有可注入的初始语言。修复收在 `removeFromArray` 与 `previewAttachReconcileKey`：走查通过稳定删除锚点和同一 owner 验证；同类边界由底层三来源 × 三媒体矩阵、模型身份 / 方式 / 变体测试、扫描清单、词典取文案和静态门岗共同防止回归。档案变体目前只叠加参数，不改变任何参考槽形状，所以不触发预演重挂。依赖生命周期：不适用，无第三方运行时变更。

回滚：revert 本分支提交；走查恢复到原先的直接 store 写法和中文默认选择器，但不应作为长期路径保留。
