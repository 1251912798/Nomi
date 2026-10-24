const COMMENT = /^\s*(?:\/\/|\/\*|\*)/

function sourceLines(text) {
  return String(text).split(/\r?\n/).filter((line) => !COMMENT.test(line))
}

export function countTextWhiteInSource(text) {
  return sourceLines(text).reduce((count, line) => count + (line.match(/\btext-white\b/g)?.length ?? 0), 0)
}

/** 存量扫描：蓝色底配白字只允许保留在已登记的标签/徽标，防止主按钮回到实心蓝底。 */
export function countAccentWhitePrimaries(text) {
  return sourceLines(text).filter((line) => /\bbg-nomi-accent(?:\s|['"`])/.test(line) && /\btext-white\b/.test(line)).length
}
