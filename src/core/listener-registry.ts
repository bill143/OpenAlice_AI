/**
 * ListenerRegistry — centralized lifecycle management for Listeners.
 *
 * Each module that needs to listen owns its Listener and calls
 * `registry.register(...)` during its own setup. The registry activates
 * all registered listeners together via `start()` and tears them down
 * via `stop()`.
 *
 * On subscription, the registry wraps the EventLog into a `ListenerContext`
 * whose `emit()` is constrained to the listener's declared `emits`. The
 * context also exposes the normalized `subscribes` / `emits` arrays so the
 * handler knows what can trigger it and what it can emit.
 *
 * Errors thrown inside a listener's `handle()` are caught and logged —
 * they do not affect other listeners.
 */

import type { AgentEventMap } from './agent-event.js'
import { AgentEventSchemas } from './agent-event.js'
import type { AppendOpts, EventLog, EventLogEntry } from './event-log.js'
import type {
  EntryFor,
  EventTypeSet,
  Listener,
  ListenerContext,
} from './listener.js'
import type {
  ProducerDecl,
  ProducerHandle,
  ProducerInfo,
} from './producer.js'

// ==================== Types ====================

export interface ListenerInfo {
  name: string
  subscribes: ReadonlyArray<string>
  emits: ReadonlyArray<string>
  /** True if subscribes was declared as the wildcard '*' (UI can render an aura instead of N edges). */
  subscribesWildcard: boolean
  /** True if emits was declared as the wildcard '*'. */
  emitsWildcard: boolean
}

export interface ListenerRegistry {
  /** Register a listener. Throws if the name collides with any listener or producer. */
  register<
    Sub extends EventTypeSet,
    Emit extends EventTypeSet | undefined,
  >(listener: Listener<Sub, Emit>): void
  /** Unregister a listener by name. Unsubscribes it if the registry is started. No-op if not found. */
  unregister(name: string): void
  /** Declare a producer (pure event source). Throws on name collision with any
   *  listener or existing producer. Returns a constrained, validated emit handle.
   *  The producer is visible in introspection immediately. */
  declareProducer<Emit extends EventTypeSet>(
    decl: ProducerDecl<Emit>,
  ): ProducerHandle<Emit>
  /** Activate all registered listeners (subscribe to EventLog). */
  start(): Promise<void>
  /** Deactivate all listeners (unsubscribe). Does not remove declarations. */
  stop(): Promise<void>
  /** Introspection — registered listener names, subscribes, emits. */
  list(): ReadonlyArray<ListenerInfo>
  /** Introspection — declared producer names + emit sets. */
  listProducers(): ReadonlyArray<ProducerInfo>
}

// ==================== Helpers ====================

const ALL_EVENT_TYPES: ReadonlyArray<keyof AgentEventMap> =
  Object.keys(AgentEventSchemas) as ReadonlyArray<keyof AgentEventMap>

function normalizeToArray(
  set: EventTypeSet | undefined,
): ReadonlyArray<keyof AgentEventMap> {
  if (set === undefined) return []
  if (set === '*') return ALL_EVENT_TYPES
  if (Array.isArray(set)) return set as ReadonlyArray<keyof AgentEventMap>
  return [set as keyof AgentEventMap]
}

// ==================== Implementation ====================

export function createListenerRegistry(eventLog: EventLog): ListenerRegistry {
  // Storage is necessarily wide-typed (union across all event types).
  // Per-call type precision is preserved via the generic `register` signature.
  type AnyListener = Listener<EventTypeSet, EventTypeSet | undefined>
  const listeners = new Map<string, AnyListener>()
  // Per listener we may have 1..N subscriptions (multi-sub / wildcard)
  const unsubscribes = new Map<string, Array<() => void>>()
  // Producers share the same name space as listeners — a name cannot be both.
  type InternalProducerDecl = {
    name: string
    emits: EventTypeSet
    emitsWildcard: boolean
    emitsNormalized: ReadonlyArray<keyof AgentEventMap>
  }
  const producers = new Map<string, InternalProducerDecl>()
  let started = false

  function assertNameFree(name: string, kind: 'listener' | 'producer'): void {
    if (listeners.has(name)) {
      throw new Error(
        `ListenerRegistry: ${kind} "${name}" already registered as a listener`,
      )
    }
    if (producers.has(name)) {
      throw new Error(
        `ListenerRegistry: ${kind} "${name}" already registered as a producer`,
      )
    }
  }

  function register<
    Sub extends EventTypeSet,
    Emit extends EventTypeSet | undefined,
  >(listener: Listener<Sub, Emit>): void {
    assertNameFree(listener.name, 'listener')
    listeners.set(listener.name, listener as unknown as AnyListener)
    if (started) {
      subscribeOne(listener as unknown as AnyListener)
    }
  }

  function buildContext(
    listener: AnyListener,
    parentEntry: EventLogEntry,
  ): ListenerContext<EventTypeSet | undefined> {
    const subscribes = normalizeToArray(listener.subscribes)
    const emits = normalizeToArray(listener.emits)
    const emitIsWildcard = listener.emits === '*'
    const emitAllowed = emitIsWildcard ? null : new Set<string>(emits)

    const emitFn = async (type: string, payload: unknown, opts?: AppendOpts) => {
      // Wildcard: anything in AgentEventSchemas is OK.
      // Closed set: must be in declared emits.
      if (emitIsWildcard) {
        if (!(type in AgentEventSchemas)) {
          throw new Error(
            `Listener '${listener.name}' tried to emit unregistered type '${type}'`,
          )
        }
      } else {
        if (!emitAllowed!.has(type)) {
          const declared = [...emitAllowed!].join(', ') || '(none)'
          throw new Error(
            `Listener '${listener.name}' tried to emit '${type}' but declared emits: ${declared}`,
          )
        }
      }
      const mergedOpts: AppendOpts = {
        ...opts,
        causedBy: opts?.causedBy ?? parentEntry.seq,
      }
      return eventLog.append(
        type as keyof AgentEventMap,
        payload as never,
        mergedOpts,
      )
    }

    return {
      subscribes,
      emits,
      // The registry's runtime emit is necessarily wide-typed; per-listener
      // precision lives in the declaration (via EmitSignature<Emit>).
      emit: emitFn as never,
      events: {
        read: eventLog.read,
        recent: eventLog.recent,
        query: eventLog.query,
        lastSeq: eventLog.lastSeq,
      },
    }
  }

  function subscribeOne(listener: AnyListener): void {
    const subs = listener.subscribes
    const unsubs: Array<() => void> = []

    const dispatch = (entry: EventLogEntry) => {
      const ctx = buildContext(listener, entry)
      Promise.resolve()
        .then(() =>
          listener.handle(entry as EntryFor<EventTypeSet>, ctx),
        )
        .catch((err) => {
          console.error(`listener[${listener.name}]: unhandled error:`, err)
        })
    }

    if (subs === '*') {
      // Full stream, but filter out unregistered event types so handlers
      // can safely assume entry.type is in AgentEventMap.
      const unsub = eventLog.subscribe((entry) => {
        if (entry.type in AgentEventSchemas) dispatch(entry)
      })
      unsubs.push(unsub)
    } else if (Array.isArray(subs)) {
      for (const type of subs) {
        unsubs.push(eventLog.subscribeType(type as keyof AgentEventMap, dispatch))
      }
    } else {
      unsubs.push(
        eventLog.subscribeType(subs as keyof AgentEventMap, dispatch),
      )
    }

    unsubscribes.set(listener.name, unsubs)
  }

  function unregister(name: string): void {
    const existing = listeners.get(name)
    if (!existing) return
    listeners.delete(name)
    const unsubs = unsubscribes.get(name)
    if (unsubs) {
      for (const u of unsubs) {
        try { u() } catch { /* swallow */ }
      }
      unsubscribes.delete(name)
    }
  }

  function declareProducer<Emit extends EventTypeSet>(
    decl: ProducerDecl<Emit>,
  ): ProducerHandle<Emit> {
    assertNameFree(decl.name, 'producer')
    const emitsWildcard = decl.emits === '*'
    const emitsNormalized = normalizeToArray(decl.emits as EventTypeSet)
    const emitAllowed = emitsWildcard ? null : new Set<string>(emitsNormalized)

    const emitFn = async (type: string, payload: unknown, opts?: AppendOpts) => {
      if (emitsWildcard) {
        if (!(type in AgentEventSchemas)) {
          throw new Error(
            `Producer '${decl.name}' tried to emit unregistered type '${type}'`,
          )
        }
      } else {
        if (!emitAllowed!.has(type)) {
          const declared = [...emitAllowed!].join(', ') || '(none)'
          throw new Error(
            `Producer '${decl.name}' tried to emit '${type}' but declared emits: ${declared}`,
          )
        }
      }
      return eventLog.append(
        type as keyof AgentEventMap,
        payload as never,
        opts,
      )
    }

    producers.set(decl.name, {
      name: decl.name,
      emits: decl.emits,
      emitsWildcard,
      emitsNormalized,
    })

    const handle: ProducerHandle<Emit> = {
      name: decl.name,
      emits: emitsNormalized,
      emit: emitFn as never,
      dispose() {
        producers.delete(decl.name)
      },
    }
    return handle
  }

  async function start(): Promise<void> {
    if (started) return
    started = true
    for (const listener of listeners.values()) {
      subscribeOne(listener)
    }
  }

  async function stop(): Promise<void> {
    if (!started) return
    started = false
    for (const unsubs of unsubscribes.values()) {
      for (const u of unsubs) {
        try { u() } catch { /* swallow */ }
      }
    }
    unsubscribes.clear()
  }

  function list(): ReadonlyArray<ListenerInfo> {
    return Array.from(listeners.values()).map((l) => ({
      name: l.name,
      subscribes: [...normalizeToArray(l.subscribes)],
      emits: [...normalizeToArray(l.emits)],
      subscribesWildcard: l.subscribes === '*',
      emitsWildcard: l.emits === '*',
    }))
  }

  function listProducers(): ReadonlyArray<ProducerInfo> {
    return Array.from(producers.values()).map((p) => ({
      name: p.name,
      emits: [...p.emitsNormalized],
      emitsWildcard: p.emitsWildcard,
    }))
  }

  return { register, unregister, declareProducer, start, stop, list, listProducers }
}
