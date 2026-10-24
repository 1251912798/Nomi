// 提示词条目的**显示边界**:标题在这里按当前界面语言定型(分组 / 来源名由 libraryGroups.ts 的 libraryGroup 按语言取)。
//
// 为什么要有这一层:这两个字段会**落盘**(userPromptStore 写进 .nomi 下的库文件)。存一句本地化过的
// 「未命名提示词」/「我的」等于把建条目那一刻的界面语言焊死在数据里——英文用户建的条目永远带中文,
// 之后换语言也回不来。所以存储侧只存稳定值(未命名 = 空串;来源由 origin 表达),显示名一律在这里取。
import i18n from '../../i18n'
import type { LibraryPrompt } from '../api/promptLibraryApi'

// 2026-08-28 之前的版本把本地化字符串写进了库文件,老条目里躺着这两句。读侧照旧当「未命名」认,
// 这样存量条目不用迁移也能跟着界面语言走(写侧已经不再产生它们)。
const LEGACY_UNTITLED = new Set(['未命名提示词', 'Untitled prompt'])

export function isUntitledPrompt(title: string | undefined): boolean {
  const trimmed = (title ?? '').trim()
  return trimmed === '' || LEGACY_UNTITLED.has(trimmed)
}

type LocalizedText = { readonly 'zh-CN': string; readonly en: string }
/** getter 只消费 curation 的 title/group 两个双语字段；用最小结构而非整个 SkillCuration，调用方免带全量。 */
type CurationTexts = { curation?: { title?: LocalizedText; group?: LocalizedText } }

/**
 * 按当前界面语言取 curation 的双语字段(2026-09-10 走查反馈:数据里 title/summary/group 本就
 * 强制双语——skillCuration 的 localizedText schema——但库投影写死 ["zh-CN"],切语言不跟)。
 * 与 libraryGroup 的取法同一纪律:zh 开头 → zh-CN,否则 en;缺该语言回退 zh-CN 再回退 en。
 */
function pickLocalized(value: LocalizedText | undefined): string {
  if (!value) return ''
  const key: keyof LocalizedText = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en'
  return value[key] || value['zh-CN'] || value.en || ''
}

/** 卡片/悬浮框上显示的标题:精选条目按界面语言取 curation 双语标题;未命名走本地化占位;其余用用户自己起的名。 */
export function promptDisplayTitle(prompt: Pick<LibraryPrompt, 'title'> & CurationTexts): string {
  const localized = pickLocalized(prompt.curation?.title)
  if (localized) return localized
  return isUntitledPrompt(prompt.title) ? i18n.t('libraries.prompt.card.unnamed') : prompt.title
}
