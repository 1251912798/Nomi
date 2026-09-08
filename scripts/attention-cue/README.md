# Nomi · 叫你一下

原创合成，无歌词、无人声、无鼓、无外部音频样本。轻敲木条般的正弦基音和两个快速衰减泛音。

| 候选 | 唱名 / 音高 | 时长 / 大小 | 气质 |
| --- | --- | --- | --- |
| [a](candidates/a.wav)（暂定） | mi–sol–高 do / E4–G4–C5 | 1.90s / 182,444 B | 上行三音，轻轻叫一下，落在主音。 |
| [b](candidates/b.wav) | do–mi–re–do / C4–E4–D4–C4 | 2.25s / 216,044 B | 四音先抬起再回落，温和、不催促。 |
| [c](candidates/c.wav) | do–sol–高 do / C4–G4–C5 | 1.70s / 163,244 B | 两音再落八度主音，简短确定。 |

五声材料为 do/re/mi/sol/la：不含半音，减少短促提示的紧张感。许多文化都使用五声，但它不保证文化中立，也不保证每个人偏好相同。品牌签名最终由试听决定。

```sh
node scripts/attention-cue/compose.mjs
bash scripts/attention-cue/play.sh --candidate a --reason '试听 a'
bash scripts/attention-cue/play.sh --candidate b --reason '试听 b'
bash scripts/attention-cue/play.sh --candidate c --reason '试听 c'
~/bin/nomi-attention '要花钱 ¥33'
```

选定后只改 `play.sh` 的 `candidate=a` 一行；手动入口和自动 hook 共用它。
`compose.mjs` 的 sound / scores 可改音阶、音序、时值、包络、泛音和采样率。
产物为标准 RIFF/WAVE、48 kHz、单声道 PCM16；重新生成逐字节相同，无随机数。

macOS 使用 afplay + 标题「Nomi 需要你」的系统通知；Linux 使用 paplay/aplay；Windows 从 Git Bash/MSYS/Cygwin 运行并调用 PowerShell SoundPlayer。没有播放器、设备不可用或通知权限关闭时不阻断助手。系统音量/勿扰模式会影响实际可听和通知显示。

## 自动触发边界

官方 [Notification 文档](https://code.claude.com/docs/en/hooks#notification)（原入口 https://docs.claude.com/en/docs/claude-code/hooks）。注册在版本化 `.claude/settings.json`，调用 `scripts/claude-hooks/attention-cue.sh`；校验命令 `node scripts/install-claude-hooks.cjs --check`。当前仓库无需复制安装，不编辑旧 `.claude/hooks/` 产物。

仅 permission_prompt / idle_prompt / elicitation_dialog / elicitation_url_dialog / agent_needs_input 响。不接工具调用、完成或认证成功事件。permission_prompt 通常等待约 6 秒；idle_prompt 通常在回复结束约 60 秒未输入后触发，它不只代表关键决策。计时和版本差异以官方文档为准。已有 Claude Code 会话可能需要重新打开才能加载新增注册。

Codex 不读取 Claude Code 的 Notification 配置；主会话在花钱、不可撤销动作或样张冲突时主动调用个人入口。通知正文会出现在本机通知中心，原因不要包含密钥。个人入口不进 Git；当前指向本 worktree，清理 worktree 前须重装到长期保留的仓库位置。
