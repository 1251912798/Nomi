// Display-only redaction. No transcript cache or browser storage.
const MAX_TEXT_LENGTH = 2_000

function trimDisplayText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : ''
}

/** Remove common credential forms before any display text crosses storage. */
export function redactResidentSensitiveText(value: string): string {
  return trimDisplayText(value)
    .replace(/\b(?:sk|rk|pk|key|token)-[A-Za-z0-9_-]{12,}\b/gi, '[redacted]')
    .replace(/\b(?:bearer)\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, 'Bearer [redacted]')
    .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password|authorization|lease(?:handle)?|credential)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
}

/** 值一旦挂在这些键下就不出现在展示里——名字命中即抹，不看值长什么样。 */
const SECRET_KEY_PATTERN = /(api[_-]?key|access[_-]?token|refresh[_-]?token|^key$|secret|password|passphrase|authorization|credential|lease(handle)?|cookie|session[_-]?id)/i

const MAX_ARG_STRING = 200

/** `/Users/x/Movies/a.mp4` → `…/a.mp4`：路径在收据里唯一的信息量是文件名。 */
function shortenPath(value: string): string {
  return value.replace(/(?:[A-Za-z]:)?[/\\](?:[^\s/\\:*?"<>|]+[/\\]){2,}([^\s/\\:*?"<>|]+)/g, '…/$1')
}

/**
 * 入参 → 一段可以给人看的 JSON。
 *
 * 短对象压成一行（`{ "scope": "timeline", "range": "all" }`，拍板基线里就是这个样子），
 * 长的保留缩进——340px 宽的一列里，一行 200 字的 JSON 和没有内容是一回事。
 */
export function redactToolArguments(args: unknown): string {
  if (args === undefined || args === null) return ''
  let text: string
  try {
    text = JSON.stringify(args, (key, value: unknown) => {
      if (SECRET_KEY_PATTERN.test(key)) return '[redacted]'
      if (typeof value === 'string') {
        const shortened = shortenPath(value)
        return shortened.length > MAX_ARG_STRING ? `${shortened.slice(0, MAX_ARG_STRING)}…` : shortened
      }
      return value
    }, 2) ?? ''
  } catch {
    // 循环引用 / BigInt：入参本来就不该长这样，但收据不能因此炸掉整条流。
    return ''
  }
  const collapsed = text.replace(/\s*\n\s*/g, ' ')
  return redactResidentSensitiveText(collapsed.length <= 72 ? collapsed : text)
}
