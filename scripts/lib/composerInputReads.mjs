// 「走查把 Agent 输入框当 <input>/<textarea> 读」的判定逻辑（check-walkthroughs.mjs 的 composer-input-read 规则）。
//
// 为什么（2026-10-12，#1183 CI 红）：Agent 输入框换成了共享 PromptEditor（富文本，能在句中插参考缩略图），
// `[data-v4-control="input"]` 不再是 input / textarea。走查里 toHaveValue / inputValue 读它报 "Not an input element"，
// 十几处各读各的。读写文字的唯一出口是 tests/ux/agent-runtime-walk-support.mjs 的 composerText / expectComposerText；
// 输入框再换一次形态，只改那一处。
const BIND = /(?:const|let|var)\s+(\w+)\s*=\s*[^\n]*?(?:COMPOSER_INPUT|data-v4-control="input")/g
const READ = /\.(?:toHaveValue|inputValue)\s*\(/

/**
 * @param {string} code 走查源码（已剥注释）
 * @returns {{ line: number, text: string, use: string }[]}
 */
export function findComposerInputReads(code) {
  const names = new Set([...code.matchAll(BIND)].map((m) => m[1]))
  const hits = []
  const use = '改用 composerText() / expectComposerText()（agent-runtime-walk-support.mjs）'
  code.split('\n').forEach((line, index) => {
    const push = () => hits.push({ line: index + 1, text: line.trim().slice(0, 120), use })
    if (/textarea\[data-v4-control="input"\]/.test(line)) return push()
    if (!READ.test(line)) return
    if (/COMPOSER_INPUT|data-v4-control="input"/.test(line)) return push()
    for (const name of names) {
      if (new RegExp(String.raw`(?:expect\(\s*${name}\b|\b${name}\s*\.\s*inputValue)`).test(line)) return push()
    }
  })
  return hits
}
