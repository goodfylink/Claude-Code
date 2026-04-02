import memoize from 'lodash-es/memoize.js'
import uniqBy from 'lodash-es/uniqBy.js'
import { getProjectRoot } from '../../bootstrap/state.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Command } from '../../types/command.js'
import { getBundledSkills } from '../../skills/bundledSkills.js'
import { getSkillDirCommands } from '../../skills/loadSkillsDir.js'
import { getPluginSkills } from '../../utils/plugins/loadPluginCommands.js'

export type LocalSkillSearchResult = {
  name: string
  description: string
  score: number
}

type IndexedSkill = {
  commandName: string
  description: string
  haystack: string
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
}

function buildHaystack(command: Command): string {
  return [
    command.name,
    command.description,
    command.whenToUse,
    command.argumentHint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function scoreCommand(query: string, tokens: string[], skill: IndexedSkill): number {
  if (tokens.length === 0) {
    return 0
  }

  let score = 0
  const normalizedQuery = query.toLowerCase().trim()
  const name = skill.commandName.toLowerCase()

  if (name === normalizedQuery) {
    score += 100
  } else if (name.includes(normalizedQuery)) {
    score += 40
  }

  for (const token of tokens) {
    if (name === token) {
      score += 24
      continue
    }
    if (name.includes(token)) {
      score += 12
      continue
    }
    if (skill.haystack.includes(token)) {
      score += 4
    }
  }

  return score
}

const getStaticSkillIndex = memoize(async (cwd: string): Promise<IndexedSkill[]> => {
  const [bundledSkills, fileSkills, pluginSkills] = await Promise.all([
    Promise.resolve(getBundledSkills()),
    getSkillDirCommands(cwd),
    getPluginSkills(),
  ])

  return uniqBy(
    [...bundledSkills, ...fileSkills, ...pluginSkills],
    command => command.name,
  )
    .filter(
      command =>
        command.type === 'prompt' &&
        !command.disableModelInvocation &&
        command.source !== 'builtin',
    )
    .map(command => ({
      commandName: command.name,
      description: command.description,
      haystack: buildHaystack(command),
    }))
})

export async function clearSkillIndexCache() {
  getStaticSkillIndex.cache?.clear?.()
}

export async function searchLocalSkills(
  query: string,
  context?: ToolUseContext,
): Promise<LocalSkillSearchResult[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length === 0) {
    return []
  }

  const tokens = tokenize(normalizedQuery)
  if (tokens.length === 0) {
    return []
  }

  const cwd = getProjectRoot()
  const indexedSkills = await getStaticSkillIndex(cwd)
  const mcpSkills = context
    ? context
        .getAppState()
        .mcp.commands.filter(
          (cmd): cmd is Command =>
            cmd.type === 'prompt' &&
            cmd.loadedFrom === 'mcp' &&
            !cmd.disableModelInvocation,
        )
        .filter(cmd => cmd.type === 'prompt')
        .map(cmd => ({
          commandName: cmd.name,
          description: cmd.description,
          haystack: buildHaystack(cmd),
        }))
    : []

  return uniqBy([...indexedSkills, ...mcpSkills], skill => skill.commandName)
    .map(skill => ({
      name: skill.commandName,
      description: skill.description,
      score: scoreCommand(normalizedQuery, tokens, skill),
    }))
    .filter(skill => skill.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
