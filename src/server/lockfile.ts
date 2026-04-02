import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

export type ServerLockInfo = {
  pid: number
  port?: number
  host: string
  httpUrl: string
  startedAt: number
}

function getServerLockPath(): string {
  return join(getClaudeConfigHomeDir(), 'server.lock.json')
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function writeServerLock(info: ServerLockInfo): Promise<void> {
  await mkdir(getClaudeConfigHomeDir(), { recursive: true })
  await writeFile(getServerLockPath(), jsonStringify(info, null, 2), 'utf8')
}

export async function removeServerLock(): Promise<void> {
  await rm(getServerLockPath(), { force: true })
}

export async function probeRunningServer(): Promise<ServerLockInfo | null> {
  try {
    const raw = await readFile(getServerLockPath(), 'utf8')
    const parsed = jsonParse(raw) as ServerLockInfo
    if (!parsed || typeof parsed.pid !== 'number' || !parsed.httpUrl) {
      await removeServerLock()
      return null
    }
    if (!isProcessAlive(parsed.pid)) {
      await removeServerLock()
      return null
    }
    return parsed
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
}

export function createServerLockfile(): string {
  return getServerLockPath()
}
