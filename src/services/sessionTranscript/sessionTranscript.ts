import { type UUID } from 'crypto'
import { appendFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { getSessionId } from '../../bootstrap/state.js'
import { getAutoMemPath } from '../../memdir/paths.js'
import type { Message } from '../../types/message.js'
import { logError } from '../../utils/log.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const MAX_REDUCED_TEXT_CHARS = 8_000
const writtenEntryKeys = new Set<string>()
const pendingEntryKeys = new Set<string>()
let writeQueue: Promise<void> = Promise.resolve()

type ReducedTranscriptEntry = {
  type: 'assistant-session-transcript'
  sessionId: UUID
  messageUuid: string
  timestamp: string
  day: string
  role: 'user' | 'assistant' | 'system' | 'attachment'
  text: string
}

function getLocalISODateForTimestamp(timestamp: string): string | null {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTranscriptBucketPath(day: string): string {
  const [year, month] = day.split('-')
  return join(getAutoMemPath(), 'sessions', year!, month!, `${day}.jsonl`)
}

function normalizeText(text: string | null): string | null {
  if (!text) {
    return null
  }
  const collapsed = text.replace(/\r\n/g, '\n').trim()
  if (!collapsed) {
    return null
  }
  return collapsed.slice(0, MAX_REDUCED_TEXT_CHARS)
}

function extractContentText(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeText(value)
  }
  if (!Array.isArray(value)) {
    return null
  }

  const parts: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || !('type' in item)) {
      continue
    }
    if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
      parts.push(item.text)
      continue
    }
    if (
      item.type === 'thinking' &&
      'thinking' in item &&
      typeof item.thinking === 'string'
    ) {
      parts.push(item.thinking)
      continue
    }
    if (
      item.type === 'tool_use' &&
      'name' in item &&
      typeof item.name === 'string'
    ) {
      parts.push(`[tool_use:${item.name}]`)
      continue
    }
    if (item.type === 'tool_result' && 'content' in item) {
      const nested = extractContentText(item.content)
      if (nested) {
        parts.push(nested)
      }
    }
  }

  return normalizeText(parts.join('\n'))
}

function extractSystemText(message: Record<string, unknown>): string | null {
  if (typeof message.content === 'string') {
    return normalizeText(message.content)
  }
  if (message.type === 'system' && 'subtype' in message) {
    return normalizeText(`[system:${String(message.subtype)}]`)
  }
  return null
}

function extractAttachmentText(message: Record<string, unknown>): string | null {
  const attachment = message.attachment
  if (!attachment || typeof attachment !== 'object' || !('type' in attachment)) {
    return null
  }
  if (attachment.type === 'date_change' && 'newDate' in attachment) {
    return normalizeText(`Date changed to ${String(attachment.newDate)}`)
  }
  return null
}

function toReducedEntry(message: Message): ReducedTranscriptEntry | null {
  const raw = message as Message & {
    uuid?: string
    timestamp?: string
    message?: { content?: unknown }
    attachment?: unknown
    subtype?: unknown
    content?: unknown
  }
  if (!raw.uuid || !raw.timestamp) {
    return null
  }

  const day = getLocalISODateForTimestamp(raw.timestamp)
  if (!day) {
    return null
  }

  let text: string | null = null
  let role: ReducedTranscriptEntry['role'] | null = null

  switch (raw.type) {
    case 'user':
      text = extractContentText(raw.message?.content)
      role = 'user'
      break
    case 'assistant':
      text = extractContentText(raw.message?.content)
      role = 'assistant'
      break
    case 'system':
      text = extractSystemText(raw as Record<string, unknown>)
      role = 'system'
      break
    case 'attachment':
      text = extractAttachmentText(raw as Record<string, unknown>)
      role = 'attachment'
      break
    default:
      return null
  }

  if (!role || !text) {
    return null
  }

  return {
    type: 'assistant-session-transcript',
    sessionId: getSessionId() as UUID,
    messageUuid: raw.uuid,
    timestamp: raw.timestamp,
    day,
    role,
    text,
  }
}

async function appendEntries(entries: ReducedTranscriptEntry[]): Promise<void> {
  if (entries.length === 0) {
    return
  }

  const byDay = new Map<string, ReducedTranscriptEntry[]>()
  for (const entry of entries) {
    const bucket = byDay.get(entry.day)
    if (bucket) {
      bucket.push(entry)
    } else {
      byDay.set(entry.day, [entry])
    }
  }

  for (const [day, bucket] of byDay) {
    const path = getTranscriptBucketPath(day)
    await mkdir(dirname(path), { recursive: true })
    const payload =
      bucket.map(entry => jsonStringify(entry)).join('\n') + '\n'
    await appendFile(path, payload, 'utf8')
  }
}

function enqueueAppend(entries: ReducedTranscriptEntry[]): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      await appendEntries(entries)
      for (const entry of entries) {
        const key = `${entry.day}:${entry.messageUuid}`
        pendingEntryKeys.delete(key)
        writtenEntryKeys.add(key)
      }
    })
    .catch(error => {
      for (const entry of entries) {
        pendingEntryKeys.delete(`${entry.day}:${entry.messageUuid}`)
      }
      logError(error as Error)
    })
  return writeQueue
}

function collectEntries(
  messages: readonly Message[],
  predicate: (entry: ReducedTranscriptEntry) => boolean,
): ReducedTranscriptEntry[] {
  const entries: ReducedTranscriptEntry[] = []
  for (const message of messages) {
    const entry = toReducedEntry(message)
    if (!entry || !predicate(entry)) {
      continue
    }
    const key = `${entry.day}:${entry.messageUuid}`
    if (writtenEntryKeys.has(key) || pendingEntryKeys.has(key)) {
      continue
    }
    pendingEntryKeys.add(key)
    entries.push(entry)
  }
  return entries
}

export async function writeSessionTranscriptSegment(
  messages: readonly Message[],
): Promise<void> {
  const entries = collectEntries(messages, () => true)
  await enqueueAppend(entries)
}

export async function flushOnDateChange(
  messages: readonly Message[],
  currentDate: string,
): Promise<void> {
  const entries = collectEntries(messages, entry => entry.day < currentDate)
  await enqueueAppend(entries)
}
