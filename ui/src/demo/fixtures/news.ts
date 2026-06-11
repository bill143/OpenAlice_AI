import type { NewsArticle } from '../../api/types'

const HOUR_MS = 3_600_000
const now = Date.now()

export const demoNewsArticles: NewsArticle[] = [
  {
    time: new Date(now - 0.5 * HOUR_MS).toISOString(),
    title: 'Apple Q1 services revenue grows 9.1%, slowest since 2019',
    content:
      'Apple reported Q1 FY26 results showing services revenue growth of +9.1% YoY — the slowest in over six years and the third consecutive quarterly deceleration. Headline EPS beat consensus at $1.65 vs $1.50 estimates, but analysts are focusing on the services margin trajectory.',
    source: 'Reuters',
    link: 'https://example.com/aapl-q1',
    categories: 'earnings',
  },
  {
    time: new Date(now - 2 * HOUR_MS).toISOString(),
    title: 'NVDA gains 2.8% on data center capex commentary',
    content:
      'Nvidia rallied after hyperscaler capex comments suggested continued demand through 2027. Microsoft, Meta, and Alphabet collectively guided to $200B+ in 2026 AI capex.',
    source: 'Bloomberg',
    link: 'https://example.com/nvda-capex',
    categories: 'markets',
  },
  {
    time: new Date(now - 4 * HOUR_MS).toISOString(),
    title: 'Fed minutes: 2026 cut path "data-dependent"',
    content:
      'May FOMC minutes echoed Chair Powell\'s post-meeting framing. No commitment on July cut; rate path remains data-dependent with attention on services CPI and shelter components.',
    source: 'WSJ',
    link: 'https://example.com/fomc-minutes',
    categories: 'macro',
  },
  {
    time: new Date(now - 8 * HOUR_MS).toISOString(),
    title: 'Bitcoin reclaims $66k as ETF flows turn positive',
    content:
      'Spot Bitcoin ETFs saw net inflows of $312M Tuesday, the largest single-day net add since April. BTC reclaimed the $66k handle into European close.',
    source: 'CoinDesk',
    link: 'https://example.com/btc-66k',
    categories: 'crypto',
  },
  {
    time: new Date(now - 14 * HOUR_MS).toISOString(),
    title: 'SPY closes at fresh record on broadening leadership',
    content:
      'S&P 500 ETF closed at $516.20, a new all-time high. Internals improved — 78% of constituents above their 50-day MA, up from 64% last week.',
    source: 'CNBC',
    link: 'https://example.com/spy-record',
    categories: 'markets',
  },
  {
    time: new Date(now - 22 * HOUR_MS).toISOString(),
    title: 'TLT under pressure as 10Y yield tests 4.60%',
    content:
      'Long-bond ETF TLT down 1.4% as the 10-year Treasury yield tested 4.60% intraday. May supply calendar and softer-than-expected demand at the 7Y auction cited.',
    source: 'Reuters',
    link: 'https://example.com/tlt-yields',
    categories: 'rates',
  },
]
