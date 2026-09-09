type LocalizationStart = { projectId: string; nodeId: string }

/** A run listens only for its own import; cleanup also runs on cancel/error. */
export async function withAssetLocalizationFeedback<T>(options: {
  projectId: string | null
  nodeId: string
  subscribe?: (listener: (event: LocalizationStart) => void) => () => void
  report: () => void
}, run: () => Promise<T>): Promise<T> {
  const detach = options.subscribe?.((event) => {
    if (event.projectId === options.projectId && event.nodeId === options.nodeId) options.report()
  })
  try { return await run() } finally { detach?.() }
}
