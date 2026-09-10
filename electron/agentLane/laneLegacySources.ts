// Pure legacy container decoding shared by L2 replay and stage-4 migration.
// Decoding is NOT integrity validation or permission to import: retain the raw
// envelope/binding for the migration boundary's checksum and ownership checks.
export type LegacySourceKind = 'pi-snapshot' | 'agent-chat-v2' | 'host-snapshot'
export type LegacyFormat = 'pi' | 'ai-sdk' | 'host' | 'unknown'
export interface LegacyItem {
  readonly sourceIndex: number
  readonly raw: unknown
}
export interface LegacyConversation {
  readonly key: string
  readonly format: LegacyFormat
  readonly state: 'ready' | 'cleared' | 'empty' | 'unsupported'
  readonly items: readonly LegacyItem[]
  /** Original record/envelope, including settings, binding and native leaf. */
  readonly raw: unknown
  readonly threadId?: string
  readonly sessionKey?: string
}
export interface LegacySource {
  readonly kind: LegacySourceKind
  readonly status: 'decoded' | 'invalid' | 'unsupported'
  readonly raw: unknown
  readonly conversations: readonly LegacyConversation[]
  /** Stable classification only; never put raw bytes or parser errors in logs. */
  readonly reason?: string
}

export function legacyRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function itemsOf(value: readonly unknown[]): LegacyItem[] {
  return value.map((raw, sourceIndex) => ({ sourceIndex, raw }))
}
function conversation(key: string, format: LegacyFormat, items: readonly unknown[], raw: unknown): LegacyConversation {
  return { key, format, state: items.length ? 'ready' : 'empty', items: itemsOf(items), raw }
}

function sessionsOf(raw: Record<string, unknown>): LegacyConversation[] | undefined {
  const sessions = legacyRecord(raw.sessions)
  if (!sessions || Object.values(sessions).some(value => !Array.isArray(value))) return undefined
  return Object.entries(sessions).map(([key, items]) => ({
    ...conversation(key, 'ai-sdk', items as unknown[], raw), sessionKey: key,
  }))
}

function piOf(raw: Record<string, unknown>, key: string): LegacyConversation | undefined {
  const data = legacyRecord(raw.data)
  if (raw.format !== 'nomi.pi-work-context' || !Array.isArray(data?.entries)) return undefined
  // Keep all entries, including inactive branches, settings, pending and unknown
  // entries. The importer decides which are messages and which are archive-only.
  return conversation(key, 'pi', data.entries, raw)
}

function contextOf(raw: Record<string, unknown>): LegacyConversation[] | undefined {
  const direct = piOf(raw, 'pi')
  if (direct) return [direct]
  if (raw.version === 2) return sessionsOf(raw)
  const records = legacyRecord(raw.records)
  if (!records || (raw.version !== 3 && raw.version !== 4)) return undefined
  const conversations: LegacyConversation[] = []
  for (const [key, value] of Object.entries(records)) {
    const record = legacyRecord(value)
    if (!record) return undefined
    if (raw.version === 3) {
      conversations.push({ ...conversation(key, 'unknown', [value], value), state: 'unsupported' })
      continue
    }
    if (record.state !== 'cleared' && record.state !== 'ready') return undefined
    if (record.state === 'cleared' && record.snapshot !== undefined) return undefined
    let decoded: LegacyConversation
    if (record.snapshot === undefined) decoded = conversation(key, 'pi', [], value)
    else {
      if (typeof record.snapshot !== 'string' || !record.snapshot) return undefined
      const envelope = legacyRecord(JSON.parse(record.snapshot))
      const pi = envelope && piOf(envelope, key)
      if (!pi) return undefined
      decoded = { ...pi, raw: value }
    }
    conversations.push({
      ...decoded,
      ...(record.state === 'cleared' ? { state: 'cleared' as const } : {}),
      ...(typeof record.threadId === 'string' ? { threadId: record.threadId } : {}),
      ...(typeof record.sessionKey === 'string' ? { sessionKey: record.sessionKey } : {}),
    })
  }
  return conversations
}

function hostOf(raw: Record<string, unknown>): LegacyConversation[] | undefined {
  const state = legacyRecord(raw.state)
  if (!Array.isArray(state?.items)) return undefined
  const groups = new Map<string | undefined, LegacyItem[]>()
  // Preserve empty threads, too. Missing thread ids remain explicitly unbound;
  // never guess a thread from timestamps or merge unrelated thread histories.
  if (Array.isArray(state.threads)) for (const value of state.threads) {
    const thread = legacyRecord(value)
    if (typeof thread?.threadId === 'string') groups.set(thread.threadId, [])
  }
  for (const [sourceIndex, value] of state.items.entries()) {
    const item = legacyRecord(value)
    const threadId = typeof item?.threadId === 'string' ? item.threadId : undefined
    const group = groups.get(threadId) ?? []
    group.push({ sourceIndex, raw: value })
    groups.set(threadId, group)
  }
  return [...groups].map(([threadId, items]) => ({
    key: threadId === undefined ? 'host-unbound' : `host:${threadId}`,
    format: 'host', state: items.length ? 'ready' : 'empty', items, raw,
    ...(threadId === undefined ? {} : { threadId }),
  }))
}

/** Retains every JSON field and every array member, including null/unknown items. */
export function parseLegacySource(kind: LegacySourceKind, bytes: Uint8Array | string): LegacySource {
  let raw: unknown
  try {
    raw = JSON.parse(typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    const record = legacyRecord(raw)
    if (!record) return { kind, status: 'invalid', raw, conversations: [], reason: 'invalid-container' }
    const conversations = kind === 'pi-snapshot' ? contextOf(record)
      : kind === 'agent-chat-v2' ? sessionsOf(record) : hostOf(record)
    if (!conversations) return { kind, status: 'unsupported', raw, conversations: [], reason: 'unsupported-container' }
    return { kind, status: 'decoded', raw, conversations }
  } catch {
    return { kind, status: 'invalid', raw, conversations: [], reason: 'invalid-json-or-encoding' }
  }
}
