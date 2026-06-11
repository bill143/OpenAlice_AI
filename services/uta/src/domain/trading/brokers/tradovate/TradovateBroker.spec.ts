import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import { Order } from '@traderalice/ibkr'
import { TradovateBroker } from './TradovateBroker.js'
import {
  parseFuturesSymbol,
  multiplierForRoot,
  makeFuturesContract,
  mapOrderAction,
  mapOrderType,
  mapTimeInForce,
  mapTradovateOrderStatus,
} from './tradovate-contracts.js'
import '../../contract-ext.js'

const NOW = new Date('2026-06-01T00:00:00Z')

const DEMO_CONFIG = {
  username: 'u', password: 'p', appId: 'app', appVersion: '1.0',
  cid: '1', sec: 's', demo: true,
}

/**
 * Minimal fetch double — routes by path prefix and returns JSON. No network.
 * A route value can be a function of the parsed request body.
 */
function fakeFetch(routes: Record<string, unknown | ((body: unknown) => unknown)>): typeof fetch {
  return (async (url: string | URL, init?: { body?: string }) => {
    const path = String(url).replace(/^https?:\/\/[^/]+\/v1/, '').split('?')[0]
    const key = Object.keys(routes).find(k => path === k || path.startsWith(k))
    if (!key) return new Response('not found', { status: 404 })
    const body = init?.body ? JSON.parse(init.body) : undefined
    const v = routes[key]
    const data = typeof v === 'function' ? (v as (b: unknown) => unknown)(body) : v
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

const AUTH_OK = {
  '/auth/accesstokenrequest': { accessToken: 'tok', expirationTime: new Date(Date.now() + 3_600_000).toISOString() },
}

// ==================== Pure contract/order mapping ====================

describe('tradovate-contracts — parseFuturesSymbol', () => {
  it('parses a dated name into root + YYYYMM', () => {
    expect(parseFuturesSymbol('ESM6', NOW)).toEqual({ root: 'ES', contractMonth: '202606' })
    expect(parseFuturesSymbol('CLF7', NOW)).toEqual({ root: 'CL', contractMonth: '202701' })
  })

  it('accepts a two-digit year', () => {
    expect(parseFuturesSymbol('ESM26', NOW)).toEqual({ root: 'ES', contractMonth: '202606' })
  })

  it('returns null for non-dated / malformed names', () => {
    expect(parseFuturesSymbol('ES', NOW)).toBeNull()
    expect(parseFuturesSymbol('!!', NOW)).toBeNull()
  })
})

describe('tradovate-contracts — multipliers & contract build', () => {
  it('resolves known multipliers and defaults unknown to 1', () => {
    expect(multiplierForRoot('ES')).toBe('50')
    expect(multiplierForRoot('CL')).toBe('1000')
    expect(multiplierForRoot('ZZZ')).toBe('1')
  })

  it('builds a valid FUT contract from a dated name', () => {
    const c = makeFuturesContract('ESM6', { now: NOW })
    expect(c.secType).toBe('FUT')
    expect(c.symbol).toBe('ES')
    expect(c.localSymbol).toBe('ESM6')
    expect(c.multiplier).toBe('50')
    expect(c.lastTradeDateOrContractMonth).toBe('202606')
    expect(c.currency).toBe('USD')
  })

  it('throws on an unparseable symbol', () => {
    expect(() => makeFuturesContract('NOTACONTRACT!', { now: NOW })).toThrow(/Unrecognized Tradovate futures symbol/)
  })
})

describe('tradovate-contracts — order field maps', () => {
  it('maps actions, order types, TIF, and statuses', () => {
    expect(mapOrderAction('BUY')).toBe('Buy')
    expect(mapOrderAction('SELL')).toBe('Sell')
    expect(mapOrderType('MKT')).toBe('Market')
    expect(mapOrderType('LMT')).toBe('Limit')
    expect(mapOrderType('STP LMT')).toBe('StopLimit')
    expect(mapTimeInForce('GTC')).toBe('GTC')
    expect(mapTimeInForce('DAY')).toBe('Day')
    expect(mapTradovateOrderStatus('Filled')).toBe('Filled')
    expect(mapTradovateOrderStatus('Working')).toBe('Submitted')
    expect(mapTradovateOrderStatus('Canceled')).toBe('Cancelled')
    expect(mapTradovateOrderStatus('Rejected')).toBe('Inactive')
  })
})

// ==================== Broker — config, identity, capabilities ====================

describe('TradovateBroker — registration & identity', () => {
  it('fromConfig parses the engine config dict', () => {
    const b = TradovateBroker.fromConfig({
      id: 'tradovate-demo',
      brokerConfig: { username: 'u', password: 'p', appId: 'app', cid: '1', sec: 's', demo: true },
    })
    expect(b.id).toBe('tradovate-demo')
    expect(b.label).toBe('Tradovate Demo')
  })

  it('declares futures + options-on-futures capability', () => {
    const b = new TradovateBroker(DEMO_CONFIG)
    expect(b.getCapabilities().supportedSecTypes).toEqual(['FUT', 'FOP'])
  })

  it('round-trips a native key through a contract', () => {
    const b = new TradovateBroker(DEMO_CONFIG)
    const c = b.resolveNativeKey('ESM6')
    expect(b.getNativeKey(c)).toBe('ESM6')
  })

  it('market-data paths loudly defer to Phase 2', async () => {
    const b = new TradovateBroker(DEMO_CONFIG)
    await expect(b.getMarketClock()).rejects.toThrow(/Phase 2/)
  })
})

// ==================== Broker — REST flow against a fetch double ====================

describe('TradovateBroker — REST flow (mocked fetch)', () => {
  it('init() authenticates and resolves the active account', async () => {
    const b = new TradovateBroker(DEMO_CONFIG, fakeFetch({
      ...AUTH_OK,
      '/account/list': [{ id: 99, name: 'DEMO99', active: true }],
    }))
    await expect(b.init()).resolves.toBeUndefined()
  })

  it('getAccount() reports the latest cash balance for the account', async () => {
    const b = new TradovateBroker(DEMO_CONFIG, fakeFetch({
      ...AUTH_OK,
      '/account/list': [{ id: 99, name: 'DEMO99', active: true }],
      '/cashBalance/list': [
        { id: 1, accountId: 99, amount: 50000, timestamp: '2026-06-01T00:00:00Z' },
        { id: 2, accountId: 99, amount: 51000, realizedPnL: 1000, timestamp: '2026-06-02T00:00:00Z' },
      ],
    }))
    await b.init()
    const acct = await b.getAccount()
    expect(acct.netLiquidation).toBe('51000')
    expect(acct.realizedPnL).toBe('1000')
  })

  it('placeOrder() sends a Tradovate order and returns the order id', async () => {
    let sent: Record<string, unknown> | undefined
    const b = new TradovateBroker(DEMO_CONFIG, fakeFetch({
      ...AUTH_OK,
      '/order/placeorder': (body: unknown) => { sent = body as Record<string, unknown>; return { orderId: 123 } },
    }))
    const contract = makeFuturesContract('ESM6', { now: NOW })
    const order = new Order()
    order.action = 'BUY'
    order.orderType = 'MKT'
    order.totalQuantity = new Decimal(2)
    order.tif = 'DAY'

    const res = await b.placeOrder(contract, order)
    expect(res.success).toBe(true)
    expect(res.orderId).toBe('123')
    expect(sent).toMatchObject({ symbol: 'ESM6', action: 'Buy', orderType: 'Market', orderQty: 2 })
  })

  it('placeOrder() surfaces a Tradovate rejection', async () => {
    const b = new TradovateBroker(DEMO_CONFIG, fakeFetch({
      ...AUTH_OK,
      '/order/placeorder': { failureReason: 'InsufficientFunds', failureText: 'Not enough margin' },
    }))
    const contract = makeFuturesContract('ESM6', { now: NOW })
    const order = new Order()
    order.action = 'BUY'
    order.orderType = 'MKT'
    order.totalQuantity = new Decimal(1)
    order.tif = 'DAY'

    const res = await b.placeOrder(contract, order)
    expect(res.success).toBe(false)
    expect(res.error).toBe('Not enough margin')
  })

  it('cancelOrder() posts the cancel and reports Cancelled', async () => {
    const b = new TradovateBroker(DEMO_CONFIG, fakeFetch({
      ...AUTH_OK,
      '/order/cancelorder': { commandId: 5 },
    }))
    const res = await b.cancelOrder('123')
    expect(res.success).toBe(true)
    expect(res.orderState?.status).toBe('Cancelled')
  })
})
