# Nomi · 叫你一下

选定 **b：do–mi–re–do / C4–E4–D4–C4**，2.25 秒，48 kHz 单声道 PCM16，216,044 B。
木质四音先抬起再回落：短时间内可辨认，尾音落稳，像叫你一下而非警报。五声音阶不含半音，
但不宣称文化中立或保证与任何既有作品绝无相似。原创合成、无外部样本。

唯一默认资产：[assets/sound/nomi-attention.wav](../../assets/sound/nomi-attention.wav)。
产品和助手钩子都读取它；打包复制到 resources/assets/sound/nomi-attention.wav。
另两个候选保留：[a](candidates/a.wav)（mi–sol–高 do，1.90s）、[c](candidates/c.wav)（do–sol–高 do，1.70s）。

```sh
node scripts/attention-cue/compose.mjs
bash scripts/play-attention-cue.sh --reason '请决定下一步'
bash scripts/play-attention-cue.sh --candidate a --reason '试听候选 a'
~/bin/nomi-attention '需要确认支出'
```

生成器只使用内置 Node Buffer，重跑逐字节一致；b 直接生成到正式资产路径，不保留副本。
钩子的播放脚本在 `scripts/play-attention-cue.sh`，本目录仅生成/验证脚本、README 和候选。

## 产品

设置 → 通用 → 提醒与声音（Telemetry 上方）。总开关默认开；仅「需要你决定」默认开，
完成与比平时久默认关。试听独立于总开关，播放两秒后停止；自动提醒完整播放一次。
「比平时久」以同一节点最近成功记录的中位耗时两倍为界；没有历史样本不报慢。

自定义支持 wav/mp3/aiff/m4a，≤10 秒且≤2 MiB；已有 ffprobe 验证、ffmpeg 转成 PCM WAV，
存入应用设置目录 `sounds/attention.wav`。设置写入 `attention-sound.json`（schemaVersion 1）。
失败或取消保留之前的声音；恢复默认清除自定义选择。此产品设置不控制开发助手钩子。

两条现役入口 `notificationIpc.ts` / `productionNotificationsDesktop.ts` 汇入
`electron/desktopNotification.ts`：窗口可见且聚焦时不打扰，原生通知固定 `silent: true`，
声音由主进程 `attentionSoundPlayer.ts` 播放，最多一个声音，禁 shell 插值。
macOS afplay；Windows PowerShell System.Media.SoundPlayer；Linux paplay/aplay。
缺播放器/音频设备不会阻断生成；试听失败会显示提示。

## 助手钩子

官方 [Notification 文档](https://code.claude.com/docs/en/hooks#notification)。
版本化 `.claude/settings.json` → `scripts/claude-hooks/attention-cue.sh` → 共用 WAV。
仅 permission_prompt / idle_prompt / elicitation_dialog / elicitation_url_dialog / agent_needs_input 响。
permission_prompt 通常约 6 秒，idle_prompt 通常约 60 秒无输入；idle 不只代表关键决策。
已有 Claude Code 会话可能需重新打开才加载注册。Codex 不读取 Claude Notification 配置，使用手动入口。
通知正文出现在本机通知中心，不放密钥；个人入口不进 Git，清理 worktree 前需改到长期仓库位置。

## 验证

- `node --test scripts/attention-cue/attention-cue.node-test.mjs`：资产重现、官方 hook 输入、各平台播放器及缺失降级。
- `electron/desktopNotification.test.ts`：两入口、焦点/开关/事件矩阵、无双音。
- `electron/settings/attentionSound.integration.test.ts`：四格式真解码、拒绝损坏/超限、保留旧声音。
- `node tests/ux/attention-sound.walk.mjs`：真实设置 + IPC + 原生选择器，替换 OS 播放器计数，不真放声。
- `node tests/ux/design-lab-settings-sound.walk.mjs`：四态截图。
