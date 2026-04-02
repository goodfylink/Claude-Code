import { feature } from 'bun:bundle'
import { createConnection, type Socket } from 'net'
import { getSessionId } from '../bootstrap/state.js'
import { getAgentName } from './teammate.js'

type SendPayload = {
  type: 'enqueue'
  from: string
  message: string
}

export type UdsClient = {
  send: (socketPath: string, message: string, from?: string) => Promise<void>
}

function normalizeSocketPath(socketPath: string): string {
  if (process.platform === 'win32') {
    return socketPath.startsWith('\\\\.\\pipe\\')
      ? socketPath
      : `\\\\.\\pipe\\${socketPath.replace(/[\\/]/g, '-')}`
  }
  return socketPath
}

function getDefaultSender(): string {
  return getAgentName() || getSessionId()
}

async function writeSocket(
  socket: Socket,
  payload: SendPayload,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }
    const cleanup = () => {
      socket.off('connect', onConnect)
      socket.off('error', onError)
      socket.off('timeout', onTimeout)
      socket.off('close', onClose)
    }
    const onConnect = () => {
      socket.write(JSON.stringify(payload))
      socket.end()
    }
    const onError = (error: Error) => {
      finish(() => reject(error))
    }
    const onTimeout = () => {
      finish(() => reject(new Error('Timed out while sending UDS message.')))
      socket.destroy()
    }
    const onClose = (hadError: boolean) => {
      if (hadError) return
      finish(resolve)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', onConnect)
    socket.once('error', onError)
    socket.once('timeout', onTimeout)
    socket.once('close', onClose)
  })
}

export async function sendToUdsSocket(
  socketPath: string,
  message: string,
  from: string = getDefaultSender(),
  timeoutMs = 5000,
): Promise<void> {
  if (!feature('UDS_INBOX')) {
    throw new Error('UDS inbox is not enabled in this build.')
  }
  if (!message) {
    return
  }

  const socket = createConnection(normalizeSocketPath(socketPath))
  await writeSocket(socket, { type: 'enqueue', from, message }, timeoutMs)
}

export async function createUdsClient(): Promise<UdsClient> {
  return {
    async send(socketPath: string, message: string, from?: string) {
      await sendToUdsSocket(socketPath, message, from)
    },
  }
}
