/**
 * Aggregate Symbol Search
 *
 * Cross-asset-class heuristic search that respects Alice's per-asset-class
 * provider config. Used both by the AI tool (marketSearchForResearch) and the
 * HTTP route (/api/market/search) — both surfaces must return the same thing.
 *
 * equity    — SymbolIndex (SEC/TMX local cache, regex, zero-latency)
 * commodity — CommodityCatalog (canonical catalog, ~25 items)
 * crypto    — cryptoClient.search on yfinance (online fuzzy)
 * currency  — currencyClient.search on yfinance (online fuzzy, XXXUSD filter)
 */
import type { SymbolIndex } from './equity/symbol-index.js'
import type { CommodityCatalog } from './commodity/commodity-catalog.js'
import type { CryptoClientLike, CurrencyClientLike } from './client/types.js'

export type AssetClass = 'equity' | 'crypto' | 'currency' | 'commodity'

export interface MarketSearchDeps {
  symbolIndex: SymbolIndex
  cryptoClient: CryptoClientLike
  currencyClient: CurrencyClientLike
  commodityCatalog: CommodityCatalog
}

export interface MarketSearchResult {
  /** Equity / crypto / currency have a symbol; commodity uses `id` instead (canonical). */
  symbol?: string
  id?: string
  name?: string | null
  assetClass: AssetClass
  [key: string]: unknown
}

/**
 * Score a result against the query. Higher is better.
 * Tiers:
 *   100  exact match on symbol, id, or name (case-insensitive)
 *    90  exact match on a commodity alias (e.g. "xau" → gold)
 *    80  symbol/id starts with the query
 *    70  name starts with the query (at a word boundary)
 *    50  name contains the query as a whole word
 *    30  name contains the query as a substring
 *    10  fallback — matched upstream but nothing we can explain
 */
function matchScore(query: string, r: MarketSearchResult): number {
  const q = query.toLowerCase()
  const sym = String(r.symbol ?? r.id ?? '').toLowerCase()
  const name = String(r.name ?? '').toLowerCase()
  const aliases = Array.isArray(r.aliases) ? (r.aliases as string[]).map((a) => a.toLowerCase()) : []

  if (sym === q || name === q) return 100
  if (aliases.includes(q)) return 90
  if (sym && sym.startsWith(q)) return 80
  // Name starts with query only counts as a strong match when the match
  // ends at a word boundary — otherwise "gold" would rank "goldman" above
  // "SPDR gold trust".
  if (name.startsWith(q) && (name.length === q.length || !/[a-z0-9]/i.test(name[q.length]))) return 70
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name)) return 50
  if (name.includes(q)) return 30
  return 10
}

export async function aggregateSymbolSearch(
  deps: MarketSearchDeps,
  query: string,
  limit = 20,
): Promise<MarketSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const equityResults = deps.symbolIndex
    .search(q, limit)
    .map((r) => ({ ...r, assetClass: 'equity' as const }))

  const commodityResults = deps.commodityCatalog
    .search(q, limit)
    .map((r) => ({ ...r, assetClass: 'commodity' as const }))

  const [cryptoSettled, currencySettled] = await Promise.allSettled([
    deps.cryptoClient.search({ query: q, provider: 'yfinance' }),
    deps.currencyClient.search({ query: q, provider: 'yfinance' }),
  ])

  const cryptoResults = (cryptoSettled.status === 'fulfilled' ? cryptoSettled.value : []).map(
    (r) => ({ ...r, assetClass: 'crypto' as const }),
  )

  const currencyResults = (currencySettled.status === 'fulfilled' ? currencySettled.value : [])
    .filter((r) => {
      const sym = (r as Record<string, unknown>).symbol as string | undefined
      return sym?.endsWith('USD')
    })
    .map((r) => ({ ...r, assetClass: 'currency' as const }))

  const all: MarketSearchResult[] = [
    ...equityResults,
    ...cryptoResults,
    ...currencyResults,
    ...commodityResults,
  ]

  // Stable sort by match quality descending; ties keep upstream order.
  return all
    .map((r, i) => ({ r, i, s: matchScore(q, r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r)
}
