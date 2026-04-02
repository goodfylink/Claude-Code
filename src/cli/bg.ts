import { spawnSync } from 'child_process'
import { mkdir, readdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { quote } from '../utils/bash/shellQuote.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isFsInaccessible } from '../utils/errors.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'
import { getPlatform } from '../utils/platform.js'
import { exitWithError, writeToStdout } from '../utils/process.js'
import { jsonParse } from '../utils/slowOperations.js'

type SessionRecord = {
  pid: number
  sessionId?: string
  cwd?: string
  startedAt?: number
  updatedAt?: number
  kind?: 'interactive' | 'bg' | 'daemon' | 'daemon-worker'
  name?: string
  logPath?: string
  status?: 'busy' | 'idle' | 'waiting'
  waitingFor?: string
}

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

function getSessionLogsDir(): string {
  return join(getSessionsDir(), 'logs')
}

async function loadSessions(): Promise<SessionRecord[]> {
  let files: string[]
  try {
    files = await readdir(getSessionsDir())
  } catch (error) {
    if (isFsInaccessible(error)) {
      return []
    }
    throw error
  }

  const sessions: SessionRecord[] = []
  for (const file of files) {
    if (!/^\d+\.json$/.test(file)) {
      continue
    }
    const path = join(getSessionsDir(), file)
    try {
      const raw = jsonParse(await readFile(path, 'utf8')) as SessionRecord
      if (!raw || typeof raw.pid !== 'number') {
        continue
      }
      if (!isProcessRunning(raw.pid)) {
        if (getPlatform() !== 'wsl') {
          void unlink(path).catch(() => {})
        }
        continue
      }
      sessions.push(raw)
    } catch (error) {
      if (!isFsInaccessible(error)) {
        throw error
      }
    }
  }

  return sessions.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
}

function formatAge(epochMs: number | undefined): string {
  if (!epochMs) return '-'
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - epochMs) / 1000))
  if (deltaSeconds < 60) return `${deltaSeconds}s`
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m`
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h`
  return `${Math.floor(deltaSeconds / 86400)}d`
}

function formatStatus(session: SessionRecord): string {
  if (session.status === 'waiting' && session.waitingFor) {
    return `waiting:${session.waitingFor}`
  }
  return session.status ?? 'running'
}

function summarizePath(path: string | undefined): string {
  if (!path) return '-'
  return path.length > 44 ? `...${path.slice(-41)}` : path
}

function getMatchKey(session: SessionRecord): string[] {
  return [
    String(session.pid),
    session.sessionId ?? '',
    session.name ?? '',
    session.logPath ?? '',
  ].filter(Boolean)
}

async function resolveSession(target?: string): Promise<SessionRecord> {
  const sessions = await loadSessions()
  if (sessions.length === 0) {
    exitWithError('No live Claude sessions found.')
  }

  if (!target) {
    if (sessions.length === 1) {
      return sessions[0]!
    }
    exitWithError('Multiple live sessions found. Pass a pid, session id, or name.')
  }

  const exact = sessions.find(session => getMatchKey(session).includes(target))
  if (exact) {
    return exact
  }

  const partial = sessions.find(session =>
    getMatchKey(session).some(value => value.includes(target)),
  )
  if (partial) {
    return partial
  }

  exitWithError(`No live session matched "${target}".`)
}

function hasTmuxInstalled(): boolean {
  const result = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  return result.status === 0
}

function ensureTmuxInstalled(): void {
  if (!hasTmuxInstalled()) {
    exitWithError('tmux is required for background sessions on this restored build.')
  }
}

export async function psHandler(args: string[] = []): Promise<void> {
  const sessions = await loadSessions()
  const json = args.includes('--json')

  if (json) {
    writeToStdout(`${JSON.stringify(sessions, null, 2)}\n`)
    return
  }

  if (sessions.length === 0) {
    writeToStdout('No live Claude sessions.\n')
    return
  }

  const lines = [
    'PID     KIND     STATUS          AGE   NAME                 CWD',
    ...sessions.map(session => {
      const pid = String(session.pid).padEnd(7)
      const kind = (session.kind ?? 'interactive').padEnd(8)
      const status = formatStatus(session).padEnd(14)
      const age = formatAge(session.updatedAt ?? session.startedAt).padEnd(5)
      const name = (session.name ?? '-').slice(0, 20).padEnd(20)
      return `${pid} ${kind} ${status} ${age} ${name} ${summarizePath(session.cwd)}`
    }),
  ]

  writeToStdout(`${lines.join('\n')}\n`)
}

export async function logsHandler(target?: string): Promise<void> {
  const session = await resolveSession(target)
  if (!session.logPath) {
    exitWithError('Selected session does not expose a log file.')
  }
  const content = await readFile(session.logPath, 'utf8')
  writeToStdout(content)
}

export async function attachHandler(target?: string): Promise<void> {
  const session = await resolveSession(target)

  if (session.kind === 'bg' && session.name && hasTmuxInstalled()) {
    const result = spawnSync('tmux', ['attach-session', '-t', session.name], {
      stdio: 'inherit',
    })
    if (result.status === 0) {
      return
    }
  }

  if (session.logPath) {
    const result = spawnSync('tail', ['-f', session.logPath], {
      stdio: 'inherit',
    })
    if (result.status === 0) {
      return
    }
  }

  exitWithError('Unable to attach to the selected session.')
}

export async function killHandler(target?: string): Promise<void> {
  const session = await resolveSession(target)

  if (session.kind === 'bg' && session.name && hasTmuxInstalled()) {
    const tmux = spawnSync('tmux', ['kill-session', '-t', session.name], {
      stdio: 'ignore',
    })
    if (tmux.status === 0) {
      writeToStdout(`Killed background session ${session.name}.\n`)
      return
    }
  }

  process.kill(session.pid, 'SIGTERM')
  writeToStdout(`Sent SIGTERM to pid ${session.pid}.\n`)
}

export async function handleBgFlag(args: string[]): Promise<void> {
  ensureTmuxInstalled()

  const filteredArgs = args.filter(
    arg => arg !== '--bg' && arg !== '--background',
  )
  const sessionName = `claude-bg-${Date.now().toString(36)}`
  const logPath = join(getSessionLogsDir(), `${sessionName}.log`)

  await mkdir(getSessionLogsDir(), { recursive: true })

  const envArgs = [
    'env',
    'CLAUDE_CODE_SESSION_KIND=bg',
    `CLAUDE_CODE_SESSION_NAME=${sessionName}`,
    `CLAUDE_CODE_SESSION_LOG=${logPath}`,
    process.execPath,
    process.argv[1]!,
    ...filteredArgs,
  ]
  const command = `${quote(envArgs)} >> ${quote([logPath])} 2>&1`

  const result = spawnSync('tmux', ['new-session', '-d', '-s', sessionName, command], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    exitWithError('Failed to start background Claude session.')
  }

  writeToStdout(
    [
      `Started background session ${sessionName}.`,
      `Log file: ${logPath}`,
      `Attach: claude attach ${sessionName}`,
      'List sessions: claude ps',
    ].join('\n') + '\n',
  )
}
