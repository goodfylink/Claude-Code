import type { ServerConfig } from './types.js'

function displayHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1'
  }
  return host
}

export function renderServerBanner(
  config: ServerConfig,
  authToken: string,
  actualPort?: number,
): string {
  if (config.unix) {
    const encoded = encodeURIComponent(config.unix)
    return [
      'Claude Code session server started.',
      `Socket: ${config.unix}`,
      `Connect URL: cc+unix://${encoded}?token=${authToken}`,
    ].join('\n')
  }

  const port = actualPort ?? config.port
  const host = displayHost(config.host)
  return [
    'Claude Code session server started.',
    `HTTP: http://${host}:${port}`,
    `Connect URL: cc://${host}:${port}?token=${authToken}`,
  ].join('\n')
}

export function printBanner(
  config: ServerConfig,
  authToken: string,
  actualPort?: number,
): void {
  process.stdout.write(renderServerBanner(config, authToken, actualPort) + '\n')
}
