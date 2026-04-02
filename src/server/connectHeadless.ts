import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { type DirectConnectConfig, DirectConnectSessionManager } from './directConnectManager.js'
import { jsonStringify } from '../utils/slowOperations.js'
import { writeToStderr, writeToStdout } from '../utils/process.js'

function extractAssistantText(message: SDKMessage): string {
  if (message.type !== 'assistant') {
    return ''
  }
  const content = message.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .flatMap(block => {
      if (block.type === 'text' && typeof block.text === 'string') {
        return [block.text]
      }
      return []
    })
    .join('')
}

async function readPromptFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''
  }
  let result = ''
  for await (const chunk of process.stdin) {
    result += chunk.toString()
  }
  return result.trim()
}

export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive = false,
): Promise<void> {
  if (config.serverUrl.startsWith('unix:')) {
    throw new Error('unix socket direct-connect is not supported in the restored headless client.')
  }

  const effectivePrompt = prompt || (interactive ? await readPromptFromStdin() : '')
  const assistantChunks: string[] = []

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      manager.disconnect()
      fn()
    }

    const manager = new DirectConnectSessionManager(config, {
      onConnected: () => {
        if (effectivePrompt) {
          manager.sendMessage(effectivePrompt)
        }
      },
      onPermissionRequest: (_request, requestId) => {
        manager.respondToPermissionRequest(requestId, {
          behavior: 'deny',
          message:
            'Headless direct-connect permission prompts are not supported in this restored build.',
        })
      },
      onMessage: message => {
        if (outputFormat === 'stream-json') {
          writeToStdout(jsonStringify(message) + '\n')
        } else {
          const text = extractAssistantText(message)
          if (text) {
            assistantChunks.push(text)
            if (outputFormat === 'text') {
              writeToStdout(text)
            }
          }
        }

        if (message.type === 'result') {
          if (outputFormat === 'json') {
            writeToStdout(
              jsonStringify({
                session_id: config.sessionId,
                text: assistantChunks.join(''),
                subtype: message.subtype,
                errors: message.errors ?? [],
              }) + '\n',
            )
          }
          finish(resolve)
        }
      },
      onDisconnected: () => {
        finish(resolve)
      },
      onError: error => {
        writeToStderr(`${error.message}\n`)
        finish(() => reject(error))
      },
    })

    manager.connect()
  })
}

export async function connectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive = false,
): Promise<void> {
  await runConnectHeadless(config, prompt, outputFormat, interactive)
}
