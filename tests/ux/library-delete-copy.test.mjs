// ⑭ 项目库删除的文案：Library 板清单、产品词典、流程真交给界面的那句，三处一致。
// 板上的认领（board:Library/…）：卡片删除钮的名字、确认框、删除后的提示（真进了回收站 / 只摘了登记没进回收站）、进不了回收站的失败提示。
// 这里不抄任何一句界面文案：期望值全从词典（src/i18n/resources.ts，界面文字的唯一真相源）和板清单里读——
// 词典改了而板没跟着改（或反过来）、流程换了词典键，都在这里红。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import { resources } from '../../src/i18n/resources'
import { PROJECT_TRASH_FAILURE_REASONS, projectTrashFailedMessage } from '../../electron/shared/projectDeleteIntent'
import { runProjectDeleteFlow } from '../../src/workbench/library/projectDeleteFlow'
import { projectOperationFailureText } from '../../src/workbench/project/projectOperationFailureText'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const board = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/design/boards/2026-10-08/Library.board.json'), 'utf8'))
const element = (id) => {
  const found = board.elements.find((item) => item.id === id)
  if (!found) throw new Error(`Library 板里没有元素 ${id}`)
  return found
}

const LOCALES = ['zh-CN', 'en']
const PLATFORMS = ['win32', 'darwin', 'linux']
const BIN_KEY = { win32: 'trashBinWindows', darwin: 'trashBinMac', linux: 'trashBinLinux' }
const FAILURE_KEY = { permission: 'projectTrashFailedPermission', 'no-trash': 'projectTrashFailedNoTrash', 'in-use': 'projectTrashFailedInUse', unknown: 'projectTrashFailedUnknown' }
const PROJECT_NAME = 'demo'
// 确认框正文一行放得下多少个汉字：正文宽约 348px、12px 字（真机截图量过）≈ 29 个，留 3 个字的余量。
const CONFIRM_LINE_CHARS = 26

const studio = (locale) => resources[locale].translation.studio
const fill = (template, values) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, value), template)
const binOf = (locale, platform) => studio(locale)[BIN_KEY[platform]]

/** 和应用同一份初始化选项的翻译函数（src/i18n/index.ts）：真词典、真插值，不是回显键的假 t。 */
function translator(locale) {
  const instance = i18next.createInstance()
  instance.init({ resources, lng: locale, fallbackLng: 'zh-CN', interpolation: { escapeValue: false }, returnNull: false, initAsync: false })
  return instance.getFixedT(locale)
}

const everyLocalePlatform = LOCALES.flatMap((locale) => PLATFORMS.map((platform) => [locale, platform]))

describe('项目库删除 · 板上写的文案 = 产品词典', () => {
  it('board:Library/library.card.delete：板上写的删除钮名字（中英）就是词典里的那句', () => {
    const { buttonName } = element('library.card.delete').copy
    for (const locale of LOCALES) expect(buttonName[locale]).toBe(resources[locale].translation.library.deleteNamedProject)
  })

  it('board:Library/library.delete.confirm：板上的确认框标题、正文、三个平台的回收站叫法（中英）就是词典里的', () => {
    const { title, message, bin } = element('library.delete.confirm').copy
    for (const locale of LOCALES) {
      expect(title[locale]).toBe(studio(locale).deleteProjectTitle)
      expect(message[locale]).toBe(studio(locale).deleteProjectMessage)
      for (const platform of PLATFORMS) expect(bin[platform][locale]).toBe(binOf(locale, platform))
    }
  })

  // 项目名是用户起的、长度不定，它在哪里折行没法预料；回收站叫法若和名字挤在同一行，就可能落在行尾被拆开
  // （2026-10-24 验收：「…会移到废纸 / 篓」）。所以中文正文用换行分行，叫法单独在不含项目名的一行里，
  // 且这一行连叫法在内放得进确认框一行（确认框 white-space: pre-line 会照排换行）。
  it('board:Library/library.delete.confirm：中文正文把回收站叫法放在不含项目名的一行里，这一行放得进确认框一行——叫法不会被折行拆成「废纸 / 篓」', () => {
    const binLines = studio('zh-CN').deleteProjectMessage.split('\n').filter((line) => line.includes('{{bin}}'))
    expect(binLines).toHaveLength(1)
    expect(binLines[0]).not.toContain('{{name}}')
    const longestBin = Math.max(...PLATFORMS.map((platform) => binOf('zh-CN', platform).length))
    expect(binLines[0].replaceAll('{{bin}}', '字'.repeat(longestBin)).length).toBeLessThanOrEqual(CONFIRM_LINE_CHARS)
  })

  it('board:Library/library.delete.moved：板上的删除成功提示（中英）就是词典里的那句', () => {
    const { message } = element('library.delete.moved').copy
    for (const locale of LOCALES) expect(message[locale]).toBe(studio(locale).projectMovedToTrash)
  })

  it('board:Library/library.delete.removedOnly：板上写的「没有东西进回收站」提示（中英）就是词典里的那句', () => {
    const { message } = element('library.delete.removedOnly').copy
    for (const locale of LOCALES) expect(message[locale]).toBe(studio(locale).projectRemovedWithoutTrash)
  })

  it('board:Library/library.delete.failed：板上写全了每一类失败原因（中英），都是词典里的那句；新增一类原因没写进板就红', () => {
    const { copy } = element('library.delete.failed')
    expect(Object.keys(copy).sort()).toEqual([...PROJECT_TRASH_FAILURE_REASONS].sort())
    expect(Object.keys(FAILURE_KEY).sort()).toEqual([...PROJECT_TRASH_FAILURE_REASONS].sort())
    for (const reason of PROJECT_TRASH_FAILURE_REASONS) {
      for (const locale of LOCALES) expect(copy[reason][locale]).toBe(studio(locale)[FAILURE_KEY[reason]])
    }
  })
})

describe('项目库删除 · 流程真交给界面的那句 = 词典填上名字和这个平台的回收站叫法', () => {
  it.each(everyLocalePlatform)('board:Library/library.delete.confirm：确认框（%s · %s）', async (locale, platform) => {
    const asked = []
    await runProjectDeleteFlow(
      { id: 'p1', name: PROJECT_NAME, source: 'native' },
      {
        t: translator(locale),
        platform,
        confirm: async (options) => { asked.push(options); return true },
        isActive: () => false,
        releaseActive: async () => undefined,
        leaveToLibrary: () => undefined,
        deleteLocalProject: async () => ({ deleted: true }),
        onMovedToTrash: () => undefined,
        onRemovedWithoutTrash: () => undefined,
        onFailed: () => undefined,
      },
    )
    expect(asked).toHaveLength(1)
    expect(asked[0].title).toBe(studio(locale).deleteProjectTitle)
    expect(asked[0].message).toBe(fill(element('library.delete.confirm').copy.message[locale], { name: PROJECT_NAME, bin: binOf(locale, platform) }))
  })

  it.each(everyLocalePlatform)('board:Library/library.delete.moved：删完的提示（%s · %s）', async (locale, platform) => {
    const moved = []
    await runProjectDeleteFlow(
      { id: 'p1', name: PROJECT_NAME, source: 'native' },
      {
        t: translator(locale),
        platform,
        confirm: async () => true,
        isActive: () => false,
        releaseActive: async () => undefined,
        leaveToLibrary: () => undefined,
        deleteLocalProject: async () => ({ deleted: true }),
        onMovedToTrash: (message) => moved.push(message),
        onRemovedWithoutTrash: () => undefined,
        onFailed: () => undefined,
      },
    )
    expect(moved).toEqual([fill(element('library.delete.moved').copy.message[locale], { name: PROJECT_NAME, bin: binOf(locale, platform) })])
  })

  // V-library-trash 建议 2：主进程说没把文件夹移进回收站（deleted:false：文件夹已被挪走、库页没刷新）时，界面说的是这一句，
  // 不是「已移到回收站」。
  it.each(everyLocalePlatform)('board:Library/library.delete.removedOnly：主进程说没移进回收站时的提示（%s · %s）', async (locale, platform) => {
    const moved = []
    const removedOnly = []
    await runProjectDeleteFlow(
      { id: 'p1', name: PROJECT_NAME, source: 'native' },
      {
        t: translator(locale),
        platform,
        confirm: async () => true,
        isActive: () => false,
        releaseActive: async () => undefined,
        leaveToLibrary: () => undefined,
        deleteLocalProject: async () => ({ deleted: false }),
        onMovedToTrash: (message) => moved.push(message),
        onRemovedWithoutTrash: (message) => removedOnly.push(message),
        onFailed: () => undefined,
      },
    )
    expect(moved).toEqual([])
    expect(removedOnly).toEqual([fill(element('library.delete.removedOnly').copy.message[locale], { name: PROJECT_NAME, bin: binOf(locale, platform) })])
  })

  it.each(everyLocalePlatform.flatMap(([locale, platform]) => PROJECT_TRASH_FAILURE_REASONS.map((reason) => [locale, platform, reason])))(
    'board:Library/library.delete.failed：进不了回收站的提示（%s · %s · %s）',
    (locale, platform, reason) => {
      // 经 IPC 回到渲染层的错误只剩信息文本（名字和原因写在开头）：用真实的信息文本拼，不手写字符串。
      const error = new Error(`Error: ${projectTrashFailedMessage(reason, 'x')}`)
      const text = projectOperationFailureText('delete', error, translator(locale), { trashBin: binOf(locale, platform) })
      expect(text).toBe(fill(element('library.delete.failed').copy[reason][locale], { bin: binOf(locale, platform) }))
    },
  )
})
