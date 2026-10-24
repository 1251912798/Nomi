function canonicalEvidenceUrl(value) {
  const url = new URL(String(value))
  url.search = ''
  return url.href
}

function redactSecrets(value) {
  return String(value)
    .replace(/Bearer\s+[^\s"'\\]+/gi, 'Bearer <redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
}

function redactUrlQueries(value) {
  return String(value).replace(/(https?:\/\/[^\r\n"']*?)\?[^\s"']*/gi, '$1?<redacted>')
}

function scrubString(value) {
  return redactSecrets(redactUrlQueries(value))
}

function scrubValue(value) {
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return value.map(scrubValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubValue(item)]))
  return value
}

function scrubText(text) {
  const raw = String(text)
  try {
    return JSON.stringify(scrubValue(JSON.parse(raw)))
  } catch {
    return scrubString(raw)
  }
}

module.exports = { canonicalEvidenceUrl, scrubText }
