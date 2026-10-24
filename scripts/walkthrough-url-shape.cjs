function canonicalEvidenceUrl(value) {
  const url = new URL(String(value))
  url.search = ''
  return url.href
}

function redactUrlQuery(value) {
  const raw = String(value)
  try {
    const url = new URL(raw)
    if (!url.search) return raw
    url.search = ''
    return `${url.href}?<redacted>`
  } catch {
    return raw
  }
}

function redactSecrets(value) {
  return String(value)
    .replace(/Bearer\s+[^\s"'\\]+/gi, 'Bearer <redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
}

function scrubValue(value) {
  if (typeof value === 'string') {
    let scrubbed = value
    try {
      if (/^https?:/i.test(scrubbed)) scrubbed = redactUrlQuery(scrubbed)
    } catch {
      // Keep malformed text for the caller's existing fail-closed handling.
    }
    return redactSecrets(scrubbed)
  }
  if (Array.isArray(value)) return value.map(scrubValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubValue(item)]))
  return value
}

function scrubText(text) {
  const raw = String(text)
  try {
    return JSON.stringify(scrubValue(JSON.parse(raw)))
  } catch {
    return redactSecrets(raw)
  }
}

module.exports = { canonicalEvidenceUrl, scrubText }
