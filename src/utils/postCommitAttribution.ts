import { chmod, mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { logForDebugging } from './debug.js'

const HOOK_MARKER = '# claude-code-restored-prepare-commit-msg'

function buildHookScript(): string {
  return `${HOOK_MARKER}
# Restored-source compatibility hook.
# The original build injects richer commit attribution here; the restored tree
# keeps the hook location warm so worktree creation and husky integration do
# not fail when commit attribution is enabled.
:
`
}

export async function installPrepareCommitMsgHook(
  repoRoot: string,
  hooksDir?: string,
): Promise<void> {
  const targetDir = hooksDir ?? join(repoRoot, '.git', 'hooks')
  const hookPath = join(targetDir, 'prepare-commit-msg')

  await mkdir(dirname(hookPath), { recursive: true })

  let current = ''
  try {
    current = await readFile(hookPath, 'utf8')
  } catch {
    current = '#!/usr/bin/env sh\n'
  }

  if (!current.includes(HOOK_MARKER)) {
    const next = current.endsWith('\n')
      ? `${current}${buildHookScript()}`
      : `${current}\n${buildHookScript()}`
    await writeFile(hookPath, next, 'utf8')
    await chmod(hookPath, 0o755)
  }
}

export async function runPostCommitAttribution(): Promise<void> {
  logForDebugging(
    '[postCommitAttribution] compatibility mode active; original post-commit attribution pipeline is not fully restored.',
  )
}
