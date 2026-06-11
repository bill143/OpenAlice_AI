import type { EventLogEntry } from '../../api/types'

const REPORT_PUSH_MS = Date.now() - 5 * 60 * 1000

// Scripted historical events (what /api/events/recent returns). The SSE
// stream replays the most recent ones live for the "system is doing
// work" feel — see handlers/events.ts.
export const demoEvents: EventLogEntry[] = [
  {
    seq: 1,
    ts: REPORT_PUSH_MS - 4 * 60 * 1000,
    type: 'agent.work.started',
    payload: { workspaceId: 'demo-ws', sessionId: 'demo-session', agent: 'claude' },
  },
  {
    seq: 2,
    ts: REPORT_PUSH_MS - 3 * 60 * 1000,
    type: 'agent.tool_call',
    payload: { tool: 'read_file', path: 'data/news/aapl-q1-2026.md', status: 'ok' },
  },
  {
    seq: 3,
    ts: REPORT_PUSH_MS - 2 * 60 * 1000 - 30 * 1000,
    type: 'agent.tool_call',
    payload: { tool: 'read_file', path: 'data/sec/aapl/10-Q-Q1-2026.json', status: 'ok' },
  },
  {
    seq: 4,
    ts: REPORT_PUSH_MS - 90 * 1000,
    type: 'agent.tool_call',
    payload: { tool: 'write_file', path: 'research-AAPL-q1.md', status: 'ok' },
  },
  {
    seq: 5,
    ts: REPORT_PUSH_MS,
    type: 'inbox.entry_created',
    payload: { id: 'demo-inbox-aapl-q1', workspaceId: 'demo-ws', docs: ['research-AAPL-q1.md'] },
  },
  {
    seq: 6,
    ts: REPORT_PUSH_MS + 1000,
    type: 'agent.work.completed',
    payload: { workspaceId: 'demo-ws', sessionId: 'demo-session', durationMs: 248_000 },
  },
]

// Back-compat for the old singleton import in handlers/events.ts.
export const demoEvent: EventLogEntry = demoEvents[demoEvents.length - 1]
