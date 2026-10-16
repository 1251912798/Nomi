// 「强调色描边」扫描器（2026-10-10，用户拍板去蓝色描边）。
//
// 规则（用户原话：「蓝色描边不需要 我们现在很多地方出现这种东西 都删掉吧」）：
//   单选不加框；多选深色细线；素材右上角深色小勾；当前项淡底色；键盘焦点环保留但改深色；
//   装饰 / 悬停 / 输入框蓝边改灰线（输入框聚焦加深一档）；蓝色只留主按钮 / 链接 / 进度 / 连线握把。
// 所以「强调色 / info 族色用在 border / outline / ring / divide / box-shadow 上」只许减不许增：
// 存量白名单在 scripts/accent-outline-baseline.json，每条带理由，逐文件计数。
//
// 只数「描边」用法；文字色、底色、stroke（连线握把）不算。

const EDGE = '(?:border|outline|ring|divide)(?:-[trblxyse])?'
const COLOR = '(?:nomi|workbench)-(?:accent|info)(?:-(?:soft|edge))?'

/** Tailwind 命名类：border-nomi-accent、hover:ring-nomi-accent/40、focus-visible:outline-nomi-accent … */
const NAMED = new RegExp(String.raw`(?<![\w-])${EDGE}-${COLOR}(?![\w-])`, 'g')
/** 任意值类：border-[var(--nomi-accent)]、ring-[var(--workbench-accent)]、border-[color-mix(…var(--workbench-accent)…)] */
const ARBITRARY = new RegExp(String.raw`(?<![\w-])${EDGE}-\[[^\]\s]*var\(--${COLOR}(?![\w-])`, 'g')
/** 阴影类：shadow-[0_0_0_3px_var(--nomi-accent-soft)]、shadow-[inset_…color-mix(…var(--workbench-accent)…)] */
const SHADOW = new RegExp(String.raw`(?<![\w-])shadow-\[[^\]\s]*var\(--${COLOR}(?![\w-])`, 'g')
/** CSS / 行内样式声明：border-left: 3px solid color-mix(…var(--workbench-accent)…)、boxShadow: '0 0 0 2px var(--nomi-accent)' */
const DECLARATION = new RegExp(
  String.raw`(?:^|[\s{;,'"])(?:border[\w-]*|outline[\w-]*|box-shadow|boxShadow)['"]?\s*:[^;]*var\(--${COLOR}(?![\w-])`,
  'g',
)

/** 一行里的命中数。注释行（// 或 * 开头）不算。 */
export function countAccentOutlineInLine(line) {
  const trimmed = line.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return 0
  let n = 0
  for (const re of [NAMED, ARBITRARY, SHADOW, DECLARATION]) {
    re.lastIndex = 0
    n += (line.match(re) ?? []).length
  }
  return n
}

export function countAccentOutlineInText(text) {
  let n = 0
  for (const line of text.split('\n')) n += countAccentOutlineInLine(line)
  return n
}

/**
 * token 别名检查：焦点环与 info 族不许再别名到强调色（blue），否则全 App 的键盘焦点环 / 提醒线
 * 会绕过类名扫描继续染蓝。返回违规描述数组。
 */
export function findAccentAliasedTokens(text, file) {
  const out = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const m = line.match(/(?:^|[\s'"])(--nomi-focus|--nomi-info)['"]?\s*:\s*(.+)$/)
    if (m && /--nomi-accent|--workbench-accent/.test(m[2])) {
      out.push({ file, line: i + 1, token: m[1], value: m[2].trim() })
    }
  })
  return out
}
