import { randomUUID } from 'crypto'
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'child_process'
import type { SessionInfo } from './types.js'

type SessionSubscriber = (chunk: string) => void
type SessionCloseListener = () => void

type ManagedSession = SessionInfo & {
  process: ChildProcessWithoutNullStreams
  subscribers: Set<SessionSubscriber>
  closeListeners: Set<SessionCloseListener>
  idleTimer: NodeJS.Timeout | null
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>()

  constructor(
    _backend: unknown,
    private readonly options: {
      idleTimeoutMs?: number
      maxSessions?: number
    } = {},
  ) {}

  async createSession({
    cwd,
    dangerouslySkipPermissions = false,
    workspace,
  }: {
    cwd?: string
    dangerouslySkipPermissions?: boolean
    workspace?: string
  }): Promise<SessionInfo> {
    const runningCount = Array.from(this.sessions.values()).filter(
      session => session.status !== 'stopped',
    ).length
    if (
      this.options.maxSessions &&
      this.options.maxSessions > 0 &&
      runningCount >= this.options.maxSessions
    ) {
      throw new Error(
        `Maximum concurrent sessions reached (${this.options.maxSessions}).`,
      )
    }

    const sessionId = randomUUID()
    const workDir = cwd || workspace || process.cwd()
    const entrypoint = process.argv[1]
    if (!entrypoint) {
      throw new Error('Cannot determine Claude CLI entrypoint for server session.')
    }

    const args = [
      entrypoint,
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
      sessionId,
    ]
    if (dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    }

    const child = spawn(process.execPath, args, {
      cwd: workDir,
      env: {
        ...process.env,
        CLAUDE_CODE_SERVER_SESSION: '1',
      },
      stdio: 'pipe',
    })

    const managed: ManagedSession = {
      id: sessionId,
      status: 'starting',
      createdAt: Date.now(),
      workDir,
      process: child,
      subscribers: new Set(),
      closeListeners: new Set(),
      idleTimer: null,
    }
    this.sessions.set(sessionId, managed)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.once('spawn', () => {
      managed.status = 'running'
    })
    child.stdout.on('data', chunk => {
      this.emit(sessionId, chunk)
    })
    child.stderr.on('data', chunk => {
      this.emit(
        sessionId,
        JSON.stringify({
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: true,
          num_turns: 0,
          stop_reason: null,
          session_id: sessionId,
          total_cost_usd: 0,
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
            server_tool_use: {
              web_search_requests: 0,
            },
            service_tier: 'standard',
          },
          modelUsage: {},
          permission_denials: [],
          uuid: randomUUID(),
          errors: [String(chunk).trim()],
        }) + '\n',
      )
    })
    child.once('exit', () => {
      managed.status = 'stopped'
      this.notifyClosed(sessionId)
      this.clearIdleTimer(managed)
    })

    return {
      id: managed.id,
      status: managed.status,
      createdAt: managed.createdAt,
      workDir: managed.workDir,
      process: managed.process,
    }
  }

  subscribe(
    sessionId: string,
    onData: SessionSubscriber,
    onClose?: SessionCloseListener,
  ): (() => void) | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }
    this.clearIdleTimer(session)
    session.subscribers.add(onData)
    if (onClose) {
      session.closeListeners.add(onClose)
    }
    return () => {
      session.subscribers.delete(onData)
      if (onClose) {
        session.closeListeners.delete(onClose)
      }
      this.scheduleIdleCleanup(session)
    }
  }

  send(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status === 'stopped' || !session.process.stdin.writable) {
      return false
    }
    session.process.stdin.write(data)
    return true
  }

  getSession(sessionId: string): SessionInfo | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }
    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      workDir: session.workDir,
      process: session.process,
    }
  }

  async destroyAll(): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.keys()).map(sessionId =>
        this.destroySession(sessionId),
      ),
    )
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    this.clearIdleTimer(session)
    if (session.status !== 'stopped') {
      session.status = 'stopping'
      session.process.kill('SIGTERM')
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          session.process.kill('SIGKILL')
          resolve()
        }, 2000)
        session.process.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
    this.sessions.delete(sessionId)
  }

  private emit(sessionId: string, chunk: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    for (const subscriber of session.subscribers) {
      subscriber(chunk)
    }
  }

  private notifyClosed(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    for (const listener of session.closeListeners) {
      listener()
    }
    this.scheduleIdleCleanup(session)
  }

  private scheduleIdleCleanup(session: ManagedSession): void {
    if (session.subscribers.size > 0) {
      return
    }
    if (!this.options.idleTimeoutMs || this.options.idleTimeoutMs <= 0) {
      return
    }
    this.clearIdleTimer(session)
    session.idleTimer = setTimeout(() => {
      void this.destroySession(session.id)
    }, this.options.idleTimeoutMs)
  }

  private clearIdleTimer(session: ManagedSession): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
  }
}
