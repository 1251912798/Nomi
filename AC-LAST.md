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
