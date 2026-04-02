import uniqBy from 'lodash-es/uniqBy.js'
import type { ToolUseContext } from '../../Tool.js'
import { extractTextContent } from '../../utils/messages.js'
import type { Message } from '../../types/message.js'
import { isSkillSearchEnabled } from './featureCheck.js'
import { searchLocalSkills } from './localSearch.js'
import { loadRemoteSkills } from './remoteSkillLoader.js'
import type { DiscoverySignal } from './signals.js'

type SkillAttachment = {
  type: 'skill_discovery'
  skills: { name: string; description: string; shortId?: string }[]
  signal: DiscoverySignal
  source: 'native' | 'aki' | 'both'
}

type DiscoveryCandidate = {
  name: string
  description: string
  source: 'native' | 'aki'
  shortId?: string
  score: number
}

type DiscoveryBatch = {
  skills: DiscoveryCandidate[]
  settledAt: number
}

export type PendingSkillDiscoveryPrefetch = {
  context: ToolUseContext
  promise: Promise<DiscoveryBatch>
  settledAt: number | null
}

const emittedQueryByThread = new Map<string, string>()

function getThreadKey(context: ToolUseContext): string {
  return context.agentId ?? 'main'
}

function normalizeQuery(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase()
}

function getLastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as any
    if (!message || message.type !== 'user' || message.isMeta === true) {
      continue
    }

    const content = message.message?.content ?? message.content
    if (typeof content === 'string' && content.trim().length > 0) {
      return content
    }
    if (Array.isArray(content)) {
      const text = extractTextContent(content, '\n').trim()
      if (text.length > 0) {
        return text
      }
    }
  }

  return ''
}

function mergeCandidates(
  localCandidates: Awaited<ReturnType<typeof searchLocalSkills>>,
  remoteCandidates: Awaited<ReturnType<typeof loadRemoteSkills>>,
): DiscoveryCandidate[] {
  const merged = [
    ...localCandidates.map(candidate => ({
      name: candidate.name,
      description: candidate.description,
      score: candidate.score,
      source: 'native' as const,
    })),
    ...remoteCandidates.map(candidate => ({
      name: candidate.name,
      description: candidate.description,
      shortId: candidate.shortId,
      score: 10,
      source: 'aki' as const,
    })),
  ]

  return uniqBy(
    merged.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    candidate => candidate.name,
  )
}

function buildAttachment(
  skills: DiscoveryCandidate[],
  signal: DiscoverySignal,
  context: ToolUseContext,
): SkillAttachment[] {
  if (skills.length === 0) {
    return []
  }

  const surfacedSkills = skills.slice(0, 5)
  for (const skill of surfacedSkills) {
    context.discoveredSkillNames?.add(skill.name)
  }

  const hasNative = surfacedSkills.some(skill => skill.source === 'native')
  const hasRemote = surfacedSkills.some(skill => skill.source === 'aki')
  const source =
    hasNative && hasRemote ? 'both' : hasRemote ? 'aki' : 'native'

  return [
    {
      type: 'skill_discovery',
      skills: surfacedSkills.map(skill => ({
        name: skill.name,
        description: skill.description,
        shortId: skill.shortId,
      })),
      signal,
      source,
    },
  ]
}

async function discoverSkills(
  query: string,
  context: ToolUseContext,
): Promise<DiscoveryCandidate[]> {
  const [localCandidates, remoteCandidates] = await Promise.all([
    searchLocalSkills(query, context),
    loadRemoteSkills(query),
  ])

  return mergeCandidates(localCandidates, remoteCandidates).filter(
    candidate => !context.discoveredSkillNames?.has(candidate.name),
  )
}

export async function getTurnZeroSkillDiscovery(
  input: string,
  _messages: Message[],
  context: ToolUseContext,
): Promise<SkillAttachment[]> {
  if (!isSkillSearchEnabled()) {
    return []
  }

  const query = normalizeQuery(input)
  if (query.length === 0) {
    return []
  }

  const skills = await discoverSkills(query, context)
  emittedQueryByThread.set(getThreadKey(context), query)
  return buildAttachment(skills, 'turn_zero_input', context)
}

export function startSkillDiscoveryPrefetch(
  input: string | null,
  messages: Message[],
  context: ToolUseContext,
): PendingSkillDiscoveryPrefetch | null {
  if (!isSkillSearchEnabled()) {
    return null
  }

  const query = normalizeQuery(input ?? getLastUserText(messages))
  if (query.length === 0) {
    return null
  }

  const threadKey = getThreadKey(context)
  if (emittedQueryByThread.get(threadKey) === query) {
    return null
  }

  const pending: PendingSkillDiscoveryPrefetch = {
    context,
    settledAt: null,
    promise: Promise.resolve()
      .then(async () => ({
        skills: await discoverSkills(query, context),
        settledAt: Date.now(),
      }))
      .then(result => {
        pending.settledAt = result.settledAt
        return result
      }),
  }

  emittedQueryByThread.set(threadKey, query)
  return pending
}

export async function collectSkillDiscoveryPrefetch(
  pending: PendingSkillDiscoveryPrefetch,
): Promise<SkillAttachment[]> {
  const waitStartedAt = Date.now()
  const result = await pending.promise
  const signal: DiscoverySignal =
    pending.settledAt !== null && pending.settledAt < waitStartedAt
      ? 'hidden_by_main_turn'
      : pending.context.agentId
        ? 'subagent_spawn'
        : 'assistant_turn'

  return buildAttachment(result.skills, signal, pending.context)
}

export async function prefetchSkillSearch(
  input: string,
  messages: Message[],
  context: ToolUseContext,
) {
  return getTurnZeroSkillDiscovery(input, messages, context)
}
