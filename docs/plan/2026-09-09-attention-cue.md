# Nomi attention cue

状态：实施中。用户已批准三个原创候选、a 暂作默认和开发助手提醒接线。

## 范围与验收

Node 内置 Buffer 写 48 kHz / mono / PCM16 WAV；3 个候选 1.5–2.5 秒且小于 300 KB。
原生系统播放器负责播放，macOS 原生通知负责显示原因。无新依赖，无生产 App UI 改动。
Notification → scripts/claude-hooks/attention-cue.sh → scripts/attention-cue/play.sh。
手动入口安装至 ~/bin/nomi-attention，供 Codex 在需要用户决定时调用。
验收：可重现 WAV、实际本机试播、官方输入夹具贯穿注册命令到播放器、缺播放器静默退出；check:claude-hooks、check:hook-behavior、gates:contracts。
回滚：撤销本次新增文件及 Notification 注册；删除本次安装的个人入口。

## 先查别人：规范 / 我们的偏差 / 理由

官方：https://docs.claude.com/en/docs/claude-code/hooks （现文档 https://code.claude.com/docs/en/hooks#notification）。
已读取 https://code.claude.com/docs/en/hooks.md 的 Notification 输入示例及 matcher 说明。
使用官方 Notification 的 notification_type / message / hook_event_name，零格式偏差。
权限提示约 6 秒未输入后触发；idle_prompt 通常为回复结束后约 60 秒未输入，不保证是关键决策。
匹配 permission_prompt、idle_prompt、elicitation_dialog、elicitation_url_dialog、agent_needs_input，排除完成、认证成功等通知。
仓库近邻 scripts/claude-hooks-registry.cjs:100 的 guardedCommand 和 scripts/install-claude-hooks.cjs:2 已采用版本化注册表直接引用源码；沿用，不恢复复制安装器。
WAV 采用 RIFF/WAVE PCM 标准：https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html 。
不借用现成音频；五声音阶减少半音紧张，但不宣称文化中立或保证旋律从未与任何作品相似。

## 取舍与角色自检

CTO/后端：系统播放器承担音频设备管理，Node 只离线合成；无服务、无新包。
设计/真实用户：暖木质、短促、不循环；三个听觉样张供选择，a 暂用。
PM：不在每次工具调用响；闲置通知语义如上公开说明，关键决策可手动触发。
前端：不改 App 界面；新注册走现有守卫和官方 matcher，无新的通知状态系统。
