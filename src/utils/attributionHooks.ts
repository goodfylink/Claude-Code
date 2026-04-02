import { registerHookCallbacks } from '../bootstrap/state.js'
import type { HookInput, HookJSONOutput } from '../entrypoints/agentSdkTypes.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from '../tools/NotebookEditTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import type { HookCallback } from '../types/hooks.js'
import {
  trackFileCreation,
  trackFileModification,
} from './commitAttribution.js'
import { logForDebugging } from './debug.js'

type FileWriteResponse = {
  filePath?: string
  originalFile?: string | null
  content?: string
}

type FileEditResponse = {
  filePath?: string
  originalFile?: string
  newString?: string
  oldString?: string
}

type NotebookEditResponse = {
  error?: string
  notebook_path?: string
  original_file?: string
  updated_file?: string
}

const fileContentCache = new Map<string, string>()

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractFileWriteResponse(value: unknown): FileWriteResponse | null {
  if (!isObjectRecord(value)) return null
  return value as FileWriteResponse
}

function extractFileEditResponse(value: unknown): FileEditResponse | null {
  if (!isObjectRecord(value)) return null
  return value as FileEditResponse
}

function extractNotebookResponse(value: unknown): NotebookEditResponse | null {
  if (!isObjectRecord(value)) return null
  return value as NotebookEditResponse
}

async function handleAttributionHook(
  input: HookInput,
  _toolUseID: string | null,
  _signal: AbortSignal | undefined,
  _hookIndex?: number,
  context?: {
    updateAttributionState: (
      updater: (prev: import('./commitAttribution.js').AttributionState) => import('./commitAttribution.js').AttributionState,
    ) => void
  },
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PostToolUse' || !context) {
    return {}
  }

  switch (input.tool_name) {
    case FILE_WRITE_TOOL_NAME: {
      const response = extractFileWriteResponse(input.tool_response)
      if (
        !response?.filePath ||
        typeof response.content !== 'string' ||
        response.originalFile === undefined
      ) {
        return {}
      }
      const original = typeof response.originalFile === 'string'
        ? response.originalFile
        : ''
      fileContentCache.set(response.filePath, response.content)
      context.updateAttributionState(prev =>
        response.originalFile === null
          ? trackFileCreation(prev, response.filePath!, response.content!)
          : trackFileModification(
              prev,
              response.filePath!,
              original,
              response.content!,
              false,
            ),
      )
      return {}
    }
    case FILE_EDIT_TOOL_NAME: {
      const response = extractFileEditResponse(input.tool_response)
      if (
        !response?.filePath ||
        typeof response.originalFile !== 'string' ||
        typeof response.oldString !== 'string' ||
        typeof response.newString !== 'string'
      ) {
        return {}
      }
      const updated = response.originalFile.replace(
        response.oldString,
        response.newString,
      )
      fileContentCache.set(response.filePath, updated)
      context.updateAttributionState(prev =>
        trackFileModification(
          prev,
          response.filePath!,
          response.originalFile!,
          updated,
          false,
        ),
      )
      return {}
    }
    case NOTEBOOK_EDIT_TOOL_NAME: {
      const response = extractNotebookResponse(input.tool_response)
      if (
        response?.error ||
        !response?.notebook_path ||
        typeof response.original_file !== 'string' ||
        typeof response.updated_file !== 'string'
      ) {
        return {}
      }
      fileContentCache.set(response.notebook_path, response.updated_file)
      context.updateAttributionState(prev =>
        trackFileModification(
          prev,
          response.notebook_path!,
          response.original_file!,
          response.updated_file!,
          false,
        ),
      )
      return {}
    }
    default:
      return {}
  }
}

export function sweepFileContentCache(): void {
  if (fileContentCache.size > 500) {
    fileContentCache.clear()
  }
}

export async function clearAttributionCaches(): Promise<void> {
  fileContentCache.clear()
}

export function registerAttributionHooks(): void {
  const hook: HookCallback = {
    type: 'callback',
    callback: handleAttributionHook,
    timeout: 1,
    internal: true,
  }

  registerHookCallbacks({
    PostToolUse: [
      { matcher: FILE_WRITE_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_EDIT_TOOL_NAME, hooks: [hook] },
      { matcher: NOTEBOOK_EDIT_TOOL_NAME, hooks: [hook] },
    ],
  })
}

export async function initializeAttributionHooks(): Promise<void> {
  logForDebugging('[attributionHooks] initializeAttributionHooks is deprecated; using registerAttributionHooks().')
  registerAttributionHooks()
}
