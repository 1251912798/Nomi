import fs from 'node:fs'
export function hasCredential(record) {
  return record?.enabled !== false && record?.enc === 'safeStorage' && typeof record?.apiKey === 'string' && Boolean(record.apiKey.trim())
}
// This replaces the existing decrypt, not a second probe. The key stays in its original dispatch closure.
export function decryptForDispatch({ record, decrypt, credentialMarker }) {
  let key = '', reason = 'no-key'
  if (hasCredential(record)) {
    reason = 'keychain-denied'
    fs.writeFileSync(credentialMarker, JSON.stringify({ status: 'probing' }))
    try { key = decrypt(record) } catch { /* Only the safe reason crosses the process boundary. */ }
  }
  fs.writeFileSync(credentialMarker, JSON.stringify(key ? { status: 'ready' } : { status: 'blocked', reason }))
  if (!key) throw Error('CREDENTIAL_BLOCKED')
  return key
}
