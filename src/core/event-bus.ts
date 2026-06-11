/**
 * EventBus — ergonomic in-process producer helper.
 *
 * In-process code (plugins, hacks, custom tools) fires events through this
 * facade instead of standing up an HTTP client or plumbing the raw EventLog
 * through deep callers. Semantically identical to `eventLog.append` — writes
 * to the same JSONL log, fans out through the same ListenerRegistry.
 */

import type { AgentEventMap } from './agent-event.js'
import type { AppendOpts, EventLog, EventLogEntry } from './event-log.js'

export interface EventBus {
  /** Emit any registered event type. Runtime-validated against the schema. */
  <K extends keyof AgentEventMap>(
    type: K,
    payload: AgentEventMap[K],
    opts?: AppendOpts,
  ): Promise<EventLogEntry<AgentEventMap[K]>>
}

/** Build an EventBus facade over the EventLog. */
export function createEventBus(eventLog: EventLog): EventBus {
  return (async <K extends keyof AgentEventMap>(
    type: K,
    payload: AgentEventMap[K],
    opts?: AppendOpts,
  ) => {
    return eventLog.append(type, payload, opts)
  }) as EventBus
}
