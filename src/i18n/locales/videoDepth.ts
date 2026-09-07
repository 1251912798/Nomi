/**
 * 深度视频节点的界面文案（zh-CN / en，R15）。
 *
 * 两条写作纪律，都是产品决定不是排版偏好：
 * ① **诚实边界必须在界面上**（§12.4）。深度参考不承载手指细节、表情、衣物飘动，
 *    人-物交互语义弱，而且那次真实付费 A/B 里原片臂在「具体手部动作」上是**赢**的。
 *    这些话住在 `limits.*`，节点上一直看得见，不是折叠在某个帮助里。
 * ② **每条错误都要能说出下一步**。压成一句「处理失败」等于没说
 *    （check:outbound-policy 规则 4 抓的正是那一族）。
 */
export const zhVideoDepth = {
  source: {
    label: '源视频',
    pick: '选一段画布上的视频',
    empty: '画布上还没有视频。先生成或导入一段，再回到这里选它。',
    missing: '原来那段视频已经不在画布上了，重新选一段。',
  },
  mode: {
    label: '输出',
    depth: '深度',
    depth_skeleton: '深度 + 骨架',
    original_skeleton: '原片 + 骨架',
  },
  resolution: {
    label: '分辨率',
    native: '518px（快）',
    original: '全分辨率（慢很多）',
    hint: '518 是这个模型原生的训练尺寸，比全分辨率快约三倍。产物是给模型看的结构参考，不是成片。',
  },
  fps: { label: '帧率' },
  direction: { label: '近处', nearWhite: '近处偏白', nearBlack: '近处偏黑' },
  smoothing: { label: '时间平滑' },
  people: { label: '最多几个人' },
  trim: { label: '处理范围', start: '从（秒）', end: '到（秒）', endHint: '留 0 = 到结尾' },
  run: { start: '开始处理', again: '重新处理', cancel: '取消' },
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
    frames: '{{done}} / {{total}} 帧',
    bytes: '{{done}} / {{total}}',
    eta: '预计还要 {{eta}}',
    measuring: '正在测速...',
  },
  download: {
    /** 第一次用这个节点时会下权重。明说体积，别让进度条自己冒出来。 */
    pending: '第一次用要先下载 {{size}} 的模型权重（只下这一次）。',
  },
  limits: {
    title: '深度参考做得到什么、做不到什么',
    carries: '它保留的是身体的动作结构和远近关系。',
    fingers: '不承载：手指细节、面部表情、衣物飘动。',
    interaction: '人和物的交互（踢球、持剑这类）会退化——深度图有轮廓、没语义。',
    honest: '也不保证比直接喂原片更准：我们那次真实对照里，原片在「具体手部动作」上反而更好。',
  },
  error: {
    'source-unavailable': '读不到那段源视频。它可能已经被移出项目——重新选一段再试。',
    'source-unmeasurable': '量不出这段视频的尺寸或时长，没法开跑。换一段视频，或先把它导出成 mp4。',
    'over-budget': '按现在的参数这次要跑很久。把分辨率调回 518px、降帧率，或把处理范围裁短。',
    'model-download-failed': '模型权重没下完。检查网络或代理后重试——已经下的部分不会留下坏文件。',
    'webgpu-unavailable': '这台机器上没有可用的 WebGPU，这个节点跑不了。我们不退 CPU：那会把几秒的处理变成十几分钟。',
    'inference-failed': '推理中途出错了。重试一次；一直失败就换一段视频或降低分辨率。',
    'media-failed': 'ffmpeg 抽帧或合成失败。确认这段视频能正常播放，再重试。',
    'already-running': '这个项目已经有一个深度任务在跑。等它结束或先取消它。',
    retry: '重试',
  },
} as const

export const enVideoDepth = {
  source: {
    label: 'Source video',
    pick: 'Pick a video from the canvas',
    empty: 'No video on the canvas yet. Generate or import one, then come back and pick it.',
    missing: 'That video is no longer on the canvas. Pick another one.',
  },
  mode: {
    label: 'Output',
    depth: 'Depth',
    depth_skeleton: 'Depth + skeleton',
    original_skeleton: 'Original + skeleton',
  },
  resolution: {
    label: 'Resolution',
    native: '518px (fast)',
    original: 'Full resolution (much slower)',
    hint: "518 is this model's native training size and runs about three times faster. The output is a structural reference for a model, not a finished shot.",
  },
  fps: { label: 'Frame rate' },
  direction: { label: 'Near', nearWhite: 'Near is white', nearBlack: 'Near is black' },
  smoothing: { label: 'Temporal smoothing' },
  people: { label: 'Max people' },
  trim: { label: 'Range', start: 'From (s)', end: 'To (s)', endHint: 'Leave 0 for the end' },
  run: { start: 'Start', again: 'Run again', cancel: 'Cancel' },
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
    frames: '{{done}} / {{total}} frames',
    bytes: '{{done}} / {{total}}',
    eta: 'About {{eta}} left',
    measuring: 'Measuring speed...',
  },
  download: {
    pending: 'First run downloads {{size}} of model weights (once).',
  },
  limits: {
    title: 'What a depth reference does and does not carry',
    carries: 'It keeps body motion structure and near/far relationships.',
    fingers: 'It does not carry finger detail, facial expression, or cloth movement.',
    interaction: 'Person-object interaction (kicking a ball, holding a sword) degrades — a depth map has contours, not meaning.',
    honest: 'It is also not guaranteed to beat feeding the original clip: in our own A/B the original scored better on specific hand motion.',
  },
  error: {
    'source-unavailable': 'That source video could not be read. It may have been removed from the project — pick another one.',
    'source-unmeasurable': 'The size or duration of this video could not be measured, so the run was not started. Try another clip, or export it to mp4 first.',
    'over-budget': 'These settings would take a very long time. Go back to 518px, lower the frame rate, or trim the range.',
    'model-download-failed': 'The model weights did not finish downloading. Check your network or proxy and retry — no partial file is kept.',
    'webgpu-unavailable': 'No usable WebGPU on this machine, so this node cannot run. There is no CPU fallback on purpose: it would turn seconds into a quarter of an hour.',
    'inference-failed': 'Inference failed partway through. Retry once; if it keeps failing, try another clip or a lower resolution.',
    'media-failed': 'ffmpeg could not extract or encode the frames. Check that the clip plays, then retry.',
    'already-running': 'This project already has a depth run going. Wait for it or cancel it first.',
    retry: 'Retry',
  },
} as const
