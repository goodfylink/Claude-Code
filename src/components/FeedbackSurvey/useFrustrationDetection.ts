import { useCallback, useEffect, useRef, useState } from 'react'
import { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js'
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import type { Message } from '../../types/message.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { extractTextContent } from '../../utils/messages.js'
import { matchesNegativeKeyword } from '../../utils/userPromptKeywords.js'
import { logOTelEvent } from '../../utils/telemetry/events.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { submitTranscriptShare } from './submitTranscriptShare.js'
import type { TranscriptShareResponse } from './TranscriptSharePrompt.js'

type FrustrationSurveyState =
  | 'closed'
  | 'transcript_prompt'
  | 'submitting'
  | 'submitted'
  | 'thanks'

const HIDE_AFTER_MS = 3000
const FRUSTRATION_PATTERNS = [
  /\b(not working|doesn'?t work|still broken|completely broken)\b/i,
  /\b(give up|this sucks|so frustrating|wtf|wth|ffs)\b/i,
  /\b(useless|broken|annoying|terrible|awful)\b/i,
]

function getLastUserMessage(messages: Message[]): any | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as any
    if (message?.type === 'user' && message.isMeta !== true) {
      return message
    }
  }

  return undefined
}

function getMessageText(message: any): string {
  const content = message?.message?.content ?? message?.content
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return extractTextContent(content, '\n').trim()
  }
  return ''
}

function isFrustratedInput(text: string): boolean {
  if (text.length === 0) {
    return false
  }

  if (matchesNegativeKeyword(text)) {
    return true
  }

  return FRUSTRATION_PATTERNS.some(pattern => pattern.test(text))
}

export function useFrustrationDetection(
  messages: Message[],
  isLoading: boolean,
  hasActivePrompt = false,
  otherSurveyVisible = false,
): {
  state: FrustrationSurveyState
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void
} {
  const [state, setState] = useState<FrustrationSurveyState>('closed')
  const seenUserUuids = useRef(new Set<string>())
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const closeLater = useCallback((nextState: 'thanks' | 'submitted') => {
    setState(nextState)
    setTimeout(setState, HIDE_AFTER_MS, 'closed')
  }, [])

  const handleTranscriptSelect = useCallback(
    (selected: TranscriptShareResponse) => {
      const appearanceId = 'frustration'
      logEvent('tengu_feedback_survey_event', {
        event_type:
          `frustration_transcript_share_${selected}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      if (selected === 'dont_ask_again') {
        saveGlobalConfig(current => ({
          ...current,
          transcriptShareDismissed: true,
        }))
      }

      if (selected !== 'yes') {
        closeLater('thanks')
        return
      }

      setState('submitting')
      void (async () => {
        try {
          const result = await submitTranscriptShare(
            messagesRef.current,
            'frustration',
            appearanceId,
          )
          closeLater(result.success ? 'submitted' : 'thanks')
        } catch {
          closeLater('thanks')
        }
      })()
    },
    [closeLater],
  )

  useEffect(() => {
    if (state !== 'closed' || isLoading || hasActivePrompt || otherSurveyVisible) {
      return
    }
    if (isFeedbackSurveyDisabled()) {
      return
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return
    }
    if (!isPolicyAllowed('allow_product_feedback')) {
      return
    }
    if (getGlobalConfig().transcriptShareDismissed) {
      return
    }

    const lastUserMessage = getLastUserMessage(messages)
    if (!lastUserMessage || seenUserUuids.current.has(lastUserMessage.uuid)) {
      return
    }

    seenUserUuids.current.add(lastUserMessage.uuid)
    const text = getMessageText(lastUserMessage)
    if (!isFrustratedInput(text)) {
      return
    }

    logEvent('tengu_feedback_survey_event', {
      event_type:
        'frustration_transcript_prompt_appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'transcript_prompt_appeared',
      survey_type: 'frustration',
      appearance_id: 'frustration',
    })
    setState('transcript_prompt')
  }, [messages, state, isLoading, hasActivePrompt, otherSurveyVisible])

  return {
    state,
    handleTranscriptSelect,
  }
}
