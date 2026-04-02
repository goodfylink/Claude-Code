import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'

export async function isKairosEnabled(): Promise<boolean> {
  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_ASSISTANT)) {
    return true
  }

  if (getSettings_DEPRECATED()?.assistant === true) {
    return true
  }

  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos', false)
}
