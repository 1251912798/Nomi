/**
 * 「提取深度」的界面文案（zh-CN / en，R15）。
 *
 * 三条写作纪律，都是产品决定不是排版偏好：
 * ① **第一屏不写解释段落**（2026-09-07 用户拍板）。上一版整节点铺了八行参数 + 四行说明，
 *    用户的原话是「不够简单、丑、不知道怎么用」。现在第一屏只有一个必答选择和一颗开始，
 *    唯一那句诚实边界收进「高级」，一行说完。
 * ② **诚实边界不许消失**（§12.4）。深度参考不承载手指细节、表情、衣物飘动，而且那次真实
 *    付费 A/B 里原片在「具体手部动作」上是**赢**的。收进「高级」是换层级，不是删掉它。
 * ③ **每条错误都要能说出下一步**。压成一句「处理失败」等于没说
 *    （check:outbound-policy 规则 4 抓的正是那一族）。
 *
 * 相对独立节点那一版删掉的键（P1：没有消费方就不留）：`source.*`（源就是被选中的那个节点，
 * 不再需要挑）、`direction.*` / `people.*`（v1 不暴露，走内部默认——用户没有判断依据的旋钮
 * 不占控件预算）、`resolution.hint` / `download.pending`（解释段落）、`run.*`（开始按钮的
 * 文案归 action.*，取消归遮罩自己的按钮）、`progress.frames|bytes|measuring`（节点上只报
 * 阶段名 + 预计剩余）。
 */
export const zhVideoDepth = {
  action: {
    label: '提取深度',
    hint: '在本机把这段视频跑成深度视频，拿去当动作参考',
    start: '开始',
    /** 权重只下这一次。进度长在按钮里，不另起一段说明。 */
    downloading: '下载模型 {{size}}… {{percent}}%',
    desktopOnly: '这个动作要在桌面版里跑（推理在本机）。',
  },
  mode: {
    label: '输出',
    depth: '深度',
    depth_skeleton: '深度+骨架',
    original_skeleton: '原片+骨架',
  },
  advanced: {
    label: '高级',
    limits: '保留动作结构与远近；不含手指、表情、衣物细节，也不保证比直接喂原片更准。',
  },
  resolution: {
    label: '分辨率',
    native: '518px（快）',
    original: '全分辨率（慢很多）',
  },
  fps: { label: '帧率' },
  smoothing: { label: '时间平滑' },
  trim: { label: '处理范围', start: '从（秒）', end: '到（秒）', endHint: '留 0 = 到结尾' },
  phase: {
    downloading: '正在下载模型权重',
    extracting: '正在抽帧',
    warming: '正在预热 GPU',
    processing: '正在逐帧推理',
    encoding: '正在合成视频',
    done: '完成',
    cancelled: '已取消',
  },
  progress: {
    eta: '预计还要 {{eta}}',
  },
  error: {
    'source-unavailable': '读不到那段源视频。它可能已经被移出项目——重新选一段再试。',
    'source-unmeasurable': '量不出这段视频的尺寸或时长，没法开跑。换一段视频，或先把它导出成 mp4。',
    'over-budget': '按现在的参数这次要跑很久。把分辨率调回 518px、降帧率，或把处理范围裁短。',
    'model-download-failed': '模型权重没下完。检查网络或代理后重试——已经下的部分不会留下坏文件。',
    'webgpu-unavailable': '这台机器上没有可用的 WebGPU，这个动作跑不了。我们不退 CPU：那会把几秒的处理变成十几分钟。',
    'inference-failed': '推理中途出错了。重试一次；一直失败就换一段视频或降低分辨率。',
    'media-failed': 'ffmpeg 抽帧或合成失败。确认这段视频能正常播放，再重试。',
    'already-running': '这个项目已经有一个深度任务在跑。等它结束或先取消它。',
  },
} as const

export const enVideoDepth = {
  action: {
    label: 'Depth',
    hint: 'Run this clip through a local depth pass to use as a motion reference',
    start: 'Start',
    downloading: 'Downloading model {{size}}… {{percent}}%',
    desktopOnly: 'This action runs in the desktop app (inference happens on your machine).',
  },
  mode: {
    label: 'Output',
    depth: 'Depth',
    depth_skeleton: 'Depth+pose',
    original_skeleton: 'Clip+pose',
  },
  advanced: {
    label: 'Advanced',
    limits: 'Keeps body motion and near/far; no finger, face or cloth detail, and not guaranteed to beat the original clip.',
  },
  resolution: {
    label: 'Resolution',
    native: '518px (fast)',
    original: 'Full resolution (much slower)',
  },
  fps: { label: 'Frame rate' },
  smoothing: { label: 'Temporal smoothing' },
  trim: { label: 'Range', start: 'From (s)', end: 'To (s)', endHint: 'Leave 0 for the end' },
  phase: {
    downloading: 'Downloading model weights',
    extracting: 'Extracting frames',
    warming: 'Warming up the GPU',
    processing: 'Running inference',
    encoding: 'Encoding the video',
    done: 'Done',
    cancelled: 'Cancelled',
  },
  progress: {
    eta: 'About {{eta}} left',
  },
  error: {
    'source-unavailable': 'That source video could not be read. It may have been removed from the project — pick another one.',
    'source-unmeasurable': 'The size or duration of this video could not be measured, so the run was not started. Try another clip, or export it to mp4 first.',
    'over-budget': 'These settings would take a very long time. Go back to 518px, lower the frame rate, or trim the range.',
    'model-download-failed': 'The model weights did not finish downloading. Check your network or proxy and retry — no partial file is kept.',
    'webgpu-unavailable': 'No usable WebGPU on this machine, so this action cannot run. There is no CPU fallback on purpose: it would turn seconds into a quarter of an hour.',
    'inference-failed': 'Inference failed partway through. Retry once; if it keeps failing, try another clip or a lower resolution.',
    'media-failed': 'ffmpeg could not extract or encode the frames. Check that the clip plays, then retry.',
    'already-running': 'This project already has a depth run going. Wait for it or cancel it first.',
  },
} as const
