// 「照这几镜复刻」真模型走查用的那张拆解表（agent-shot-table-remake-real.paid.mjs）。
//
// 为什么是手写的 5 镜而不是现拆一条片子：被量的是 **Agent 读表 → 照着行起草** 这一段，不是读图腿。
// 现拆一次要花读图模型的钱、镜头内容也每次不同（量不出「它用的是不是第 2 镜的提示词」）。所以这张表的
// 格子按读图腿真实的输出形状写（`electron/video/deconstructVideo.ts` 的 `buildShotAnalysisPrompt`：
// 景别从固定词表里选、画面 30–60 字、一段可直接喂图片模型的提示词），每一镜带一个只属于它的主体词
// （`marker`），用来判 Agent 起草的那一镜到底抄的是哪一行。
const BUILTIN = ['shotSize', 'motion', 'visual', 'dialogue', 'onScreenText', 'mood']

export const REMAKE_SHOTS = Object.freeze([
  { marker: '侧逆光', shotSize: '近景', motion: '镜头缓慢推近', visual: '女孩撑红伞站在霓虹街口，雨夜，侧逆光勾出轮廓', dialogue: '', onScreenText: '', mood: '孤独',
    imagePrompt: '近景，雨夜霓虹街口，撑红伞的年轻女孩侧脸，湿润地面反光，侧逆光，电影感，35mm 胶片质感' },
  { marker: '雨珠', shotSize: '特写', motion: '固定机位', visual: '伞沿滴下的雨珠，背景虚化成一片霓虹灯牌光斑', dialogue: '', onScreenText: '', mood: '静谧',
    imagePrompt: '特写，伞沿一串雨珠正在下落，背景霓虹灯牌化成焦外光斑，浅景深，冷暖对比，微距' },
  { marker: '便利店', shotSize: '中景', motion: '横移跟拍', visual: '女孩沿街走过亮着暖光的便利店橱窗，玻璃里映出她的倒影', dialogue: '（旁白）又是一个人的夜晚。', onScreenText: '', mood: '惆怅',
    imagePrompt: '中景，女孩走过亮着暖光的便利店橱窗，玻璃映出她的倒影，雨夜街道，横向构图，暖黄与青蓝' },
  { marker: '斑马线', shotSize: '全景', motion: '缓慢拉远', visual: '空旷的十字路口，女孩停在斑马线前，头顶是红灯', dialogue: '', onScreenText: 'LOVE IN RAIN', mood: '寂寥',
    imagePrompt: '全景俯拍，雨夜空旷十字路口，斑马线前撑红伞的女孩，红色信号灯，水洼倒映霓虹' },
  { marker: '微笑', shotSize: '特写', motion: '手持微晃', visual: '女孩抬起头，嘴角慢慢露出微笑', dialogue: '你来了。', onScreenText: '', mood: '温暖',
    imagePrompt: '特写，女孩抬头微笑，脸上挂着细小雨滴，暖色补光，柔焦，治愈氛围' },
])

/** 一张「已拆完」的拆解表的 meta（现行 schema：`electron/shared/canvas/shotTable.ts`）。 */
export function remakeShotTableMeta({ sourceNodeId, selectedShots = [], title = '雨夜红伞' }) {
  const rows = REMAKE_SHOTS.map((shot, index) => ({
    rowId: `fact-${index + 1}`, order: index + 1,
    startSeconds: Math.round(index * 16) / 10, endSeconds: Math.round((index + 1) * 16) / 10, durationSeconds: 1.6,
    carriedOver: false,
    cells: {
      shotSize: shot.shotSize, motion: shot.motion, visual: shot.visual, dialogue: shot.dialogue, onScreenText: shot.onScreenText, mood: shot.mood,
      'col-prop': index === 0 ? '红伞' : '',
    },
    imagePrompt: shot.imagePrompt, motionPrompt: shot.motion,
  }))
  return {
    shotTable: {
      schemaVersion: 1, revision: 4, updatedAt: new Date().toISOString(),
      view: { selectedRowIds: selectedShots.map((shot) => `fact-${shot}`), density: 'auto' },
      source: { kind: 'deconstruction', sourceNodeId, title, status: 'ready', durationSeconds: 8 },
      columnSetId: 'facts',
      columns: [
        ...BUILTIN.map((columnId, order) => ({ columnId, kind: 'builtin', labelKey: columnId, order, visible: true })),
        { columnId: 'col-prop', kind: 'custom', labelKey: '道具', hint: '道具', order: 6, visible: true },
      ],
      rows,
    },
  }
}
