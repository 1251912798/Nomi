# PR #661 CI 根因修复 · 2026-09-09

- 失败旅程：`production-mcp`，第 205 行期望 `document_not_found`，实际 `errorCode: null`。
- 根因：共享 RPC serializer 只保留 `RpcError` 的码，普通 `Error + code` 经 GUI RPC 丢码；不是通知静音/焦点契约错误。
- 修复：`rpcErrorWirePayload` 复用已有公开错误投影，保留合法码并避免携带私有异常字段；原旅程断言不放宽。
- main 对照：run `34269855450` E2E 成功，但 loopback step 是 **skipped**，不能当成该旅程通过。
- 先红：本地 `2026-09-08T19-54-08.159Z-real-user-journeys` 为 6/7；新增四类错误往返测试 4 红。
- 后绿：本地 `2026-09-08T20-01-01.292Z-real-user-journeys` 为 **7/7**；生产旅程 **58 assertions**、重启恢复、H.264/AAC MP4 导出通过；九张截图已查看。相关单测 **43/43**，根因合同与 fresh build 通过。
- 完整 `pnpm run gates`：通过；75 门岗中 72 通过、0 阻断失败、3 文档 advisory；Vitest 12075 passed / 2 skipped，运行时测试与构建通过。
- 第一轮远端收据：提交 `c1f1ac000e8521045c8cba956243d0ca2b582f1c`，run `34276122424`，Quality Gate **fail**；Contracts / Unit / Mac Package 均 pass。E2E 更早的 C7 T14 旧文案正则在英文 receipt_invalid 提示下失败，原 loopback 步骤因此未执行；已改为严格结构化契约断言；真实英文 L2 **67/67**，双语 RPC 单测 **10/10**，临时 --lang=en 已撤掉。最终本地 loopback **7/7**（`2026-09-08T21-16-57.602Z-real-user-journeys`）与 gates 均通过；Vitest **12077 passed / 2 skipped**。等待补充提交的最终 CI。
- 付费：0；未更改通知 UX、未绕过 hook、未合并 PR。

# 产品接入交接 · 2026-09-09

- 选 b：do–mi–re–do / C4–E4–D4–C4，2.25 秒；四音木质音色先抬起后回落，辨识清楚且克制。
- 唯一资产：`assets/sound/nomi-attention.wav`；产品 extraResources 和 `scripts/play-attention-cue.sh` 都用它。
- 设置真实截图：`tests/ux/shots/attention-sound/settings-1440.png`。
- 四态截图：`tests/ux/shots/design-lab-settings-sound/{sound-01-on,sound-02-off,sound-03-custom,sound-04-playing}.png`；接触表 `_contact-sheet.png`。
- 主会话已查看四态与真实暗色设置截图；四态基线录入 `tests/ux/design-lab/__baselines__/settings-sound/`。
- 响铃边界：`electron/desktopNotification.ts:17`；焦点门 `:13`，系统通知 `silent: true` 在 `:20`。
- 真实走查通过：关不响、前台不响、失焦响一次；试听两秒复位；上传、重开保留、恢复默认。
- 完整 `pnpm run gates` 通过：72 阻断性门岗绿，3 仓库文档 advisory；Vitest 11999 passed / 2 skipped，Agent runtime、stats、构建均通过。
- macOS arm64 打包成功；包内 WAV 与源码 SHA-256 同为 a7f2c8ac06d054e0ebbe40fb9430813b7d1997c11dd39c9ddf9824e1994c4864。
- 分支 `chore/attention-cue-20260909`；提交与 PR 见 Git 历史 / 主会话交付消息。

## 上一阶段交接
- a: mi–sol–高 do; b: do–mi–re–do; c: do–sol–高 do
- Hook: Notification matcher permission_prompt|idle_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input
- Docs: https://code.claude.com/docs/en/hooks#notification (原入口 https://docs.claude.com/en/docs/claude-code/hooks)
- ~/bin/nomi-attention: 已装好，指向本 worktree 的 play.sh
- 本机试播：afplay a.wav 成功返回；文件 48 kHz PCM16、1.90s
