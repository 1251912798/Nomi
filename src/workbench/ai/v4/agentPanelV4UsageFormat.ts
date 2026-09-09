/** One compact scale for both context-window and cumulative-token figures. */
export function formatV4Tokens(value: number): string {
  const divisor = value >= 1_000_000 ? 1_000_000 : value >= 1_000 ? 1_000 : 1
  const suffix = divisor === 1_000_000 ? 'M' : divisor === 1_000 ? 'K' : ''
  return `${Number((value / divisor).toFixed(1))}${suffix}`
}
