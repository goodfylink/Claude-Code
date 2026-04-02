import { isEnvTruthy } from '../utils/envUtils.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { setCliTeammateModeOverride } from '../utils/swarm/backends/teammateModeSnapshot.js'

let assistantForced = false

function getAssistantSettingEnabled(): boolean {
  return getSettings_DEPRECATED()?.assistant === true
}

export function markAssistantForced(): void {
  assistantForced = true
}

export function isAssistantForced(): boolean {
  return assistantForced
}

export function isAssistantMode(): boolean {
  return (
    assistantForced ||
    getAssistantSettingEnabled() ||
    isEnvTruthy(process.env.CLAUDE_CODE_ASSISTANT) ||
    process.argv.includes('--assistant') ||
    process.argv.slice(2).includes('assistant')
  )
}

export async function initializeAssistantTeam(): Promise<undefined> {
  // Match the original startup ordering expectation in main.tsx: when
  // assistant mode is active, in-process teammates should be preferred.
  setCliTeammateModeOverride('in-process')
  return undefined
}

export function getAssistantSystemPromptAddendum(): string {
  return [
    '# Assistant Mode',
    '',
    'You are operating in assistant mode.',
    'Prefer concise status updates and keep the session moving without repeatedly asking for confirmation.',
    'When you make progress, summarize the outcome before switching tasks.',
  ].join('\n')
}

export function getAssistantActivationPath():
  | 'forced'
  | 'settings'
  | 'env'
  | 'flag'
  | 'command'
  | 'inactive' {
  if (assistantForced) return 'forced'
  if (getAssistantSettingEnabled()) return 'settings'
  if (isEnvTruthy(process.env.CLAUDE_CODE_ASSISTANT)) return 'env'
  if (process.argv.includes('--assistant')) return 'flag'
  if (process.argv.slice(2).includes('assistant')) return 'command'
  return 'inactive'
}

export async function startAssistantMode(): Promise<void> {
  markAssistantForced()
}
