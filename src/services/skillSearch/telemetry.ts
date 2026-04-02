import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from '../analytics/index.js'

export function logSkillSearchEvent(
  eventType: string,
  metadata: Record<string, boolean | number | undefined> = {},
) {
  logEvent('tengu_skill_search_event', {
    event_type:
      eventType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...metadata,
  })
}

export function logRemoteSkillLoaded({
  slug,
  cacheHit,
  latencyMs,
  urlScheme,
  fileCount,
  totalBytes,
  fetchMethod,
  error,
}: {
  slug: string
  cacheHit: boolean
  latencyMs: number
  urlScheme: 'gs' | 'http' | 'https' | 's3'
  fileCount?: number
  totalBytes?: number
  fetchMethod?: string
  error?: string
}) {
  logEvent('tengu_remote_skill_loaded', {
    cache_hit: cacheHit,
    latency_ms: latencyMs,
    file_count: fileCount,
    total_bytes: totalBytes,
    has_error: Boolean(error),
    slug_length: slug.length,
    url_scheme_length: urlScheme.length,
    fetch_method_length: fetchMethod?.length,
  })
}
