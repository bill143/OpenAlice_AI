/**
 * Contract resolution helpers for Tradovate (futures + options-on-futures).
 *
 * Pure, side-effect-free functions — unit-tested without any network. The
 * live-data pieces (real multipliers, exchange, expiry day) get filled from
 * Tradovate's /contract metadata in Phase 2; Phase 1 derives what it can from
 * the contract NAME (e.g. "ESM6" → ES, June 2026) and falls back to safe
 * defaults otherwise.
 */

import { Contract, OrderState } from '@traderalice/ibkr'
import '../../contract-ext.js'
import { buildContract } from '../contract-builder.js'
import { BrokerError } from '../types.js'

/** CME-style month codes → 1-based calendar month. */
const MONTH_CODE: Record<string, number> = {
  F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12,
}

/**
 * Best-known contract multipliers by product root. Phase 2 replaces this with
 * the authoritative value from Tradovate's /contract metadata; until then a
 * known root resolves correctly and an unknown one defaults to '1' (non-empty,
 * so contract validation still passes).
 */
const FUTURES_MULTIPLIER: Record<string, string> = {
  ES: '50', MES: '5', NQ: '20', MNQ: '2', YM: '5', MYM: '0.5',
  RTY: '50', M2K: '5', CL: '1000', MCL: '100', GC: '100', MGC: '10',
  SI: '5000', HG: '25000', NG: '10000', ZB: '1000', ZN: '1000',
  ZF: '1000', ZT: '2000', '6E': '125000', '6J': '12500000', '6B': '62500',
}

/** Default listing exchange when we can't resolve it from metadata yet. */
const DEFAULT_FUTURES_EXCHANGE = 'CME'

export interface ParsedFuturesSymbol {
  /** Product root, e.g. "ES". */
  root: string
  /** IBKR-style YYYYMM expiry, e.g. "202606". */
  contractMonth: string
}

/**
 * Parse a Tradovate dated futures name like "ESM6" into its root and a
 * YYYYMM contract month. Returns null when the name isn't a recognizable
 * dated contract (e.g. a bare root or an unexpected format).
 *
 * Year resolution: Tradovate names carry a single year digit. We resolve it
 * to the nearest non-past year so "M6" in 2026 → 2026, and "M5" in 2029 →
 * 2035 rather than 2025. `now` is injectable for deterministic tests.
 */
export function parseFuturesSymbol(name: string, now: Date = new Date()): ParsedFuturesSymbol | null {
  const m = /^([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{1,2})$/.exec(name.toUpperCase())
  if (!m) return null
  const [, root, monthCode, yearDigits] = m
  const month = MONTH_CODE[monthCode]
  if (!month) return null

  let year: number
  if (yearDigits.length >= 2) {
    year = 2000 + Number(yearDigits.slice(-2))
  } else {
    const decadeBase = Math.floor(now.getUTCFullYear() / 10) * 10
    year = decadeBase + Number(yearDigits)
    // Roll forward a decade if the resolved year is meaningfully in the past.
    if (year < now.getUTCFullYear() - 1) year += 10
  }
  return { root, contractMonth: `${year}${String(month).padStart(2, '0')}` }
}

/** Multiplier for a product root (falls back to '1' for unknown roots). */
export function multiplierForRoot(root: string): string {
  return FUTURES_MULTIPLIER[root.toUpperCase()] ?? '1'
}

/**
 * Build a fully-qualified futures Contract from a Tradovate dated name.
 * Throws a BrokerError for names that aren't recognizable dated contracts —
 * nativeKeys always come from `getNativeKey`, which emits valid names, so a
 * throw here signals genuinely bad input rather than a routine miss.
 */
export function makeFuturesContract(name: string, opts: { exchange?: string; now?: Date } = {}): Contract {
  const parsed = parseFuturesSymbol(name, opts.now)
  if (!parsed) {
    throw new BrokerError(
      'CONFIG',
      `Unrecognized Tradovate futures symbol "${name}" — expected a dated contract like "ESM6".`,
    )
  }
  return buildContract({
    symbol: parsed.root,
    secType: 'FUT',
    exchange: opts.exchange ?? DEFAULT_FUTURES_EXCHANGE,
    currency: 'USD',
    localSymbol: name.toUpperCase(),
    lastTradeDateOrContractMonth: parsed.contractMonth,
    multiplier: multiplierForRoot(parsed.root),
  })
}

/**
 * Resolve a Contract back to the Tradovate symbol string used on the wire.
 * Tradovate keys instruments by the dated name (localSymbol), so prefer it
 * and fall back to symbol.
 */
export function resolveSymbol(contract: Contract): string | null {
  const name = contract.localSymbol || contract.symbol
  return name ? name.toUpperCase() : null
}

/** Map an IBKR order action to Tradovate's Buy/Sell. */
export function mapOrderAction(action: string): 'Buy' | 'Sell' {
  return action.toUpperCase() === 'SELL' ? 'Sell' : 'Buy'
}

/** Map an IBKR orderType code to Tradovate's order type string. */
export function mapOrderType(orderType: string): string {
  switch (orderType.toUpperCase()) {
    case 'MKT': return 'Market'
    case 'LMT': return 'Limit'
    case 'STP': return 'Stop'
    case 'STP LMT': return 'StopLimit'
    case 'TRAIL': return 'TrailingStop'
    default: return 'Market'
  }
}

/** Map an IBKR TIF code to Tradovate's timeInForce string. */
export function mapTimeInForce(tif: string): string {
  switch (tif.toUpperCase()) {
    case 'GTC': return 'GTC'
    case 'IOC': return 'IOC'
    case 'FOK': return 'FOK'
    case 'DAY':
    default: return 'Day'
  }
}

/** Map a Tradovate order status to an IBKR-style OrderState status string. */
export function mapTradovateOrderStatus(status: string): string {
  switch (status) {
    case 'Filled':
    case 'Completed':
      return 'Filled'
    case 'Working':
    case 'PendingNew':
    case 'Pending':
    case 'Suspended':
      return 'Submitted'
    case 'Canceled':
    case 'Expired':
      return 'Cancelled'
    case 'Rejected':
      return 'Inactive'
    default:
      return 'Submitted'
  }
}

/** Construct an IBKR OrderState from a Tradovate status string. */
export function makeOrderState(status: string, rejectReason?: string): OrderState {
  const s = new OrderState()
  s.status = mapTradovateOrderStatus(status)
  if (rejectReason) s.rejectReason = rejectReason
  return s
}
