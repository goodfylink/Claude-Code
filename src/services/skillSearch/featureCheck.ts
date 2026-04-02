import { isEnvTruthy } from '../../utils/envUtils.js'

export function isSkillSearchEnabled() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_SKILL_SEARCH)) {
    return false
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_SKILL_SEARCH)) {
    return true
  }

  return process.env.USER_TYPE === 'ant'
}

export function shouldShowSkillSearchUI() {
  return isSkillSearchEnabled()
}
