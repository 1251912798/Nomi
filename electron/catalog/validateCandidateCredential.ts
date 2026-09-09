import { readCatalog, normalizeProviderKind } from './catalogStore'
import type { Vendor } from './types'
import { authHeaders, authQueryParams } from '../ai/requestPipeline'
import { fetchModelList, readExtraHeaders } from '../ai/onboarding/modelListProbe'
import { isJsonRecord, mergeHeadersCaseInsensitive } from '../jsonUtils'
import { desktopT } from '../i18n'
import { providerProxyUrl } from '../providerNetwork'

/** Probe the candidate without publishing it or invalidating the current connection. */
export async function validateCandidateCredential(vendor: Vendor, apiKey: string): Promise<void> {
  if (!apiKey || !vendor.baseUrlHint || vendor.authType === 'none') {
    throw new Error(desktopT('credential.validationUnavailable'))
  }
  const providerKind = normalizeProviderKind(vendor.providerKind)
  const authType = vendor.authType || (providerKind === 'anthropic' ? 'x-api-key' : 'bearer')
  const headers = mergeHeadersCaseInsensitive(
    providerKind === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {},
    readExtraHeaders(isJsonRecord(vendor.meta) ? vendor.meta.extraHeaders : undefined),
    authHeaders(authType, apiKey, vendor.authHeader ?? undefined),
  )
  const result = await fetchModelList(providerKind, vendor.baseUrlHint, headers, AbortSignal.timeout(12_000), {
    query: authQueryParams(authType, apiKey, vendor.authQueryParam ?? undefined),
    proxyUrl: providerProxyUrl(vendor),
  })
  if (!result.ok) throw new Error(desktopT(result.failureKind === 'auth' ? 'credential.invalid' : 'credential.validationUnavailable'))
}

export function candidateCredentialSnapshot(vendorKey: string): string {
  const state = readCatalog()
  return JSON.stringify({ vendor: state.vendors.find((vendor) => vendor.key === vendorKey), key: state.apiKeysByVendor[vendorKey] })
}
