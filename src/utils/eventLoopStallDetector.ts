import { logForDebugging } from './debug.js'

const DEFAULT_INTERVAL_MS = 250
const DEFAULT_STALL_THRESHOLD_MS = 500

let started = false

export function startEventLoopStallDetector(
  intervalMs = DEFAULT_INTERVAL_MS,
  stallThresholdMs = DEFAULT_STALL_THRESHOLD_MS,
): void {
  if (started) return
  started = true

  let previous = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    const elapsed = now - previous
    previous = now

    const stallMs = elapsed - intervalMs
    if (stallMs >= stallThresholdMs) {
      logForDebugging(
        `[event-loop-stall] main thread stalled for ${Math.round(stallMs)}ms`,
        { level: 'warning' },
      )
    }
  }, intervalMs)

  timer.unref?.()
}
