type ParsedConnectUrl = {
  serverUrl: string
  authToken?: string
}

function coalesceToken(url: URL): string | undefined {
  const queryToken =
    url.searchParams.get('token') ??
    url.searchParams.get('authToken') ??
    undefined
  const userInfoToken = url.username
    ? decodeURIComponent(url.username)
    : undefined
  return queryToken || userInfoToken
}

export function parseConnectUrl(value: string): ParsedConnectUrl {
  const url = new URL(value)

  if (url.protocol === 'cc:') {
    const host = url.hostname
    if (!host) {
      throw new Error(`Invalid connect URL: missing host in ${value}`)
    }
    const port = url.port ? `:${url.port}` : ''
    return {
      serverUrl: `http://${host}${port}`,
      authToken: coalesceToken(url),
    }
  }

  if (url.protocol === 'cc+unix:') {
    const unixPath =
      decodeURIComponent(`${url.hostname}${url.pathname}`).replace(
        /^\/+/,
        '/',
      ) || decodeURIComponent(url.pathname)
    if (!unixPath) {
      throw new Error(`Invalid connect URL: missing unix socket path in ${value}`)
    }
    return {
      serverUrl: `unix:${unixPath}`,
      authToken: coalesceToken(url),
    }
  }

  throw new Error(`Unsupported connect URL scheme: ${url.protocol}`)
}
