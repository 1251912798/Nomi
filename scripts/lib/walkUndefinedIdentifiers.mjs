// 走查脚本里「引用了没定义的标识符」的判定（check-walkthroughs.mjs 的 undefined-identifier 门岗）。
//
// 为什么要这条规则（2026-10-15 夜跑分诊 I05）：eslint.config.mjs 把 tests/ux/** 整个 ignore，走查目录没有任何 no-undef，
// 漏 import / 漏声明的标识符只能等跑到那一行才炸——clip-drop-zoom / clip-gesture-ownership 漏了 `canvasSetZoomPercent` 的导入、
// skill-library-specimen 用了没声明的 `win`，夜跑里整条 0/3 红，且这类红和「外壳改了」的红混在一起，没人一眼看出是仪器自己的洞。
//
// 做法：用 ESLint 自带的 Linter 只开 no-undef（不引入第二套规则，也不动全局 ignore——走查目录的其它 lint 风格不在本门岗范围）。
// 全局表：Node 全局 + 浏览器全局**都给**——走查里 page.evaluate 的回调体是页内代码，document / window 在那里合法
// （同 eslint.config.mjs 对 tests/perf 的做法）。代价是「在 Node 侧误用 document」这类写法抓不到；它们跑起来立刻炸，不是漏 import 这一族。
// 走查把页内代码写成字符串（`page.evaluate('...')`）的，本规则看不见字符串里面——那是已知边界，不假装覆盖。
import { Linter } from 'eslint'
import globals from 'globals'

const linter = new Linter({ configType: 'flat' })

function configFor(isCommonJs) {
  return [{
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: isCommonJs ? 'commonjs' : 'module',
      globals: { ...globals.node, ...globals.browser, ...(isCommonJs ? globals.commonjs : {}) },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'no-undef': 'error' },
  }]
}

/**
 * @param {string} source 走查源码（原文，不要剥注释：eslint 自己会处理）
 * @param {string} filename 只用来判 .cjs / .mjs
 * @returns {{ line: number, name: string, text: string }[]}
 */
export function findUndefinedIdentifiers(source, filename = 'walk.mjs') {
  const messages = linter.verify(source, configFor(filename.endsWith('.cjs')), { filename })
  const hits = []
  for (const message of messages) {
    if (message.ruleId === 'no-undef') {
      const name = /'([^']+)' is not defined/.exec(message.message)?.[1] ?? '?'
      hits.push({ line: message.line, name, text: message.message })
    } else if (message.fatal) {
      // 语法错误：check:mjs-parse 也会报，这里同样不放过（解析不了就等于没查）。
      hits.push({ line: message.line ?? 0, name: 'parse-error', text: message.message })
    }
  }
  return hits
}
