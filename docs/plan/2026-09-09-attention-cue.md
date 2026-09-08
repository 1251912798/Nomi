# Nomi 提醒音：品牌旋律与设置页

✅ 已实现并验证，待 PR 合入。用户已授权主会话决定旋律、视觉与产品接线；合入仍走 PR。

## 用户摩擦与取舍

离开窗口后，用户不知道 Nomi 正等审批或失败处理；又不想每次生成完成都被打扰。
选 b（C4–E4–D4–C4，2.25s）：四音先抬起再回落，木质音色，不做警报。
默认总开关开、仅需要决定时响；完成/比平时久须主动开启。既有声音 opt-out 迁移后保持关闭。

## 范围 / 不动项 / 回滚

- 唯一资产 `assets/sound/nomi-attention.wav`，产品和助手 hook 共同读取；其余两个候选保留。
- 通用设置中 Telemetry 之前增加「提醒与声音」，四簇：封面试听、总开关、事件、上传。
- 两条通知入口汇入 `electron/desktopNotification.ts`，声音偏好由主进程读取；系统通知永远 silent。
- 窗口可见且聚焦不响；隐藏/最小化/失焦可响；进程最多一个声音，缺播放器不影响生成。
- 试听不受总开关限制，两秒自动停止；自动提醒完整播放。上传文件验证 ≤10s、≤2MiB 后转 PCM WAV。
- `attention-sound.json` schemaVersion 1 是唯一声音设置 owner；旧声音控件与 WebAudio 实现同时删除。
- 比平时久：同一节点最近成功耗时中位数的两倍，无历史不推断；队列 tick 只发送既有通知 IPC。
- 不改 agentLane、ai/lane、generationCanvas 内部，不加依赖、不接新模型。
- 回滚 scoped commit 即撤销接线；用户自己的文件留在 userData，不做破坏性删除。

## 设计契约（§1.5 / §1.7）

这属于本机偏好，放通用 tab，邻接隐私与诊断。主工作台不加常驻入口（L4）。
使用 DesignButton、DesignSwitch、DesignCheckbox 和现有 paper/ink/accent/line token，无新 token/CSS。
封面纸底、墨线、蓝色取景框景物与响铃圆点/三弧。指定独立封面文档在本 checkout 缺失，按用户明确描述执行。
真实外壳已完整读取；四态样张直接渲染 AttentionSoundSection，经 settings bridge 注入数据。
主会话已看接触表并批准录基线，真实 Electron 1440 宽截图另验暗色实景。

## 先查别人：规范 / 偏差 / 理由

- Electron Notification.silent：https://www.electronjs.org/docs/latest/api/notification；安装版 electron.d.ts 的 NotificationConstructorOptions 为本地依据。无格式扩展。
- Claude Notification：https://code.claude.com/docs/en/hooks#notification；上一阶段已实读官方 hooks.md。
  采用官方 notification_type/message/hook_event_name；仅 permission_prompt/idle_prompt/elicitation_dialog/elicitation_url_dialog/agent_needs_input。
  idle_prompt 约 60 秒无输入，不只意味着关键决策；已有会话可能需要重启才加载注册。
- RIFF/WAVE PCM：https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html；标准 PCM16，无私有格式。
- 最近的内部实现：`electron/settings/vendorPreferenceIpc.ts:6`（设置桥与可信 sender）、
  `electron/settings/projectLocationIpc.ts:95`（原生文件选择）、`electron/export/mediaProbe.ts:118`（有界进程）、
  `electron/export/mediaProbe.ts:430`（真实探测）、`electron/settings/settingsRoot.ts:24`（应用数据根）。
  直接复用已安装 ffmpeg/ffprobe、现有 Electron 通知/原生选择器，无新增框架或解析器。

## 六角色自检

CTO：声音 owner 单一，两生产入口共用边界；不碰 Agent 架构。
设计：token SVG、四态可辨，设置仅一个家；用户授权主会话审图。
PM：默认只打扰需处理事件；完成/慢可选，不承诺没有历史的耗时预测。
前端：真实桥驱动实验室；上传失败保留原值、界面报错；离开设置停止试听。
后端：验证真实 bytes，规范为跨平台 WAV，禁 shell 插值；播放器有界、缺失静默。
真实用户：关掉后不响；在看着时不响；上传后即试听，恢复默认无需找文件。

## 验收门

- 四态：`tests/ux/shots/design-lab-settings-sound/`，对应 `__baselines__/settings-sound/`。
- 真实设置：`tests/ux/shots/attention-sound/settings-1440.png`（1440 CSS px）。
- 真实任务：`tests/ux/attention-sound.walk.mjs` 覆盖 UI→IPC→持久化→播放边界，OS 播放器替身计数，零放声。
- `desktopNotification.test.ts` 覆盖两入口、焦点/开关/事件矩阵与 OS silent；`attentionSoundPlayer.test.ts` 覆盖单声道、停止与路径安全。
- `attentionSound.integration.test.ts` 真转码四格式，拒绝长/大/损坏文件，保留旧资产，迁移 opt-out。
- hook 官方夹具/各 OS 缺播放器测试、i18n/controls/tokens、完整 gates、Ponytail commit/push review。
