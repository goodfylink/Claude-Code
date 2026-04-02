import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { unlinkSync } from 'fs'
import { WebSocketServer } from 'ws'
import { randomUUID } from 'crypto'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import { SessionManager } from './sessionManager.js'
import type { ServerConfig } from './types.js'

function isAuthorized(request: IncomingMessage, authToken: string): boolean {
  const header = request.headers.authorization
  return header === `Bearer ${authToken}`
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {}
  }
  return jsonParse(Buffer.concat(chunks).toString('utf8'))
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json')
  response.end(jsonStringify(body))
}

export function startServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: Pick<Console, 'log' | 'error'>,
): {
  port?: number
  stop: (force?: boolean) => void
} {
  const server = createServer(async (request, response) => {
    if (!isAuthorized(request, config.authToken)) {
      writeJson(response, 401, { error: 'Unauthorized' })
      return
    }

    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'POST' && request.url === '/sessions') {
      try {
        const body = (await readJsonBody(request)) as {
          cwd?: string
          dangerously_skip_permissions?: boolean
        }
        const session = await sessionManager.createSession({
          cwd: body.cwd,
          dangerouslySkipPermissions: body.dangerously_skip_permissions,
          workspace: config.workspace,
        })
        const address = server.address()
        const port =
          typeof address === 'object' && address && 'port' in address
            ? address.port
            : config.port
        const wsHost =
          config.host === '0.0.0.0' || config.host === '::'
            ? '127.0.0.1'
            : config.host
        writeJson(response, 200, {
          session_id: session.id,
          ws_url: `ws://${wsHost}:${port}/sessions/${session.id}/ws`,
          work_dir: session.workDir,
        })
      } catch (error) {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
          request_id: randomUUID(),
        })
      }
      return
    }

    writeJson(response, 404, { error: 'Not found' })
  })

  const wsServer = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    if (!isAuthorized(request, config.authToken)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    const url = new URL(request.url ?? '/', 'http://localhost')
    const match = url.pathname.match(/^\/sessions\/([^/]+)\/ws$/)
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }
    const sessionId = match[1]!
    const session = sessionManager.getSession(sessionId)
    if (!session) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    wsServer.handleUpgrade(request, socket, head, ws => {
      const unsubscribe = sessionManager.subscribe(
        sessionId,
        chunk => {
          if (ws.readyState === ws.OPEN) {
            ws.send(chunk)
          }
        },
        () => ws.close(),
      )
      if (!unsubscribe) {
        ws.close()
        return
      }

      ws.on('message', data => {
        const text = typeof data === 'string' ? data : data.toString('utf8')
        if (!text.endsWith('\n')) {
          sessionManager.send(sessionId, text + '\n')
          return
        }
        sessionManager.send(sessionId, text)
      })
      ws.on('close', () => {
        unsubscribe()
      })
    })
  })

  if (config.unix) {
    try {
      unlinkSync(config.unix)
    } catch {}
    server.listen(config.unix)
  } else {
    server.listen(config.port, config.host)
  }

  server.on('listening', () => {
    logger.log('[claude-server] listening')
  })
  server.on('error', error => {
    logger.error(error)
  })

  return {
    get port() {
      const address = server.address()
      return typeof address === 'object' && address ? address.port : undefined
    },
    stop(force = false) {
      wsServer.clients.forEach(client => {
        client.close(force ? 1012 : 1000)
      })
      wsServer.close()
      server.close()
    },
  }
}
