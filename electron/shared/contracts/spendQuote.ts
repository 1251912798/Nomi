export type SpendQuoteInput = {
  vendorKey: string
  modelKey: string
  parameters?: Record<string, unknown>
}

/** Amounts use the catalog's credit unit; null means unpriced, never free. */
export type SpendQuoteLine = { vendorKey: string; modelKey: string; amount: number | null }
export type SpendQuote = { lines: SpendQuoteLine[]; amount: number | null }
export type PreparedSpendQuote = SpendQuote & { quoteId: string }
