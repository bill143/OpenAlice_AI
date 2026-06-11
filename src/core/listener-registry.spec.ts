import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEventLog, type EventLog } from './event-log.js'
import { createListenerRegistry, type ListenerRegistry } from './listener-registry.js'
import type { Listener } from './listener.js'

function tempLogPath(): string {
  return join(tmpdir(), `listener-registry-${randomUUID()}.jsonl`)
}

// Wait one microtask + a small macrotask to let the registry's fire-and-forget
// Promise chain settle.
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5))
}

describe('ListenerRegistry', () => {
  let eventLog: EventLog
  let registry: ListenerRegistry

  beforeEach(async () => {
    eventLog = await createEventLog({ logPath: tempLogPath() })
    registry = createListenerRegistry(eventLog)
  })

  afterEach(async () => {
    await registry.stop()
    await eventLog._resetForTest()
  })

  // ==================== register ====================

  describe('register', () => {
    it('should register a listener and show it in list()', () => {
      const listener: Listener<'cron.fire'> = {
        name: 'test',
        subscribes: 'cron.fire',
        async handle() { /* no-op */ },
      }
      registry.register(listener)

      const infos = registry.list()
      expect(infos).toHaveLength(1)
      expect(infos[0]).toEqual({
        name: 'test',
        subscribes: ['cron.fire'],
        emits: [],
        subscribesWildcard: false,
        emitsWildcard: false,
      })
    })

    it('should flag wildcard listeners in list()', () => {
      registry.register({
        name: 'audit',
        subscribes: '*',
        emits: '*',
        async handle() { /* no-op */ },
      })
      const info = registry.list().find((l) => l.name === 'audit')!
      expect(info.subscribesWildcard).toBe(true)
      expect(info.emitsWildcard).toBe(true)
      // Wildcard expands to all registered event types
      expect(info.subscribes.length).toBeGreaterThan(5)
      expect(info.emits.length).toBeGreaterThan(5)
    })

    it('should throw on duplicate name', () => {
      const listener: Listener<'cron.fire'> = {
        name: 'dup',
        subscribes: 'cron.fire',
        async handle() { /* no-op */ },
      }
      registry.register(listener)

      expect(() => registry.register(listener)).toThrow(/already registered/)
    })
  })

  // ==================== start / stop ====================

  describe('start/stop', () => {
    it('should deliver matching events after start()', async () => {
      const received: string[] = []
      registry.register({
        name: 'l1',
        subscribes: 'cron.fire',
        async handle(entry) { received.push(entry.payload.jobId) },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await flush()

      expect(received).toEqual(['j1'])
    })

    it('should not deliver non-matching event types', async () => {
      const received: unknown[] = []
      registry.register({
        name: 'l1',
        subscribes: 'cron.fire',
        async handle(entry) { received.push(entry) },
      })
      await registry.start()

      await eventLog.append('heartbeat.skip', { reason: 'test' })
      await flush()

      expect(received).toHaveLength(0)
    })

    it('should stop delivering after stop()', async () => {
      const received: string[] = []
      registry.register({
        name: 'l1',
        subscribes: 'cron.fire',
        async handle(entry) { received.push(entry.payload.jobId) },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'before', jobName: 'x', payload: 'p' })
      await flush()

      await registry.stop()

      await eventLog.append('cron.fire', { jobId: 'after', jobName: 'x', payload: 'p' })
      await flush()

      expect(received).toEqual(['before'])
    })

    it('should deliver to multiple listeners on same event type', async () => {
      const a: string[] = []
      const b: string[] = []
      registry.register({
        name: 'a',
        subscribes: 'cron.fire',
        async handle(entry) { a.push(entry.payload.jobId) },
      })
      registry.register({
        name: 'b',
        subscribes: 'cron.fire',
        async handle(entry) { b.push(entry.payload.jobId) },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await flush()

      expect(a).toEqual(['j1'])
      expect(b).toEqual(['j1'])
    })

    it('should subscribe listener registered after start()', async () => {
      await registry.start()

      const received: string[] = []
      registry.register({
        name: 'late',
        subscribes: 'cron.fire',
        async handle(entry) { received.push(entry.payload.jobId) },
      })

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await flush()

      expect(received).toEqual(['j1'])
    })
  })

  // ==================== error isolation ====================

  describe('error isolation', () => {
    it('should not affect other listeners when one throws', async () => {
      const received: string[] = []
      registry.register({
        name: 'boom',
        subscribes: 'cron.fire',
        async handle() { throw new Error('boom') },
      })
      registry.register({
        name: 'ok',
        subscribes: 'cron.fire',
        async handle(entry) { received.push(entry.payload.jobId) },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await flush()

      expect(received).toEqual(['j1'])
    })

    it('should continue accepting events after a handle() error', async () => {
      const received: string[] = []
      let first = true
      registry.register({
        name: 'flaky',
        subscribes: 'cron.fire',
        async handle(entry) {
          if (first) { first = false; throw new Error('first one fails') }
          received.push(entry.payload.jobId)
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await flush()
      await eventLog.append('cron.fire', { jobId: 'j2', jobName: 'x', payload: 'p' })
      await flush()

      expect(received).toEqual(['j2'])
    })
  })

  // ==================== ctx.emit ====================

  describe('ctx.emit', () => {
    it('should allow emitting declared types and auto-set causedBy', async () => {
      registry.register({
        name: 'cron-echo',
        subscribes: 'cron.fire',
        emits: ['agent.work.done'] as const,
        async handle(_entry, ctx) {
          await ctx.emit('agent.work.done', {
            source: 'cron',
            reply: 'ok',
            durationMs: 10,
            delivered: true,
          })
        },
      })
      await registry.start()

      const parent = await eventLog.append('cron.fire', {
        jobId: 'j1', jobName: 'x', payload: 'p',
      })
      await flush()

      const done = eventLog.recent({ type: 'agent.work.done' })
      expect(done).toHaveLength(1)
      expect(done[0].causedBy).toBe(parent.seq)
      expect(done[0].payload).toMatchObject({ source: 'cron', reply: 'ok' })
    })

    it('should reject emit of un-declared event type at runtime', async () => {
      const errors: unknown[] = []
      const origErr = console.error
      console.error = (...a: unknown[]) => { errors.push(a) }
      try {
        registry.register({
          name: 'naughty',
          subscribes: 'cron.fire',
          emits: ['agent.work.done'] as const,
          async handle(_entry, ctx) {
            // Cast past the type system to simulate a misuse
            await (ctx.emit as unknown as (t: string, p: unknown) => Promise<unknown>)(
              'message.sent',
              { channel: 'web', to: 'x', prompt: 'p', reply: 'r', durationMs: 0 },
            )
          },
        })
        await registry.start()

        await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
        await flush()

        // Error was caught by registry's error isolation and logged
        expect(errors.length).toBeGreaterThan(0)
        const msg = String((errors[0] as unknown[])[1])
        expect(msg).toMatch(/naughty.*message\.sent.*declared emits.*agent\.work\.done/)
      } finally {
        console.error = origErr
      }
    })

    it('should reject all emit calls when listener has no emits declared', async () => {
      const errors: unknown[] = []
      const origErr = console.error
      console.error = (...a: unknown[]) => { errors.push(a) }
      try {
        registry.register({
          name: 'silent',
          subscribes: 'cron.fire',
          async handle(_entry, ctx) {
            await (ctx.emit as unknown as (t: string, p: unknown) => Promise<unknown>)(
              'agent.work.done',
              { source: 'cron', reply: '', durationMs: 0, delivered: false },
            )
          },
        })
        await registry.start()

        await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
        await flush()

        expect(errors.length).toBeGreaterThan(0)
        const msg = String((errors[0] as unknown[])[1])
        expect(msg).toMatch(/silent.*declared emits: \(none\)/)
      } finally {
        console.error = origErr
      }
    })

    it('should allow overriding causedBy explicitly via opts', async () => {
      registry.register({
        name: 'cron-override',
        subscribes: 'cron.fire',
        emits: ['agent.work.done'] as const,
        async handle(_entry, ctx) {
          await ctx.emit(
            'agent.work.done',
            { source: 'cron', reply: 'ok', durationMs: 0, delivered: true },
            { causedBy: 999 },
          )
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await flush()

      const [done] = eventLog.recent({ type: 'agent.work.done' })
      expect(done.causedBy).toBe(999)
    })
  })

  // ==================== ctx.events ====================

  describe('ctx.events', () => {
    it('should expose read-only event log access', async () => {
      await eventLog.append('cron.fire', { jobId: 'older', jobName: 'x', payload: 'p' })

      let recentSeen: number | undefined
      registry.register({
        name: 'snoop',
        subscribes: 'cron.fire',
        async handle(_entry, ctx) {
          recentSeen = ctx.events.recent({ type: 'cron.fire' }).length
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'newer', jobName: 'x', payload: 'p' })
      await flush()

      expect(recentSeen).toBe(2)
    })
  })

  // ==================== multi-type subscribes ====================

  describe('multi-type subscribes', () => {
    it('should receive events from all types in the tuple', async () => {
      const received: string[] = []
      registry.register({
        name: 'multi',
        subscribes: ['cron.fire', 'message.received'] as const,
        async handle(entry) {
          received.push(entry.type)
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await eventLog.append('message.received', { channel: 'web', to: 'default', prompt: 'hi' })
      await flush()

      expect(received.sort()).toEqual(['cron.fire', 'message.received'])
    })

    it('should narrow entry.payload via discriminated union on entry.type', async () => {
      const seen: Record<string, unknown> = {}
      registry.register({
        name: 'narrow',
        subscribes: ['cron.fire', 'message.received'] as const,
        async handle(entry) {
          // This compiles only because narrowing via switch works
          switch (entry.type) {
            case 'cron.fire':
              seen.jobId = entry.payload.jobId
              break
            case 'message.received':
              seen.channel = entry.payload.channel
              break
          }
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      await eventLog.append('message.received', { channel: 'telegram', to: '123', prompt: 'hi' })
      await flush()

      expect(seen.jobId).toBe('j1')
      expect(seen.channel).toBe('telegram')
    })

    it('ctx.subscribes exposes the normalized array', async () => {
      let observed: readonly string[] = []
      registry.register({
        name: 'self-aware',
        subscribes: ['cron.fire', 'message.received'] as const,
        async handle(_entry, ctx) {
          observed = [...ctx.subscribes].sort()
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j', jobName: 'x', payload: 'p' })
      await flush()

      expect(observed).toEqual(['cron.fire', 'message.received'])
    })
  })

  // ==================== wildcard subscribes ====================

  describe("wildcard subscribes ('*')", () => {
    it('should receive every registered event type', async () => {
      const seenTypes = new Set<string>()
      registry.register({
        name: 'tap',
        subscribes: '*',
        async handle(entry) {
          seenTypes.add(entry.type)
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j', jobName: 'x', payload: 'p' })
      await eventLog.append('message.received', { channel: 'web', to: 'default', prompt: 'hi' })
      await eventLog.append('agent.work.skip', { source: 'heartbeat', reason: 'test' })
      await flush()

      expect(seenTypes.has('cron.fire')).toBe(true)
      expect(seenTypes.has('message.received')).toBe(true)
      expect(seenTypes.has('agent.work.skip')).toBe(true)
    })

    it('should ignore events not in AgentEventMap', async () => {
      const seenTypes = new Set<string>()
      registry.register({
        name: 'tap',
        subscribes: '*',
        async handle(entry) {
          seenTypes.add(entry.type)
        },
      })
      await registry.start()

      // Unregistered type bypasses validation via the fallback overload
      await eventLog.append('random.unregistered', { anything: true })
      await flush()

      expect(seenTypes.has('random.unregistered')).toBe(false)
    })
  })

  // ==================== wildcard emits ====================

  describe("wildcard emits ('*')", () => {
    it('should allow emitting any registered event type', async () => {
      registry.register({
        name: 'router',
        subscribes: 'cron.fire',
        emits: '*',
        async handle(_entry, ctx) {
          await ctx.emit('agent.work.done', {
            source: 'cron',
            reply: 'ok',
            durationMs: 1,
            delivered: true,
          })
        },
      })
      await registry.start()

      await eventLog.append('cron.fire', { jobId: 'j', jobName: 'x', payload: 'p' })
      await flush()

      const done = eventLog.recent({ type: 'agent.work.done' })
      expect(done).toHaveLength(1)
    })

    it('should reject emit of unregistered type even with wildcard emits', async () => {
      const errors: unknown[] = []
      const origErr = console.error
      console.error = (...a: unknown[]) => { errors.push(a) }
      try {
        registry.register({
          name: 'naughty',
          subscribes: 'cron.fire',
          emits: '*',
          async handle(_entry, ctx) {
            await (ctx.emit as unknown as (t: string, p: unknown) => Promise<unknown>)(
              'never.registered',
              { foo: 'bar' },
            )
          },
        })
        await registry.start()
        await eventLog.append('cron.fire', { jobId: 'j', jobName: 'x', payload: 'p' })
        await flush()

        expect(errors.length).toBeGreaterThan(0)
        const msg = String((errors[0] as unknown[])[1])
        expect(msg).toMatch(/naughty.*unregistered type/)
      } finally {
        console.error = origErr
      }
    })
  })

  // ==================== declareProducer ====================

  describe('declareProducer', () => {
    it('declares a producer and lists it', () => {
      const handle = registry.declareProducer({
        name: 'cron-engine',
        emits: ['cron.fire'] as const,
      })
      expect(handle.name).toBe('cron-engine')
      expect([...handle.emits]).toEqual(['cron.fire'])

      const producers = registry.listProducers()
      expect(producers).toHaveLength(1)
      expect(producers[0]).toEqual({
        name: 'cron-engine',
        emits: ['cron.fire'],
        emitsWildcard: false,
      })
    })

    it('producer emit writes through to the event log', async () => {
      const handle = registry.declareProducer({
        name: 'cron-engine',
        emits: ['cron.fire'] as const,
      })
      const entry = await handle.emit('cron.fire', { jobId: 'j1', jobName: 'x', payload: 'p' })
      expect(entry.type).toBe('cron.fire')
      expect(entry.seq).toBeGreaterThan(0)
    })

    it('rejects emit for undeclared types at runtime', async () => {
      const handle = registry.declareProducer({
        name: 'cron-engine',
        emits: ['cron.fire'] as const,
      })
      await expect(
        (handle.emit as unknown as (t: string, p: unknown) => Promise<unknown>)(
          'agent.work.done',
          { source: 'cron', reply: 'x', durationMs: 1, delivered: false },
        ),
      ).rejects.toThrow(/cron-engine.*declared emits/)
    })

    it('wildcard producer accepts any registered type but rejects unregistered', async () => {
      const handle = registry.declareProducer({
        name: 'universal',
        emits: '*',
      })
      await (handle.emit as unknown as (t: string, p: unknown) => Promise<unknown>)(
        'cron.fire',
        { jobId: 'j', jobName: 'x', payload: 'p' },
      )
      await expect(
        (handle.emit as unknown as (t: string, p: unknown) => Promise<unknown>)(
          'not.a.real.event',
          { foo: 'bar' },
        ),
      ).rejects.toThrow(/universal.*unregistered type/)
    })

    it('throws on name collision with a listener', () => {
      registry.register({
        name: 'conflict',
        subscribes: 'cron.fire',
        async handle() { /* no-op */ },
      })
      expect(() =>
        registry.declareProducer({ name: 'conflict', emits: ['cron.fire'] as const }),
      ).toThrow(/already registered as a listener/)
    })

    it('throws on name collision with another producer', () => {
      registry.declareProducer({ name: 'p1', emits: ['cron.fire'] as const })
      expect(() =>
        registry.declareProducer({ name: 'p1', emits: ['cron.fire'] as const }),
      ).toThrow(/already registered as a producer/)
    })

    it('register() throws if name already taken by a producer', () => {
      registry.declareProducer({ name: 'cron-engine', emits: ['cron.fire'] as const })
      expect(() =>
        registry.register({
          name: 'cron-engine',
          subscribes: 'cron.fire',
          async handle() { /* no-op */ },
        }),
      ).toThrow(/already registered as a producer/)
    })

    it('dispose() removes the producer and frees the name', () => {
      const handle = registry.declareProducer({
        name: 'cron-engine',
        emits: ['cron.fire'] as const,
      })
      expect(registry.listProducers()).toHaveLength(1)
      handle.dispose()
      expect(registry.listProducers()).toHaveLength(0)

      // Name is free again — can re-declare (or register as listener)
      registry.declareProducer({ name: 'cron-engine', emits: ['cron.fire'] as const })
      expect(registry.listProducers()).toHaveLength(1)
    })

    it('producer emit does not auto-fill causedBy', async () => {
      const handle = registry.declareProducer({
        name: 'cron-engine',
        emits: ['cron.fire'] as const,
      })
      const entry = await handle.emit('cron.fire', { jobId: 'j', jobName: 'x', payload: 'p' })
      expect(entry.causedBy).toBeUndefined()
    })
  })
})
