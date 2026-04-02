import { feature } from 'bun:bundle'
import { randomUUID } from 'crypto'
import { chmod, mkdir, unlink } from 'fs/promises'
import { createServer, type Server } from 'net'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'
import { errorMessage, isFsInaccessible } from './errors.js'
import { enqueue } from './messageQueueManager.js'

let server: Server | null = null
let socketPath: string | null = null
let onEnqueue: (() => void) | null = null

type StartOptions = {
  isExplicit?: boolean
}

type WireMessage = {
  type?: 'enqueue'
  from?: string
  message?: string
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatInboundMessage(sender: string, message: string): string {
  return `<cross-session-message from="${escapeXml(sender)}">\n${message}\n</cross-session-message>`
}

function normalizeSocketPath(path: string): string {
  if (process.platform === 'win32') {
    return path.startsWith('\\\\.\\pipe\\')
      ? path
      : `\\\\.\\pipe\\${path.replace(/[\\/]/g, '-')}`
  }
  return path
}

async function cleanupSocket(path: string): Promise<void> {
  if (process.platform === 'win32') {
    return
  }
  try {
    await unlink(path)
  } catch (error) {
    if (!isFsInaccessible(error)) {
      throw error
    }
  }
}

function handlePayload(raw: string): void {
  let parsed: WireMessage
  try {
    parsed = JSON.parse(raw) as WireMessage
  } catch (error) {
    logForDebugging(`[udsMessaging] invalid payload: ${errorMessage(error)}`)
    return
  }

  if (typeof parsed.message !== 'string' || parsed.message.length === 0) {
    return
  }

  const sender =
    typeof parsed.from === 'string' && parsed.from.length > 0
      ? parsed.from
      : 'unknown'

  enqueue({
    value: formatInboundMessage(sender, parsed.message),
    mode: 'prompt',
    skipSlashCommands: true,
    uuid: randomUUID(),
  })
  onEnqueue?.()
}

export function getDefaultUdsSocketPath(): string {
  if (process.platform === 'win32') {
    return `claude-code-${process.pid}`
  }
  return join(tmpdir(), `claude-code-${process.pid}.sock`)
}

export function getUdsMessagingSocketPath(): string | null {
  return socketPath
}

export function setOnEnqueue(callback: (() => void) | null): void {
  onEnqueue = callback
}

export async function startUdsMessaging(
  requestedPath: string,
  _options: StartOptions = {},
): Promise<string> {
  if (!feature('UDS_INBOX')) {
    return requestedPath
  }

  const normalized = normalizeSocketPath(requestedPath)

  if (server && socketPath === normalized) {
    process.env.CLAUDE_CODE_MESSAGING_SOCKET = normalized
    return normalized
  }

  if (server) {
    await new Promise<void>(resolve => {
      server!.close(() => resolve())
    })
    server = null
  }

  if (process.platform !== 'win32') {
    await mkdir(dirname(normalized), { recursive: true })
    await cleanupSocket(normalized)
  }

  server = createServer(socket => {
    let payload = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      payload += chunk
    })
    socket.on('end', () => {
      handlePayload(payload)
    })
  })

  await new Promise<void>((resolve, reject) => {
    const current = server!
    current.once('error', reject)
    current.listen(normalized, () => {
      current.off('error', reject)
      resolve()
    })
  })

  if (process.platform !== 'win32') {
    try {
      await chmod(normalized, 0o600)
    } catch (error) {
      logForDebugging(`[udsMessaging] chmod failed: ${errorMessage(error)}`)
    }
  }

  socketPath = normalized
  process.env.CLAUDE_CODE_MESSAGING_SOCKET = normalized

  registerCleanup(async () => {
    if (server) {
      await new Promise<void>(resolve => {
        server?.close(() => resolve())
      })
      server = null
    }
    if (socketPath) {
      await cleanupSocket(socketPath).catch(error => {
        logForDebugging(`[udsMessaging] cleanup failed: ${errorMessage(error)}`)
      })
    }
  })

  return normalized
}
