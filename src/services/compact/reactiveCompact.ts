import { isEnvTruthy } from '../../utils/envUtils.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import { compactConversation, type CompactionResult } from './compact.js'
import { runPostCompactCleanup } from './postCompactCleanup.js'
import { setLastSummarizedMessageId } from '../SessionMemory/sessionMemoryUtils.js'
import { suppressCompactWarning } from './compactWarningState.js'
import { getUserContext } from '../../context.js'
import { isPromptTooLongMessage } from '../api/errors.js'
import { logForDebugging } from '../../utils/debug.js'
import type { QuerySource } from '../../constants/querySource.js'

type AnyAssistantMessage = {
  type?: string
  message?: { content?: unknown }
  content?: unknown
}

type ReactiveTrigger = 'auto' | 'manual'

type ReactiveOutcome =
  | { ok: true; result: CompactionResult }
  | {
      ok: false
      reason:
        | 'too_few_groups'
        | 'aborted'
        | 'exhausted'
        | 'error'
        | 'media_unstrippable'
    }

function extractErrorText(message: AnyAssistantMessage): string {
  if (message?.type === 'system' && typeof message.content === 'string') {
    return message.content
  }

  const content = message?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (block && typeof block === 'object' && 'text' in block) {
          return typeof block.text === 'string' ? block.text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export function isReactiveCompactEnabled(): boolean {
  if (process.env.CLAUDE_CODE_REACTIVE_COMPACT === '0') return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_REACTIVE_COMPACT)) return true
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_raccoon', false)
}

export function isReactiveOnlyMode(): boolean {
  return isReactiveCompactEnabled()
}

export function isWithheldPromptTooLong(message: AnyAssistantMessage): boolean {
  return isReactiveCompactEnabled() && isPromptTooLongMessage(message as never)
}

export function isWithheldMediaSizeError(message: AnyAssistantMessage): boolean {
  if (!isReactiveCompactEnabled()) return false
  const lower = extractErrorText(message).toLowerCase()
  return (
    lower.includes('image was too large') ||
    lower.includes('image file is empty') ||
    lower.includes('image too large') ||
    lower.includes('document too large') ||
    lower.includes('failed to resize image')
  )
}

async function compactReactively(
  messages: any[],
  cacheSafeParams: CacheSafeParams,
  customInstructions?: string,
): Promise<ReactiveOutcome> {
  try {
    if (cacheSafeParams.toolUseContext.abortController.signal.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    if (messages.length < 4) {
      return { ok: false, reason: 'too_few_groups' }
    }

    const result = await compactConversation(
      messages,
      cacheSafeParams.toolUseContext,
      cacheSafeParams,
      true,
      customInstructions,
      true,
    )

    setLastSummarizedMessageId(undefined)
    runPostCompactCleanup(cacheSafeParams.toolUseContext.options.querySource)
    suppressCompactWarning()
    getUserContext.cache.clear?.()

    return { ok: true, result }
  } catch (error) {
    logForDebugging(
      `[reactive-compact] recovery failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    if (cacheSafeParams.toolUseContext.abortController.signal.aborted) {
      return { ok: false, reason: 'aborted' }
    }
    return { ok: false, reason: 'error' }
  }
}

export async function reactiveCompactOnPromptTooLong(
  messages: any[],
  cacheSafeParams: CacheSafeParams,
  options?: {
    customInstructions?: string
    trigger?: ReactiveTrigger
  },
): Promise<ReactiveOutcome> {
  if (!isReactiveCompactEnabled()) {
    return { ok: false, reason: 'exhausted' }
  }

  logForDebugging(
    `[reactive-compact] starting ${options?.trigger ?? 'auto'} recovery`,
  )

  return compactReactively(
    messages,
    cacheSafeParams,
    options?.customInstructions,
  )
}

export async function tryReactiveCompact(params: {
  hasAttempted: boolean
  querySource?: QuerySource
  aborted: boolean
  messages: any[]
  cacheSafeParams: CacheSafeParams
}): Promise<CompactionResult | null> {
  if (!isReactiveCompactEnabled() || params.hasAttempted || params.aborted) {
    return null
  }

  const outcome = await reactiveCompactOnPromptTooLong(
    params.messages,
    params.cacheSafeParams,
    { trigger: 'auto' },
  )
  return outcome.ok ? outcome.result : null
}
