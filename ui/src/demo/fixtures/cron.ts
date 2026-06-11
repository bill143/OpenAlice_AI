import type { CronJob } from '../../api/types'

const MIN_MS = 60_000
const HOUR_MS = 3_600_000
const now = Date.now()

export const demoCronJobs: CronJob[] = [
  {
    id: 'cron-morning-prep',
    name: 'Morning market prep',
    enabled: true,
    schedule: { kind: 'cron', cron: '30 8 * * 1-5' },
    payload: 'Read overnight news, run AAPL/NVDA/SPY pre-market summary, push to Inbox.',
    state: {
      nextRunAtMs: now + 4 * HOUR_MS,
      lastRunAtMs: now - 20 * HOUR_MS,
      lastStatus: 'ok',
      consecutiveErrors: 0,
    },
    createdAt: now - 14 * 24 * HOUR_MS,
  },
  {
    id: 'cron-eod-snapshot',
    name: 'EOD snapshot + journal',
    enabled: true,
    schedule: { kind: 'cron', cron: '5 16 * * 1-5' },
    payload: 'Snapshot all UTAs, compute day P&L, write a journal entry, push to Inbox.',
    state: {
      nextRunAtMs: now + 6 * HOUR_MS,
      lastRunAtMs: now - 18 * HOUR_MS,
      lastStatus: 'ok',
      consecutiveErrors: 0,
    },
    createdAt: now - 21 * 24 * HOUR_MS,
  },
  {
    id: 'cron-friday-review',
    name: 'Weekly position review',
    enabled: false,
    schedule: { kind: 'cron', cron: '0 17 * * 5' },
    payload: 'Review every open position, flag anything held > 30 days for re-evaluation.',
    state: {
      nextRunAtMs: null,
      lastRunAtMs: now - 7 * 24 * HOUR_MS,
      lastStatus: 'ok',
      consecutiveErrors: 0,
    },
    createdAt: now - 30 * 24 * HOUR_MS,
  },
  {
    id: 'cron-news-digest',
    name: 'AAPL watch alert',
    enabled: true,
    schedule: { kind: 'every', every: '15m' },
    payload: 'Tail RSS news collector for AAPL mentions, push significant items to Inbox.',
    state: {
      nextRunAtMs: now + 12 * MIN_MS,
      lastRunAtMs: now - 3 * MIN_MS,
      lastStatus: 'ok',
      consecutiveErrors: 0,
    },
    createdAt: now - 5 * 60 * MIN_MS,
  },
]
