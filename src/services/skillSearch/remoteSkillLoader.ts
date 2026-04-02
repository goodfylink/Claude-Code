import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import {
  beginRemoteSkillLoad,
  endRemoteSkillLoad,
  rememberDiscoveredRemoteSkills,
  type RemoteSkillMetadata,
} from './remoteSkillState.js'

type RemoteCatalogEntry = {
  slug: string
  description: string
  shortId: string
  keywords: readonly string[]
  url: string
  load(): Promise<{ content: string; fileCount: number }>
}

type RemoteSkillLoadResult = {
  cacheHit: boolean
  latencyMs: number
  skillPath: string
  content: string
  fileCount: number
  totalBytes: number
  fetchMethod: 'catalog' | 'cache'
}

const remoteSkillCache = new Map<string, RemoteSkillLoadResult>()

function isPlaceholderContent(content: string): boolean {
  return content.includes('Restored Placeholder')
}

function substituteModelVars(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match)
}

function renderDocs(
  files: Record<string, string>,
  vars?: Record<string, string>,
): string {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => {
      const resolved = vars ? substituteModelVars(content, vars) : content
      return `<doc path="${path}">\n${resolved.trim()}\n</doc>`
    })
    .join('\n\n')
}

const REMOTE_SKILL_CATALOG: readonly RemoteCatalogEntry[] = [
  {
    slug: 'verify',
    description: 'Verify a code change does what it should by running the app.',
    shortId: 'ver001',
    keywords: ['verify', 'test', 'regression', 'qa', 'bug', 'check'],
    url: 'aki://catalog/verify',
    async load() {
      const { SKILL_MD, SKILL_FILES } = await import(
        '../../skills/bundled/verifyContent.js'
      )
      const { content } = parseFrontmatter(SKILL_MD)
      const body = content.trim()
      return {
        content: isPlaceholderContent(body)
          ? `# verify

Use this skill to validate a code change by running the app or tests, exercising the changed path, and checking for regressions.

Prefer concrete verification commands over static reasoning. If the repo exposes a dev server, test runner, or CLI entrypoint, use that first.

## Reference Examples

${renderDocs(SKILL_FILES)}`
          : body,
        fileCount: 1 + Object.keys(SKILL_FILES).length,
      }
    },
  },
  {
    slug: 'claude-api',
    description:
      'Build apps with the Claude API or Anthropic SDK when the task is API integration or SDK usage.',
    shortId: 'api001',
    keywords: [
      'anthropic',
      'claude api',
      'sdk',
      'agent sdk',
      'tool use',
      'prompt caching',
      'streaming',
      'api',
    ],
    url: 'aki://catalog/claude-api',
    async load() {
      const { SKILL_PROMPT, SKILL_MODEL_VARS, SKILL_FILES } = await import(
        '../../skills/bundled/claudeApiContent.js'
      )
      const prompt = substituteModelVars(SKILL_PROMPT, SKILL_MODEL_VARS).trim()
      return {
        content: isPlaceholderContent(prompt)
          ? `# claude-api

Use this skill when the task is specifically about building with the Claude API, the Anthropic SDKs, or the Agent SDK.

Prioritize official Anthropic patterns for:
- text generation and chat turns
- streaming responses
- tool use / function calling
- files API usage
- prompt caching
- model selection and error handling

If the repository language is unclear, inspect the project first and then use the closest matching reference below.

## Included Documentation

${renderDocs(SKILL_FILES, SKILL_MODEL_VARS)}`
          : prompt,
        fileCount: 1 + Object.keys(SKILL_FILES).length,
      }
    },
  },
] as const

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
}

function scoreRemoteEntry(query: string, entry: RemoteCatalogEntry): number {
  const normalizedQuery = query.toLowerCase()
  let score = 0

  if (normalizedQuery.includes(entry.slug)) {
    score += 60
  }

  for (const token of tokenize(query)) {
    for (const keyword of entry.keywords) {
      if (keyword === token) {
        score += 18
        break
      }
      if (keyword.includes(token) || token.includes(keyword)) {
        score += 8
        break
      }
    }
  }

  return score
}

function toMetadata(entry: RemoteCatalogEntry): RemoteSkillMetadata {
  return {
    slug: entry.slug,
    name: `_canonical_${entry.slug}`,
    description: entry.description,
    shortId: entry.shortId,
    url: entry.url,
  }
}

export async function loadRemoteSkills(query: string): Promise<RemoteSkillMetadata[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length === 0) {
    return []
  }

  const matches = REMOTE_SKILL_CATALOG.map(entry => ({
    entry,
    score: scoreRemoteEntry(normalizedQuery, entry),
  }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug))
    .map(match => toMetadata(match.entry))

  rememberDiscoveredRemoteSkills(matches)
  return matches
}

export async function loadRemoteSkill(
  slug: string,
  _url: string,
): Promise<RemoteSkillLoadResult> {
  const cached = remoteSkillCache.get(slug)
  if (cached) {
    return {
      ...cached,
      cacheHit: true,
      fetchMethod: 'cache',
    }
  }

  const entry = REMOTE_SKILL_CATALOG.find(item => item.slug === slug)
  if (!entry) {
    throw new Error(`Unknown remote skill slug: ${slug}`)
  }

  const startedAt = Date.now()
  beginRemoteSkillLoad()
  try {
    const { content, fileCount } = await entry.load()
    const loadResult: RemoteSkillLoadResult = {
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
      skillPath: `${entry.url}/SKILL.md`,
      content,
      fileCount,
      totalBytes: Buffer.byteLength(content, 'utf8'),
      fetchMethod: 'catalog',
    }
    remoteSkillCache.set(slug, loadResult)
    return loadResult
  } finally {
    endRemoteSkillLoad()
  }
}
