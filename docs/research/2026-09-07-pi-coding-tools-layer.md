# pi 的 coding 工具层 · R29 四列表 + 参考实现逐层对照（2026-09-07）

> 状态：📐 研究已交，实施在同一 PR 的后续 commit 里。
> 版本基准：`@earendil-works/pi-*@0.85.1`、`@anthropic-ai/sandbox-runtime@0.0.75`（本文所有 `file:line` 均在这两个版本的 `node_modules` 里实核）。
> 上级方案：[阶段 3/4/5 深度方案](../plan/2026-09-07-agent-rebuild-stage3-5-deep-plan.md) §1.1（三家审批对照）、§3.2（S7 预算）、§3.4（技能）；母方案 [Agent 运行时重做](../plan/2026-09-07-agent-runtime-rebuild.md)。
> 起因（用户 2026-09-07 两句原话）：
> ① 「pi Agent 不本来就是个 coding Agent 吗？我们是不是能够直接把那些工具直接给接进来不就行了？」
> ② 「沙箱机制它肯定有设计，权限设计里肯定有，直接把它抄过来应该就够了。」
> ③ 纠正：「**不是每次问，而是设计权限**。」

---

## 0. 这份文件在回答什么（D6：先说摩擦，再说取舍）

**用户那一刻卡在哪**：技能里带着 `scripts/`，而 Nomi 到今天为止**跳过它们**（`electron/skills/skillPackage.ts` 原注释：「v1 只吃知识层」）。所以一个「给它一段小说 → 它跑我的分镜脚本 → 出图进画布」的技能，在 Nomi 里只能走到第一步。要让第二步跑起来，Agent 得能读文件、写文件、跑命令。

**要权衡的那一个东西**：**让 Agent 能跑命令，和让用户每跑一条命令点一次「允许」，是两回事。** 后者三分钟就会把人逼疯，然后他开始无脑点「允许」——那一刻这套闸的价值变成负的。所以真正的设计题不是「要不要问」，而是**哪些事根本不用问、哪些问一次就够、哪些问一百次也不能记住**。这就是用户那句纠正的意思，也是本文 §3 那张三档表。

**我们自己写多少**：执行器、沙箱、文件工具，一行都不写——pi 和 Anthropic 各自已经把这两块做完了。我们出的只有三样：**范围**（只能碰这个项目）、**策略**（三档权限）、**装载**（什么时候把这组工具亮出来）。

---

## 1. R29 四列表 · `@earendil-works/pi-coding-agent` 的工具层

| 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| **7 个 coding 工具的完整实现**：`createReadTool` / `createGrepTool` / `createFindTool` / `createLsTool` / `createEditTool` / `createWriteTool` / `createBashTool`（`pi-coding-agent/dist/core/sdk.ts:71` 导出；`createCodingTools` = read/bash/edit/write，`createReadOnlyTools` = read/grep/find/ls，并集 7 个，实跑核过） | 全部 7 个，**原样**。`electron/agentLane/laneCodingTools.mts:203-267` 逐个从工厂建出来 | **空** | **空** |
| **`operations` 插槽**：每个工具都可以换掉底层动作，且**收的全是绝对路径**（`dist/core/tools/read.d.ts:22-29`、`edit.d.ts:29-36`、`write.d.ts:17-22`、`grep.d.ts:28-33`、`find.d.ts:26-34`、`ls.d.ts:22-33`、`bash.d.ts:29-41`） | 用它挂**路径包容**这一道：`containPath()` 加在每个 operations 方法上（`laneCodingTools.mts:70-79`）。绝对路径这条性质是它成立的前提——包容判定不必再去猜相对路径基准 | **空** | **空** |
| **`BashSpawnHook`**：spawn 前改 command / cwd / env（`dist/core/tools/bash.d.ts:60-63`） | 用它把 cwd 钉回项目根、把 key 类环境变量摘干净（`laneCodingTools.mts:112-125`） | **空** | **空** |
| **`bashToolSystemPromptContribution`**：`{ snippet, guidelines }`（`dist/core/tools/bash.d.ts:10-13`） | 原样进我们的 `Available tools` / `Guidelines` 两段（`laneCodingTools.mts:296-311` 只做去重与前缀，不改措辞） | **空** | **空** |
| **工具结果截断**：`truncateHead` / `formatSize` / `DEFAULT_MAX_BYTES`（`dist/core/tools/index.ts`） | lane 早已在用（`electron/agentLane/laneTools.mts:70-92`），coding 工具走 pi 自己那一份 | **空** | **空** |
| **`splitDeferredTools` + `addedToolNames`**：按传输决定新解锁的工具定义放前缀还是转录（`pi-ai/dist/utils/deferred-tools.js`） | 解锁时带 `addedToolNames`（`laneToolGroups.mts:98-100`）；**放置完全交给 pi 的 compat 判定**，我们代码里一个传输判断都没有 | **空** | **空** |
| **`estimateTokens`**（chars/4，偏保守；`dist/core/compaction/compaction.d.ts:62`） | 门岗量「组合有多大」用它（`scripts/check-model-schema.ts`）。**没有另写一个估算器** | **空** | **空** |
| **`AgentTool` 的调用签名** `execute(id, params, signal?, onUpdate?)` | — | **空** | **⚠️ 一处签名转接**：`AgentHarness` 要的是 `AgentHarnessTool.execute(id, params, onUpdate, toolContext, invocation, context)`（`pi-agent-core/dist/harness/types.d.ts:78-81`，它自己就写成 `Omit<AgentTool,"execute"> & {…}`）。`adaptPiTool()`（`laneCodingTools.mts:275-291`）展开原对象、只换调用形状，**行为零改动**。<br>**领域理由**：岔路 1 已拍板取 `AgentHarness`（母方案 §7），而 pi 自己就把这两层定义成 `Omit &`——两层签名不同是**上游的分层**，不是我们拆的。 |

**「我们另写了」这一列全空。** 唯一一格非空的是「拆散了」，理由写在格子里。

**一个不属于这四列、但必须说清的加法**：`LANE_CODING_TOOL_EFFECTS`（`laneCodingTools.mts:41-49`）给每个工具挂一份 `{mutates, billable, reversal}`。pi **没有**这个概念，所以它不是「另写了一份 pi 的东西」，是一层 Nomi 领域注解——审批闸按它分档、崩溃恢复按它派生 `replay`。判据与 `laneTools.mts` 的装配期不变量逐字相同（只读必然 `reversal:'none'`），装配期就抛，不留到运行期。

---

## 2. R29 四列表 · `@anthropic-ai/sandbox-runtime`

**先说实查结论**（R5，2026-09-07 从 npm registry 与解包实核）：

| 项 | 实核值 | 出处 |
|---|---|---|
| 当前版本 | `0.0.75`（发布于 2026-09-01） | `registry.npmjs.org/@anthropic-ai/sandbox-runtime` dist-tags |
| 许可证 | **Apache-2.0** | `package.json` `license` |
| 模块格式 | ESM-only（`"type": "module"`，无 `exports` 字段，`main: ./dist/index.js`） | 同上 |
| Node 要求 | `>=20.11.0` | `engines` |
| 运行时依赖 | `@pondwader/socks5-server`、`commander`、`node-forge`、`zod` —— 全是纯 JS，**无原生模块** | `dependencies` |
| Electron 主进程可用？ | **可以**。主进程已经在用动态 `import()` 摸 ESM-only 的 pi（`electron/agentLane/laneRuntimePort.ts` 头部），同一条路。2026-09-07 在本机实跑：`initialize` 63 ms，`~/.ssh` 读被拒、出网被拒、项目内读写正常（§6 的数字） | 本文 §6 |
| macOS | `sandbox-exec`，**另需 `ripgrep`**（README「macOS requires」）。本机 `which rg` = MISSING，而 `checkDependencies()` 仍返回 `{errors:[],warnings:[]}` —— **依赖检查不查 rg 的 PATH**，这是一条要记的坑 | README §Platform Support；本机实跑 |
| Linux | `bubblewrap` + `socat` + `ripgrep`；Ubuntu 24.04+ 还要关 `kernel.apparmor_restrict_unprivileged_userns` | README |
| Windows | **alpha**。要一次**提权**的 `npx @anthropic-ai/sandbox-runtime windows-install`（建 `srt-sandbox` 本地账户 + 装 WFP 出网过滤器），二进制随包（`vendor/srt-win/{x64,arm64}/srt-win.exe`） | README §Windows (alpha) |
| 稳定性自陈 | 「**Beta Research Preview** … APIs and configuration formats may evolve」 | README 顶部 |

> **Windows 的处置（照任务书）**：我们**不替用户提权**。那台机器上 `LaneSandbox.active === false`，UI 明标「此平台无系统级沙箱」，权限策略的第 ① 档（自动放行）**整档消失**（`codingCommandPolicy.ts` 的 `sandbox-unavailable` 分支）。不假装有。

| 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| `SandboxManager.initialize(config)` / `wrapWithSandbox(command)` / `reset()`（`dist/sandbox/sandbox-manager.d.ts:36-80`） | 三个全用，**形状照 pi 的 sandbox 示例**（`examples/extensions/sandbox/index.ts` 的 `createSandboxedBashOps` + `session_start` / `session_shutdown`） | **空** | **空** |
| `filesystem.{denyRead, allowRead, allowWrite, denyWrite}` + `network.{allowedDomains, deniedDomains}`（`dist/sandbox/sandbox-config.js` `FilesystemConfigSchema`） | 全用。策略由项目根 derive，一处生成（`laneCodingSandbox.mts:66-92`） | **空** | **空** |
| `isSupportedPlatform()` / `checkDependencies()` | 用 `isSupportedPlatform()` 决定 `active`；`checkDependencies()` **不当唯一判据**（上面那条 rg 坑） | **空** | **空** |
| macOS SBPL / Linux bwrap 参数、出网代理、violation 归因 | 一行都不碰 | **空** | **空** |

**「我们另写了」这一列全空。** 门岗把它钉住了：`docs/engineering/framework-boundaries.json` 新增 `anthropic-sandbox-runtime` 框架，两条 forbidden（手写 seatbelt/bwrap 参数、另起出网代理）。

---

## 3. 参考实现逐层对照

> R29 的第二份必交物。参考实现 = **pi 自带的扩展示例**（`node_modules/@earendil-works/pi-coding-agent/examples/extensions/`，随 `0.85.1` 发布）与 **`@anthropic-ai/sandbox-runtime@0.0.75` 的 README + 公共面**。
> 判定三档：**一致** / **有意不同（理由必须是 Nomi 领域约束）** / **没想到**。
> 九层里裁掉了 `转录渲染` / `会话` / `上下文` / `模型与花费` 四层的**沙箱侧**（那个包不碰它们），pi 侧九层齐全——裁剪在登记表的 `layers` 里写死，不是省略。

| 层 | 它怎么做 | 我们怎么做 | 判定 | 若没想到补在哪个阶段前 |
|---|---|---|---|---|
| **工具** | pi 出 7 个 coding 工具的完整实现，每个带 `operations` 插槽换底层动作（`dist/core/sdk.ts:71`；`dist/core/tools/*.d.ts` 的 `*Operations`），且插槽收的全是**绝对路径** | 7 个**原样**从工厂建出来；只在每个 operations 方法上加一道 `containPath()`（`laneCodingTools.mts:70-79`）。**零重写** | **一致** | — |
| **工具**（签名） | `AgentTool.execute(id, params, signal?, onUpdate?)` | `AgentHarness` 要 `AgentHarnessTool.execute(id, params, onUpdate, toolContext, invocation, context)`；`adaptPiTool()` 只换调用形状，展开原对象 | **一致**（pi 自己就把两层定义成 `Omit<AgentTool,"execute"> &`，签名不同是上游的分层） | — |
| **转录渲染** | `truncated-tool.ts` 示范工具输出截断；`built-in-tool-renderer.ts` / `entry-renderer.ts` 定制渲染 | 截断走 pi 的 `truncateHead`（阶段 1 已销 G-04）；渲染是我们自己的面板（不是 TUI），不采纳它的 renderer 面 | **有意不同**（领域：Nomi 的界面是 React 面板，不是终端） | — |
| **会话** | `session_start` / `session_shutdown` 里起停沙箱（`sandbox/index.ts:218-260`） | 同形状：lane 装配时 `openLaneSandbox`，`close()` 时 `SandboxManager.reset()` | **一致** | — |
| **上下文** | `dynamic-tools.ts` / `kimi-deferred-tools.ts`：按上下文增删工具，结果带 `addedToolNames` | `nomi_request_tools` + `addedToolNamesForUnlock()`，解锁条件多两条且**单向**（亮了整会话保持亮） | **一致 + 一处有意不同**（单向的理由是 §6 的缓存数字：每翻一次打一次前缀缓存） | — |
| **模型与花费** | pi 的 `estimateTokens`（chars/4，`compaction.d.ts:62`） | 门岗量「组合有多大」直接用它，**没有另写估算器** | **一致** | — |
| **控制流** | `sandbox/index.ts:145-190`：`detached:true` 拿进程组，超时/中止 `process.kill(-pid)` 杀整棵树；`timed-confirm.ts` 给确认加**超时自动决定** | 进程组杀法逐行照抄；**`timed-confirm` 那条不要**——方案 §1.2 已定「审批等待不设自动超时」 | **进程组：一致；超时确认：有意不同**（领域：等待期 lane 不发请求不花钱；「你关掉了」和「你没回答」在用户那里是两句不同的话，不能折成一态） | — |
| **扩展 API** | `pi.registerTool` / `registerCommand` / `registerFlag` / `ui.select`（示例全都靠它） | **不装扩展运行时**（扩展加载探针 §6 已定不借）。工具由契约唯一 owner 派生，UI 是 IPC 卡片 | **有意不同**（领域：factory 阶段拿满进程权限，而 Nomi 要装用户导入的技能） | — |
| **观测与测试** | `sandbox-runtime` 的 `SandboxViolationStore` + `annotateStderrWithSandboxFailures`（macOS 读系统 violation 日志），把「为什么被拒」贴回 stderr | **没想到**。今天命令被沙箱拒了，模型看到的只是一句 `Operation not permitted`——它猜不出是沙箱干的，只会换个写法再试一次（正是「连续 6 次被自己拒收」那一族的形状） | **⚠️ 没想到** | **接 3a 的闸卡之前**（债 D-6） |
| **安全** | `permission-gate.ts:13-33` 三个危险正则 + 无 UI 默认 block；`protected-paths.ts:11-25` 三条保护路径**只挡写** | 三档权限策略：硬清单 6 条（读也拒，且含 Nomi 自己的密钥存储与 macOS 钥匙串）→ 已记住的模式 → 越界 → 沙箱内。无 UI / 无沙箱一律 fail-closed | **有意不同**（领域：pi 只怕**写坏**；Nomi 更怕**读出来**——一条 `cat ~/.ssh/id_rsa` 的输出会原样进模型上下文，而模型上下文会被送到供应商那里） | — |
| **安全**（配置面） | `sandbox/index.ts:74-100` 读用户可编辑的 `.pi/sandbox.json` | **不采纳**。策略从项目根 derive，无任何用户可编辑的沙箱配置 | **有意不同**（领域：一个能被编辑的 `allowWrite` 等于给「越界要问」留一个纯文本后门；D1：让用户多配一样东西，默认砍） | — |
| **安全**（平台缺失） | `sandbox/index.ts:225-236`：平台不支持时 `ui.notify` 一声，**继续跑没有沙箱的 bash** | `active:false` 交给策略层 → 自动放行整档消失，UI 明标「此平台无系统级沙箱」 | **有意不同**（领域：无人盯屏，那条 notify 用户看不见） | — |
| **安全**（替换 vs 包装） | `sandbox/index.ts:203-217` 整个替换内建 `bash` 工具 | **只换 `operations`**——示例自己写了这是可选的：*"Alternatively, you could sandbox `bash` via `tool_call` input mutation without replacing the tool."* | **一致**（走的是示例自陈的更轻那条） | — |
| **安全**（回滚） | `git-checkpoint.ts` / `dirty-repo-guard.ts`：跑之前存 checkpoint，出事能回滚 | **没想到**。`edit`/`write` 标了 `reversal:'undoable'`，但收回的手段今天不存在——文稿撤销栈管不到项目目录里的文件 | **⚠️ 没想到** | **技能脚本默认开启之前**（债 D-3） |

**「没想到」两条**，都进了 §7 的债并绑了到期日：沙箱违规归因（D-6）、写操作的回滚手段（D-3）。

## 4. 三家审批模型对照（Claude Code / Codex / Nomi）

> 出处：Claude Code `https://code.claude.com/docs/en/permission-modes`（§"Actions no mode auto-approves"、`/permissions`）；Codex `https://learn.chatgpt.com/docs/agent-approvals-security`。上级方案 §1.1 已就**总体**审批模型对照过一轮；本表只对 **bash / 命令执行** 这一件事，补它没展开的**规则语法**与**双轴组合**。

### 4.1 档位与规则语法

| 维度 | Claude Code | Codex | **Nomi（本 PR）** | 判定 |
|---|---|---|---|---|
| **顶层形状** | 六个**权限模式**：`default` / `acceptEdits` / `plan` / `auto`（第二个模型当分类器）/ `dontAsk` / `bypassPermissions` | **双轴**：`approval_policy`（`untrusted` / `on-request` / `granular` / `never`）**×** `sandbox_mode`（`read-only` / `workspace-write` / `danger-full-access`） | **三档，由命令自己落**：`sandboxed`（自动放行）/ `escape`（问一次、可记住）/ `hard-list`（永远问或永远拒）。**没有全局模式开关** | **有意不同**（领域：Nomi 的用户不会去设「我现在是 workspace-write 模式」。他只会遇到一条命令，而这条命令自己知道该落哪档。把双轴折成「命令 × 沙箱状态」的判定，用户面只剩两句话——方案 §1.1 定的那两句） |
| **规则语法** | `Bash(npm run *)`：工具名 + 括号 + **前缀通配**。`allow` / `ask` / `deny` 三级，`deny` 在 `bypassPermissions` 下**仍生效** | `granular` 五个独立布尔闸；`false` = **自动拒绝且不展示**（不是放行） | **照抄 Claude Code 的前缀通配**：`npm run *`（`suggestCommandPattern()` / `commandMatchesPattern()`）。`*` 只在末尾有意义、必须落在词边界上（`npm run *` 不匹配 `npm runx build`）。复合命令（含 `;&\|><` 等）**推不出模式**——模式只描述得了第一段 | **一致**（R31：用户已经在别处见过这一种；「这个 App 的通配符和别处不一样」是纯认知负荷，换不来任何东西） |
| **沙箱与审批的关系** | `auto` / sandbox：沙箱里的事不问 | `workspace-write` + `on-request`：**沙箱里的事不问，越出沙箱才问** | **同 Codex**。这正是三档里第 ① 档的定义 | **一致** |
| **谁都不能自动批** | 六条，含显式 ask 规则、`AskUserQuestion` / MCP `requiresUserInteraction`、**关键路径 `rm`**（allow 规则和 `PreToolUse` 的 `"allow"` 都批不动）、跨会话消息 | 「工具声明 `destructiveHint` 时**总是**要审批」；`.git` / `.codex` / `.agents` 在可写根内仍只读 | **硬清单 6 条**，与沙箱、与档位、与任何「记住」全部正交：`host-destructive`(deny) / `privilege-escalation`(deny) / `secret-store`(deny) / `data-exfiltration`(deny) / `outbound-publish`(ask) / `irreversible-delete`(ask) | **一致**（方向与两家相同） |
| **「记住」能不能盖住硬清单** | 不能（deny 压过 allow） | 不能（destructive 硬闸） | **不能**，而且是**判定顺序**保证的：硬清单 → 已记住的模式 → 越界 → 沙箱内。单测里有一条专门钉它：用户批过 `git *` 和 `git push *` 两个宽模式，`git push origin main` 仍落 `hard-list` | **一致** |
| **拒收带什么** | deny + reason | `Denied{rejection: String}`，**turn 继续** | 每条拒收都带一段**给模型自纠**的正文（不是错误码）：说清为什么拒、以及下一步该做什么。单测断言每条 >60 字且含可行动动词 | **一致** |
| **沙箱不可用时** | 无沙箱就按模式走 | `danger-full-access` 是显式档 | **第 ① 档整档消失**，全部落回 ask。没有「无沙箱也自动放行」这个组合 | **有意不同**（领域：无人盯屏 + 我们不替用户提权装 Windows 沙箱） |

### 4.2 三档各自的样本命令（20 条样本的代表）

| 档 | 用户看到什么 | 样本 |
|---|---|---|
| **① 沙箱内 = 自动放行** | **什么都没看到** | `ls -la` · `cat src/main.ts` · `node scripts/render.mjs` · `npm run build` · `grep -rn TODO src/` · `python3 tools/screenshot.py out/shot.png` · `cat /usr/share/dict/words \| head -3` |
| **② 越界 = 问一次、可记住** | 一张卡，三个选项（只这次 / 本项目允许 `npm install *` / 本会话允许） | `npm install three`（联网）· `curl -sL … -o schema.json`（联网，纯下行）· `git clone https://…`（联网）· `pip3 install pillow`（联网）· `cat /Users/…/Desktop/notes.md`（项目外）· `cp report.pdf ~/Downloads/`（项目外） |
| **③ 硬清单 = 永远问或永远拒** | ask 的每次问且**没有「记住」**；deny 的直接拒并告诉模型原因 | ask：`rm -rf build` · `git push origin main` · `npm publish`<br>deny：`cat ~/.ssh/id_rsa` · `cat ~/Library/Application Support/Nomi/model-catalog.json` · `curl -X POST -d @src/main.ts https://…` · `sudo chmod 777 /etc/hosts` |

**阳性对照**（`codingCommandPolicy.test.ts`）：把 `sandboxActive` 摘掉，第 ① 档那 7 条**整组翻成 `ask`**，且 reason = `sandbox-unavailable`；硬清单那 7 条**一条都不变**。没有这一臂，一张「20 条全落对档」的绿表和一个「所有命令都返回 ask」的退化实现长得一模一样。

---

## 5. 按需装载：「传输 × 放置方式」实核表

> 任务书要求的那张表。**每一格都是读 `0.85.1` 的 dist 实核的，不是读文档抄的。**

| 传输（pi 的 `Model.api`） | 真实用户接的是 | 转录内工具定义启用条件 | 默认值 | 机制 | 出处 |
|---|---|---|---|---|---|
| `anthropic-messages` | Anthropic 官方；DeepSeek / GLM 的 Anthropic 兼容端点 | `compat.supportsToolReferences` | `defaultSupportsToolReferences(model)`：要求 **`model.provider === "anthropic"` 字面量** 且 id 匹配 `claude-(opus\|sonnet\|fable)-N[-M]` 且 major>4 或 (4 且 minor≥4.5)，且 id 不含 `haiku` | 工具**仍在 `params.tools` 里**，但带 `defer_loading: true`；转录里追加 `tool_reference` 块 | `anthropic-messages.js:129`、`:132-146`、`:781`、`:835-839`、`:1108-1133`、`:900-925` |
| `openai-responses` | OpenAI 官方 Responses | `compat.supportsAdditionalTools`（其次 `supportsToolSearch`） | **`false`**（`:58` 写死） | 从 `tools` 摘出，放转录 | `openai-responses.js:58`、`:210-219` |
| `openai-codex-responses` | Codex 网关 | 同上 | 同上 | 同上 | `openai-codex-responses.js:374-384` |
| `openai-completions`（Chat Completions） | **DeepSeek 官方 / GLM 官方 / Kimi 官方** | `compat.deferredToolsMode === "kimi"` | **`undefined`**（`detectCompat` 的 `:1310` 写死 `undefined`，自动探测**从不**设它） | 从 `tools` 数组里 filter 掉（`:611-612`），作为一条 `role:"system"` 消息追加在 toolResult 之后（`:1129-1139`） | `openai-completions.js:611-612`、`:1088-1090`、`:1129-1139`、`:1310`、`:1351` |

### 5.1 一条**推翻方案前提**的实核

方案 §按需装载定稿写的是「anthropic-messages / openai-responses 启用、chat-completions 不支持」。**逐格核完，实际情况比那句话严重**：

> **今天出厂的 Nomi，三条传输上「转录内工具定义」全都关着。**
>
> 根因不在 pi，在我们：`createNomiProvider`（`electron/harness/runtime/pi/model.mts:118-131`）构造 `Model` 时**一个 `compat` 字段都不设**。于是：
> - `anthropic-messages` 走 `defaultSupportsToolReferences`，而它要求 `model.provider` **字面量等于 `"anthropic"`**——Nomi 的 provider id 是 vendor key（本机实际值：`apimart` / `api-deepseek-com` / `code-newcli-com` / `api-moonshot-cn` / …），**没有一个**是 `"anthropic"` → 恒 `false`；
> - `openai-responses` 的 `supportsAdditionalTools` 默认 `false` → 恒 `false`；
> - `openai-completions` 的 `deferredToolsMode` 默认 `undefined` → 恒 `false`。
>
> 这就是「**研究结论没进门岗，在下一个 agent 眼里等于不存在**」的又一个实例：`addedToolNames` 我们带了，pi 也收了，但因为档案少声明一个字段，那条便宜通道一次都没被走过。

### 5.2 用户纠正的落地（官方端点，不是 APIMart）

用户 2026-09-07 原话：**APIMart 是我们自己开发用的中转，不是核心设计**；真实用户接的是各家官方端点。三条落地：

1. **解锁策略与传输无关**。`laneToolGroups.mts` 里**一个传输判断都没有**——三个解锁条件（技能声明 / 用户附了代码 / 模型调 `nomi_request_tools`）在任何端点上逐字相同。
2. **放置交给 pi 的 compat 判定**，我们只保证每个模型档案的 `protocol.api` 声明正确（`model.mts:49-53` 的 `protocols` 表：`openai-compatible → openai-completions`、`openai-responses → openai-responses`、`anthropic → anthropic-messages`）。DeepSeek / GLM 同时提供 Anthropic 兼容端点时，档案要能选 `anthropic` 那一档以拿到 Anthropic 的 deferred 语义。
3. **代码里不许出现「默认走 chat-completions」的假设**。本 PR 新增的三个文件（`laneCodingTools.mts` / `laneCodingSandbox.mts` / `laneToolGroups.mts`）里 grep `chat-completions` / `openai-completions` 零命中——`laneToolGroups.mts` 头部注释里那几处是在**说明 pi 的行为**，不是在做判断。

---

## 6. P-D1 · 解锁一次打掉多少缓存（分传输的数字）

**探针**：`scripts/probe-lane-deferred-tools.mts`。它把 lane 真正会发出去的两次请求（锁着 / 解锁后）打到一个只记录请求体的本地服务器上，量**可缓存前缀**的字节差。可缓存前缀 = `tools` 数组 + 该传输的系统指令位（chat-completions 的首条 system message / responses 的 `instructions` / anthropic 的 `system`）；转录消息不算（它们本来就在前缀之后）。

**为什么量出站报文而不是供应商回的 `prompt_cache_hit_tokens`**：
1. **它更强**。缓存命中数受供应商自己的 TTL、分片、负载影响，同一段对话跑两次能差很多；「前缀变了几个字节」是确定的、可复跑的、能在 CI 里当断言的。
2. **活体收据这一轮拿不到，原因明说**（见 §7 债 D-2）。

### 6.1 数字

| 传输 | 真实用户接的是 | 臂 | 前缀字节（锁着） | 前缀字节（解锁后） | 增量 | 前缀失效 | 放置 |
|---|---|---|---|---|---|---|---|
| `openai-completions` | DeepSeek 官方 / GLM 官方 / Kimi 官方 | **今天出厂的样子** | 24 492 | 29 567 | **+5 075** | **20.7%** | prefix（失效一次） |
| `openai-completions` | 同上 | `compat.deferredToolsMode:'kimi'` 已声明 | 24 492 | 24 492 | **+0** | **0%** | transcript（**零代价**） |
| `openai-responses` | OpenAI 官方 Responses | **今天出厂的样子** | 24 130 | 29 009 | **+4 879** | **20.2%** | prefix（失效一次） |
| `openai-responses` | 同上 | `compat.supportsAdditionalTools:true` 已声明 | 24 130 | 24 130 | **+0** | **0%** | transcript（**零代价**） |
| `anthropic-messages` | Anthropic 官方 / DeepSeek·GLM 的 Anthropic 兼容端点 | **今天出厂的样子** | 23 563 | 28 547 | **+4 984** | **21.2%** | prefix（失效一次） |
| `anthropic-messages` | 同上 | `compat.supportsToolReferences:true` 已声明 | 23 563 | 28 694 | **+5 131** | **21.8%** | prefix（**仍然失效**） |

### 6.2 三条结论

1. **今天，每一条传输上解锁一次都要付一次完整的前缀失效：约 4.9–5.1 KB、占可缓存前缀的 20–21%。** 这就是「不按回合翻转、亮了就整会话保持亮」这条设计的全部理由——一轮里翻两次就是两次 20%。

2. **两条 OpenAI 家族的传输上，这笔钱是可以完全省掉的**（0 字节 / 0%），代价只是在模型档案上多声明一个 `compat` 字段。这是一个**独立于本 PR 的、确定的收益**，已记为债 D-1。

3. **Anthropic 上省不掉，而且机制不一样——这是本次实核最反直觉的一格。** `supportsToolReferences` 打开之后，工具定义**仍然全部留在 `params.tools` 里**，只是每个延迟工具多一个 `"defer_loading":true`（7 个工具 × 21 字节 = 147 字节，与实测的 28 694 − 28 547 = **147** 精确对上）；进转录的是 `tool_reference` 块，它改的是**模型什么时候看见**，不是**定义放哪儿**。
   → 所以 Anthropic 端点上的正确做法**不是延迟解锁**，而是**一开始就把 18 个工具全发出去**（前缀从第一轮起就稳定、整段可缓存），让 `defer_loading` 去管可见性。这条写进债 D-1 的方案里。

### 6.3 复跑

```
pnpm exec tsx scripts/probe-lane-deferred-tools.mts
```
零额度、零依赖外部网络（本地 HTTP 夹具）。探针里 `drain()` 会把流上的 `error` 事件**抛出来**——一条静默失败的流会让两臂的字节数都变成「没发请求」，而那看起来和「零缓存代价」一模一样。

---

## 7. 债（每条带到期日；R28：登记是备忘录不是防线）

| # | 债 | 为什么这一轮不做 | 到期 |
|---|---|---|---|
| **D-1** | 模型档案声明 `compat`：OpenAI 家族两条传输开转录内定义（省掉 100% 解锁代价）；Anthropic 端点改成「一开始就全发 + `defer_loading`」 | 它要动 `createNomiProvider` 与模型档案 schema，是 3c/5a 的地盘；本 PR 动它会和两条在途分支冲突。**数字已量好**（§6），方案已写在 §6.2 第 3 条 | 2026-09-21 |
| **D-2** | P-D1 的**活体**缓存收据（三条真实传输各一次，读供应商回的 `prompt_cache_hit_tokens` / `cacheReadTokens`） | **拿不到 key，且原因不是「没试」**：本机的 key 全在 `model-catalog.json` 里走 Electron `safeStorage`，钥匙串 ACL 绑的是**打包后 Nomi.app 的签名**；仓库里的开发版 Electron 解不开——2026-09-07 实跑，10 个 vendor 全部 `Error while decrypting the ciphertext provided to safeStorage`。要么在打包版里跑，要么用户另给一把测试 key | 2026-09-21 |
| **D-3** | `edit` / `write` 的 `reversal:'undoable'` 今天**没有对应的收回手段**（文稿撤销栈管不到项目目录里的文件）。pi 的 `git-checkpoint.ts` / `dirty-repo-guard.ts` 给的正是那个手段 | §3 第 13 行的「**没想到**」。它是一整条设计（项目目录要不要 git、快照放哪、怎么呈现给用户），不该塞进本 PR | 2026-09-21 |
| **D-4** | macOS 上 `checkDependencies()` **不查 `ripgrep` 的 PATH**（本机 `which rg` = MISSING 仍返回零错误）。`grep` 工具与沙箱的 deny-path 检测都依赖它 | 需要决定「随包带一份 rg 还是引导用户装」，那是打包侧的事 | 2026-09-21 |
| **D-6** | 沙箱违规归因：把 `SandboxViolationStore` / `annotateStderrWithSandboxFailures` 接起来，让「被沙箱拒了」这件事以人话回到模型（今天它只看到 `Operation not permitted`，只会换个写法再试） | §3「观测与测试」那条「没想到」。它要和 3a 的闸卡文案一起设计（同一句话既要给模型也要给用户），不该单独落地 | 2026-09-21 |
| **D-5** | `@anthropic-ai/sandbox-runtime` 自陈 **Beta Research Preview**，「APIs and configuration formats may evolve」。0.0.75 已是第 71 个版本 | 上游节奏不由我们定。处置：版本 pin 死（不用 `^`），进 `radar:upstream` 的跟踪表 | 2026-11-07（随 R29 复核期） |

**Windows 不是债，是明标的缺口**：那台机器上没有系统级沙箱（除非用户自己跑提权安装），所以第 ① 档不存在、每条命令都要点头，UI 明说原因。这是 D4「缺口明着标，不藏不糊弄」，不是待办。

---

## 8. 门岗（研究结论怎么变成拦得住人的东西 · R28）

| 结论 | 落成哪道门岗 | 先证会红？ |
|---|---|---|
| 不许自研执行器 / 沙箱 | `check:framework-boundary` 新增 `anthropic-sandbox-runtime` 框架 + `pi/coding-tools` 能力，4 条 forbidden | 是（登记表校验先红过两次：缺 `verifiedAt`、doc 指不到） |
| 工具数与 schema 总量 | `check:model-schema` 新增两条：always-on ≤ `LANE_TOOL_BUDGET`；**任一实际组合** ≤ 10 000 token（用 pi 自己的 `estimateTokens`） | **是**。臂 A：把上限压到 6 000 → `exit=1` 并印出处置；臂 B：把 `LANE_TOOL_BUDGET` 压到 10 → `laneToolCatalog.ts` 在 **import 期**就抛（比门岗更早一层，R28）。复原后 `exit=0` |
| 三档权限判定 | `codingCommandPolicy.test.ts`：20 条样本 + 阳性对照（摘掉沙箱，自动放行组整组翻 ask） | 是（开发中真红过两次：带空格的项目路径被判越界；`<project>-evil` 被前缀匹配误吞） |
| 五条安全断言 | `tests/agent-runtime/lane-coding-tools.test.mts`，含一条**真跑 macOS 沙箱**的（带阳性对照：项目内读写必须成功，否则「被拒」可能只是沙箱把一切都拒了） | 是 |

---

## 9. 先查别人（R27 §16）

| 问 | 答 | 出处 |
|---|---|---|
| 依赖里已有？ | **有，而且是全部**。7 个 coding 工具、operations 插槽、spawnHook、截断、prompt 贡献、deferred-tools 机制、token 估算——pi 全给了；OS 级沙箱 Anthropic 给了 | §1、§2 |
| 依赖里不提供、100% 是我们的活？ | 三样：**范围**（项目包容）、**策略**（三档权限 + 硬清单）、**装载**（什么时候亮这一组）。pi `docs/security.md` 自陈无内置审批、无沙箱 | §3、§4 |
| 仓库里已有？ | `LaneToolEffects` 的声明式副作用（阶段 2 已合）、`before_tool` 闸的接口（3a 在途）、`check:model-schema` 棘轮、技能索引注入（`formatNomiSkillIndex`） | `electron/shared/agentLane/laneToolContract.ts:60-77`；`electron/agentLane/laneHost.mts:99-115`；`electron/harness/skillIndex.ts:34` |
| 生态里已有？ | Claude Code 的权限模式与 `Bash(npm run *)` 规则语法；Codex 的 approval×sandbox 双轴与 `destructiveHint` 硬闸；pi 自带的 6 个相关示例扩展 | §3、§4 |
| 上游最近动了什么？ | `sandbox-runtime` 0.0.75（2026-09-01）是本文写作时的 latest，pi 的示例仍 pin `0.0.26`——**我们接的是 latest 不是示例那个版本**，两者之间 Windows 支持从无到有（alpha） | `examples/extensions/sandbox/package.json`；npm registry |
| TikHub 自媒体里怎么说？ | 本文是运行时内部的沙箱与权限设计，自媒体侧没有可比的一手经验。**明着标，不冒充覆盖。** | — |
