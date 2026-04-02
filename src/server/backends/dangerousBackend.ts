/**
 * Restored-build compatibility backend for local direct-connect sessions.
 *
 * The original project uses a richer backend abstraction. The restored tree
 * only needs an object to satisfy construction and to make it explicit that
 * server sessions execute commands without an additional sandbox layer beyond
 * the spawned Claude CLI process itself.
 */
export class DangerousBackend {}

export function createDangerousBackend(): DangerousBackend {
  return new DangerousBackend()
}
