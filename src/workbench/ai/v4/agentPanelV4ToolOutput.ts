/** Model tool outputs can be Markdown or a JSON result envelope. Preserve source
 * semantics before the view: only the declared text field is prose; remaining
 * structured fields stay technical data. No Markdown-marker sniffing. */
export function projectToolOutput(value: string): { markdown?: string; technical?: string } {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return { markdown: value } }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    if (typeof record.text === 'string') {
      const { text, ...metadata } = record
      return { markdown: text, ...(Object.keys(metadata).length ? { technical: JSON.stringify(metadata, null, 2) } : {}) }
    }
  }
  return { technical: value }
}
