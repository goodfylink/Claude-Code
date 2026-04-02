import type { MemoryHeader } from './memoryScan.js'
import type { MemoryScope } from '../utils/memoryFileDetection.js'

type WriteTelemetry = {
  toolName: string
  filePath: string
  scope: MemoryScope
  timestamp: string
}

type RecallTelemetry = {
  candidateCount: number
  selectedCount: number
  selectedFilenames: string[]
  timestamp: string
}

let lastWriteTelemetry: WriteTelemetry | null = null
let lastRecallTelemetry: RecallTelemetry | null = null

export function logMemoryReadShape(): void {}

export function logMemoryWriteShape(
  toolName: string,
  _toolInput: unknown,
  filePath: string,
  scope: MemoryScope,
): void {
  lastWriteTelemetry = {
    toolName,
    filePath,
    scope,
    timestamp: new Date().toISOString(),
  }
}

export function logMemoryRecallShape(
  candidates: readonly MemoryHeader[],
  selected: readonly MemoryHeader[],
): void {
  lastRecallTelemetry = {
    candidateCount: candidates.length,
    selectedCount: selected.length,
    selectedFilenames: selected.map(memory => memory.filename),
    timestamp: new Date().toISOString(),
  }
}

export function getLastMemoryWriteShape(): WriteTelemetry | null {
  return lastWriteTelemetry
}

export function getLastMemoryRecallShape(): RecallTelemetry | null {
  return lastRecallTelemetry
}

export function resetMemoryShapeTelemetry(): void {
  lastWriteTelemetry = null
  lastRecallTelemetry = null
}
