/**
 * Event Metrics Listener — wildcard subscriber that keeps per-type
 * in-memory counts and last-seen timestamps for every registered event.
 *
 * Primary value:
 *   - live observability of the event bus without hitting disk
 *   - foundation for UI displays (fire-count badges on Flow nodes)
 *   - showcases the subscribe-wildcard aura in the Flow visualization
 *
 * Zero emit — this is a pure observer.
 */

import type { Listener } from '../../core/listener.js'
import type { ListenerRegistry } from '../../core/listener-registry.js'

export interface EventTypeStats {
  count: number
  lastSeenTs: number
}

export interface MetricsListener {
  start(): Promise<void>
  stop(): void
  /** Snapshot of current counts per event type. */
  getStats(): Record<string, EventTypeStats>
  /** Reset counters (e.g. tests). */
  reset(): void
  readonly listener: Listener<'*', undefined>
}

export function createMetricsListener(opts: { registry: ListenerRegistry }): MetricsListener {
  const { registry } = opts
  const stats = new Map<string, EventTypeStats>()
  let registered = false

  const listener: Listener<'*', undefined> = {
    name: 'event-metrics',
    subscribes: '*',
    async handle(entry) {
      const current = stats.get(entry.type)
      if (current) {
        current.count += 1
        current.lastSeenTs = entry.ts
      } else {
        stats.set(entry.type, { count: 1, lastSeenTs: entry.ts })
      }
    },
  }

  return {
    listener,
    async start() {
      if (registered) return
      registry.register(listener)
      registered = true
    },
    stop() {
      if (registered) {
        registry.unregister(listener.name)
        registered = false
      }
    },
    getStats() {
      const out: Record<string, EventTypeStats> = {}
      for (const [type, s] of stats) {
        out[type] = { count: s.count, lastSeenTs: s.lastSeenTs }
      }
      return out
    },
    reset() {
      stats.clear()
    },
  }
}
