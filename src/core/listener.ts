/**
 * Listener — a "pointer" on the event tape.
 *
 * Each listener declares what set of event types can trigger it (`subscribes`)
 * and what set of event types it may emit (`emits`). Both sides share the
 * same grammar — a single type, an enumerated tuple, or the wildcard '*' —
 * which keeps input/output symmetric.
 *
 * The Registry passes a `ListenerContext` into `handle()` that:
 *   - exposes the normalized subscribes/emits arrays (introspection)
 *   - provides a type-constrained `emit()` action
 *   - exposes read-only event history via `events`
 *
 * The entry parameter is a discriminated union on `type`, so handlers can
 * `switch (entry.type)` and get precise payload narrowing.
 */

import type { AgentEventMap } from './agent-event.js'
import type { AppendOpts, EventLog, EventLogEntry } from './event-log.js'

// ==================== EventTypeSet grammar ====================

/** The shape used for both `subscribes` and `emits`. */
export type EventTypeSet<T extends keyof AgentEventMap = keyof AgentEventMap> =
  | T
  | readonly T[]
  | '*'

// ==================== Entry typing (discriminated union) ====================

/** A fully-typed event log entry for a specific event type. `type` is the
 *  literal key (not raw string), enabling discriminated-union narrowing. */
export type TypedEntry<K extends keyof AgentEventMap> = {
  seq: number
  ts: number
  type: K
  payload: AgentEventMap[K]
  causedBy?: number
}

/** Resolves the entry type a listener receives based on its `subscribes`. */
export type EntryFor<Sub> =
  Sub extends keyof AgentEventMap
    ? TypedEntry<Sub>
    : Sub extends readonly (infer T)[]
      ? T extends keyof AgentEventMap ? TypedEntry<T> : never
      : Sub extends '*'
        ? TypedEntry<keyof AgentEventMap>
        : never

// ==================== Emit signature (constrained by `emits`) ====================

/** Expands a declared emit set into the ctx.emit signature.
 *  Wrapped in `[...]` to prevent distribution over unions — we want
 *  a single function signature, not a union of them. */
export type EmitSignature<Emit> =
  [Emit] extends [keyof AgentEventMap]
    ? (
        type: Emit,
        payload: AgentEventMap[Emit & keyof AgentEventMap],
        opts?: AppendOpts,
      ) => Promise<EventLogEntry<AgentEventMap[Emit & keyof AgentEventMap]>>
    : Emit extends readonly (infer T)[]
      ? [T] extends [keyof AgentEventMap]
        ? <E extends T & keyof AgentEventMap>(
            type: E,
            payload: AgentEventMap[E],
            opts?: AppendOpts,
          ) => Promise<EventLogEntry<AgentEventMap[E]>>
        : never
      : [Emit] extends ['*']
        ? <E extends keyof AgentEventMap>(
            type: E,
            payload: AgentEventMap[E],
            opts?: AppendOpts,
          ) => Promise<EventLogEntry<AgentEventMap[E]>>
        : [Emit] extends [undefined]
          ? (type: never, payload: never, opts?: AppendOpts) => Promise<never>
          : never

// ==================== ListenerContext ====================

export interface ListenerContext<
  Emit extends EventTypeSet | undefined = EventTypeSet | undefined,
> {
  /** Normalized subscribes set — always a readonly array. */
  readonly subscribes: ReadonlyArray<keyof AgentEventMap>

  /** Normalized emits set — always a readonly array (empty if listener emits nothing). */
  readonly emits: ReadonlyArray<keyof AgentEventMap>

  /** Type-constrained emitter. `causedBy` defaults to the currently-handled entry's seq. */
  emit: EmitSignature<Emit>

  /** Read-only access to the event log. */
  readonly events: {
    read: EventLog['read']
    recent: EventLog['recent']
    query: EventLog['query']
    lastSeq: EventLog['lastSeq']
  }
}

// ==================== Listener ====================

export interface Listener<
  Sub extends EventTypeSet = EventTypeSet,
  Emit extends EventTypeSet | undefined = EventTypeSet | undefined,
> {
  /** Unique name for identification (registry key, future UI display). */
  name: string
  /** Event types that can trigger this listener. */
  subscribes: Sub
  /** Event types this listener may emit. Omit = emits nothing. */
  emits?: Emit
  /** Called when a matching event is appended. */
  handle(
    entry: EntryFor<Sub>,
    ctx: ListenerContext<Emit>,
  ): Promise<void>
}
