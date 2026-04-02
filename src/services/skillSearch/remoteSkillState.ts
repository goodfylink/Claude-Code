import { isSkillSearchEnabled } from './featureCheck.js'

export type RemoteSkillMetadata = {
  slug: string
  name: string
  description: string
  url: string
  shortId?: string
}

const discoveredRemoteSkills = new Map<string, RemoteSkillMetadata>()
let loadingCount = 0

export function stripCanonicalPrefix(name: string): string | null {
  return name.startsWith('_canonical_') ? name.slice('_canonical_'.length) : null
}

export function getDiscoveredRemoteSkill(slug: string) {
  return discoveredRemoteSkills.get(slug)
}

export function rememberDiscoveredRemoteSkills(
  skills: readonly RemoteSkillMetadata[],
) {
  for (const skill of skills) {
    discoveredRemoteSkills.set(skill.slug, skill)
  }
}

export function clearRemoteSkillState() {
  discoveredRemoteSkills.clear()
  loadingCount = 0
}

export function beginRemoteSkillLoad() {
  loadingCount += 1
}

export function endRemoteSkillLoad() {
  loadingCount = Math.max(0, loadingCount - 1)
}

export function getRemoteSkillState() {
  return {
    enabled: isSkillSearchEnabled(),
    loading: loadingCount > 0,
    discoveredCount: discoveredRemoteSkills.size,
    skills: [...discoveredRemoteSkills.values()],
  }
}
