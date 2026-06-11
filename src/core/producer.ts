/**
 * Producer (a.k.a. Pumper) — a pure event source.
 *
 * A producer only *emits* events; it does not subscribe to anything. It is
 * semantically the mirror of a pure sink Listener. Typical producers:
 *   - CronEngine firing `cron.fire` from its internal timer
 *   - Connector plugins (Telegram, Web chat) emitting `message.received` /
 *     `message.sent` from their external transports
 *   - Webhook ingress emitting external events
 *
 * Producers are mutually exclusive with Listeners on name: a name cannot be
 * both. The Registry enforces this.
 *
 * The owning module is responsible for its own lifecycle. The registry's job
 * is only to (a) hand out a constrained, validated `emit` function and
 * (b) expose the declaration to introspection (UI / topology).
 */

import type { AgentEventMap } from './agent-event.js'
import type { EventTypeSet, EmitSignature } from './listener.js'

// ==================== Declaration ====================

export interface ProducerDecl<Emit extends EventTypeSet = EventTypeSet> {
  /** Unique name — must not collide with any listener or other producer. */
  name: string
  /** Event types this producer may emit. */
  emits: Emit
}

// ==================== Handle ====================

export interface ProducerHandle<Emit extends EventTypeSet = EventTypeSet> {
  readonly name: string
  /** Normalized emits (always a readonly array for introspection). */
  readonly emits: ReadonlyArray<keyof AgentEventMap>
  /** Type-constrained, runtime-validated emitter. causedBy is not defaulted
   *  here — producers have no parent entry. Callers may pass one explicitly. */
  emit: EmitSignature<Emit>
  /** Remove this producer from the registry and release its name. */
  dispose(): void
}

// ==================== Introspection ====================

export interface ProducerInfo {
  name: string
  emits: ReadonlyArray<string>
  emitsWildcard: boolean
}
