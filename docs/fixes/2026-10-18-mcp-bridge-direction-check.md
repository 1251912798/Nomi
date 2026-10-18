# 方向检查：MCP 转发口（自写登记 `mcp-protocol`）

日期：2026-10-18 · 触发：自写登记 `mcp-protocol`（status `to-replace`）近 30 天第 32 个 fix（commit-msg 闸）· 现场：`docs/fixes/2026-10-18-mcp-bridge-stale-connection.root-cause.json`

## 0. 一句话根因

转发口 `mcpHttpBridge.ts` 用「有没有 HTTP 状态码」判断 Nomi 开没开，没用仓库里现成的出站判据（`outboundDispatchEvidence`），于是旧连接被复位也当成「没开」。这一刀之所以落在高频修补区，是因为 `mcp-protocol` 这条登记把十几个文件（协议装配、宿主配置迁移、转发口、验证）都算在一个概念里——32 个 fix 里大部分是宿主配置迁移与会话管理，不是转发口的分类。

## 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 本次：重启后叫用户「请先打开 Nomi」 | 复位 ≠ 拒连，转发口没分 | 自写的连接错误分类，没走共享判据 |
| 6123d2754（C-1 C-2）：会话失效不重握手 / 连接检查挤掉真会话 | 转发口当初只做纯搬运 | 转发口要自己扛会话生命周期 |
| 近 30 天其余 fix（宿主配置迁移、验证、启动器） | 各自不同 | 宿主接入领域，与本次无关 |

## 2. 为什么这一类会一直出现

转发口在搬帧之外，越来越多地承担「会话失效重握手、连接错误分类、可否重发」——这些是**传输客户端**的通用能力，不是 Nomi 的领域。每补一种失败形状，就多一个分支。铁律落点：⑫ 点了=以为的——宿主里点工具，以为 Nomi 开着就能用，实际被告知「没开」。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| Nomi 被系统挂起 / 网络栈切换（睡眠唤醒）后，宿主第一次调用报错 | 睡眠唤醒后在 Claude Desktop 里调一次 `nomi_read` |
| 长空闲后服务端关空闲连接，同样撞旧连接（本次修好的路径会兜住；其它新失败形状仍要补） | `mcpHttpBridge.test.ts` 加对应错误形状 |

## 4. 靶子独立性检查

靶子是 SDK 真客户端实连本机服务（`mcpHostReliability.test.ts`）+ 真实 undici 错误形状（`mcpHttpBridge.test.ts`），不是同线自写的 oracle；修前 12 份并跑 12/12 红、修后 12/12 绿。

## 5. P0：现成方案

- **mcp-remote**（npm `mcp-remote` 0.15.1，2026-10-14 发布，MIT，github.com/geelen/mcp-remote 活跃）：给只会 stdio 的宿主（Claude Desktop）接远端 Streamable HTTP 的事实标准代理；支持 `--header` / `--header-file`（签名身份头可走文件，不进进程参数）。**未查证**：会话 404 后是否自动重握手、同端口重启后的行为、错误文案能否区分「没开 / 会话失效 / 身份没过」。登记的 `alternativesChecked` 里**没有它**——这是登记的缺口，本次补上。
- 官方 SDK v2 `StreamableHTTPClientTransport`：已在用（转发口的上游就是它）；它不做「会话失效自动重握手」。

## 6. 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 转发口换成随包分发的 mcp-remote（`--header-file` 带签名身份头），宿主配置迁移改写 Desktop 条目 | 中：打包进 app（离线、`ELECTRON_RUN_AS_NODE` 起），宿主配置迁移要再迁一次；先验它的重启 / 404 行为 | 中：错误文案变成它的英文原话；重握手若不支持要上游补 | **评估后再定**（另起任务：先按 §5 三个未查证点实测） |
| 补（本次做的） | 探活改走仓库唯一的出站判据：拒连才算没开，复位换连接再问（≤4 次），超时不再问 | 小：一个函数 + 一个测试 | 低 | 是（本次，不论后面接不接 mcp-remote 都不白做：判据是共享的） |
| 重写 | — | — | — | 否 |
| 删 | Claude Desktop 已支持远端 HTTP 时删转发口 | 0 | 取决于 Desktop 版本分布 | 盯 Desktop 对本机 HTTP 的支持，届时直接删 |

## 7. 用户要权衡的核心

转发口自写还是换 mcp-remote：换了以后「会话失效 / 重连」这类通用问题交给社区维护，代价是要打包一个第三方进程、再迁一次 Claude Desktop 配置、失去中英区分的错误文案。本次只修分类，不碰这个选择。

## 特征测试清单

- `electron/capabilityCore/mcpHttpBridge.test.ts`：复位→复位→404 恢复；拒连一次即报没开；一直复位最多探 4 次
- `electron/capabilityCore/mcpHostReliability.test.ts`：SDK 真客户端实连，同端口重启后 tools/list 照常（12 份并跑全绿）
- `electron/capabilityCore/mcpLauncherClosure.test.ts`：转发口闭包仍 electron-free
