import { fetchCodeSessionsFromSessionsAPI } from '../utils/teleport/api.js'

export type AssistantSession = {
  id: string
  title: string
  status: string
  updatedAt: string
  createdAt: string
}

export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  const sessions = await fetchCodeSessionsFromSessionsAPI()
  return sessions
    .filter(session => session.status !== 'archived')
    .map(session => ({
      id: session.id,
      title: session.title || 'Untitled assistant session',
      status: session.status,
      updatedAt: session.updated_at,
      createdAt: session.created_at,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const listAssistantSessions = discoverAssistantSessions
