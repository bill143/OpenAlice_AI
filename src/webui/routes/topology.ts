import { Hono } from 'hono'
import type { EngineContext } from '../../core/types.js'
import type { AgentEventMap } from '../../core/agent-event.js'
import { AgentEvents } from '../../core/agent-event.js'

/**
 * Topology routes: GET /
 *
 * Returns the static shape of the agent's event-driven nervous system:
 * every known event type (with `external` + optional `description`), every
 * declared producer (pure event source — no subscribes), and every registered
 * listener (with its subscribes set, declared emits, and wildcard flags).
 * The frontend uses this to render a DAG of Alice's async lifecycle.
 */
export function createTopologyRoutes(ctx: EngineContext) {
  const app = new Hono()

  app.get('/', (c) => {
    const eventTypes = (Object.keys(AgentEvents) as Array<keyof AgentEventMap>).map(
      (name) => ({
        name,
        external: AgentEvents[name].external === true,
        description: AgentEvents[name].description,
      }),
    )
    const listeners = ctx.listenerRegistry.list().map((l) => ({
      name: l.name,
      subscribes: [...l.subscribes],
      emits: [...l.emits],
      subscribesWildcard: l.subscribesWildcard,
      emitsWildcard: l.emitsWildcard,
    }))
    const producers = ctx.listenerRegistry.listProducers().map((p) => ({
      name: p.name,
      emits: [...p.emits],
      emitsWildcard: p.emitsWildcard,
    }))
    return c.json({ eventTypes, producers, listeners })
  })

  return app
}
