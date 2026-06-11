/**
 * TradovateBroker — IBroker adapter for Tradovate (futures + options-on-futures).
 *
 * PHASE 1 SCAFFOLD. The order/account/position REST flow is wired against
 * Tradovate's documented v1 API (demo + live hosts); the live market-data
 * pieces (real-time quotes, historical bars, session clock) ride Tradovate's
 * separate market-data WebSocket and are deferred to Phase 2 — they raise a
 * clear BrokerError rather than returning misleading data. Nothing here is
 * exercised against a real account until the user supplies DEMO credentials.
 *
 * Takes IBKR Order objects, reads the fields Tradovate understands, ignores
 * the rest — same contract as the Alpaca/IBKR adapters.
 */

import { z } from 'zod'
import Decimal from 'decimal.js'
import { Contract, ContractDescription, ContractDetails, Order, OrderState, UNSET_DECIMAL } from '@traderalice/ibkr'
import {
  BrokerError,
  type IBroker,
  type AccountCapabilities,
  type AccountInfo,
  type Position,
  type PlaceOrderResult,
  type OpenOrder,
  type Quote,
  type MarketClock,
  type BrokerConfigField,
  type TpSlParams,
} from '../types.js'
import '../../contract-ext.js'
import type {
  TradovateBrokerConfig,
  TradovateAuthResponse,
  TradovateAccountRaw,
  TradovateCashBalanceRaw,
  TradovatePositionRaw,
  TradovateOrderRaw,
  TradovateContractRaw,
  TradovatePlaceOrderResponse,
} from './tradovate-types.js'
import {
  makeFuturesContract,
  resolveSymbol,
  mapOrderAction,
  mapOrderType,
  mapTimeInForce,
  makeOrderState,
} from './tradovate-contracts.js'
import { buildPosition } from '../contract-builder.js'

const DEMO_BASE = 'https://demo.tradovateapi.com/v1'
const LIVE_BASE = 'https://live.tradovateapi.com/v1'

/** Phase-2 marker for market-data paths that need the Tradovate MD websocket. */
function marketDataNotYet(what: string): never {
  throw new BrokerError(
    'CONFIG',
    `Tradovate ${what} requires the market-data websocket — wired in Phase 2. ` +
      `Order, position, and account flows are available now.`,
  )
}

export class TradovateBroker implements IBroker {
  // ---- Self-registration ----

  static configSchema = z.object({
    username: z.string(),
    password: z.string(),
    appId: z.string(),
    appVersion: z.string().default('1.0'),
    cid: z.string(),
    sec: z.string(),
    demo: z.boolean().default(true),
  })

  static configFields: BrokerConfigField[] = [
    { name: 'username', type: 'text', label: 'Username', required: true },
    { name: 'password', type: 'password', label: 'Password', required: true, sensitive: true },
    { name: 'appId', type: 'text', label: 'App ID', required: true },
    { name: 'appVersion', type: 'text', label: 'App Version', default: '1.0' },
    { name: 'cid', type: 'text', label: 'API Client ID', required: true },
    { name: 'sec', type: 'password', label: 'API Secret', required: true, sensitive: true },
    { name: 'demo', type: 'boolean', label: 'Demo (simulation)', default: true, description: 'When enabled, routes to Tradovate\'s demo host — no real money.' },
  ]

  static fromConfig(config: { id: string; label?: string; brokerConfig: Record<string, unknown> }): TradovateBroker {
    const bc = TradovateBroker.configSchema.parse(config.brokerConfig)
    return new TradovateBroker({
      id: config.id,
      label: config.label,
      username: bc.username,
      password: bc.password,
      appId: bc.appId,
      appVersion: bc.appVersion,
      cid: bc.cid,
      sec: bc.sec,
      demo: bc.demo,
    })
  }

  // ---- Instance ----

  readonly id: string
  readonly label: string

  private readonly config: TradovateBrokerConfig
  /** Injectable for tests; defaults to the global fetch. */
  private readonly fetchImpl: typeof fetch

  private accessToken?: string
  private tokenExpiresAt = 0
  /** Resolved at init() from /account/list — the account orders route against. */
  private accountId?: number
  private accountSpec?: string

  constructor(config: TradovateBrokerConfig, fetchImpl: typeof fetch = globalThis.fetch) {
    this.config = config
    this.fetchImpl = fetchImpl
    this.id = config.id ?? (config.demo ? 'tradovate-demo' : 'tradovate-live')
    this.label = config.label ?? (config.demo ? 'Tradovate Demo' : 'Tradovate Live')
  }

  private get baseUrl(): string {
    return this.config.demo ? DEMO_BASE : LIVE_BASE
  }

  // ---- HTTP ----

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (auth) {
      await this.ensureToken()
      headers.authorization = `Bearer ${this.accessToken}`
    }
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      throw BrokerError.from(err)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw BrokerError.from(new Error(`Tradovate ${res.status} ${path}: ${text}`))
    }
    return res.json() as Promise<T>
  }

  /** Acquire or refresh the access token. Tokens are short-lived; renew with a 60s margin. */
  private async ensureToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return
    const auth = await this.request<TradovateAuthResponse>(
      'POST',
      '/auth/accesstokenrequest',
      {
        name: this.config.username,
        password: this.config.password,
        appId: this.config.appId,
        appVersion: this.config.appVersion,
        cid: this.config.cid,
        sec: this.config.sec,
      },
      false,
    )
    if (!auth.accessToken) {
      throw new BrokerError('AUTH', `Tradovate auth failed: ${auth.errorText ?? 'no access token returned'}`)
    }
    this.accessToken = auth.accessToken
    this.tokenExpiresAt = auth.expirationTime ? new Date(auth.expirationTime).getTime() : Date.now() + 60_000
  }

  // ---- Lifecycle ----

  async init(): Promise<void> {
    if (!this.config.username || !this.config.sec) {
      throw new BrokerError('CONFIG', 'No Tradovate credentials configured (username + API secret required).')
    }
    await this.ensureToken()
    const accounts = await this.request<TradovateAccountRaw[]>('GET', '/account/list')
    const account = accounts.find(a => a.active !== false) ?? accounts[0]
    if (!account) {
      throw new BrokerError('CONFIG', 'Tradovate returned no accounts for these credentials.')
    }
    this.accountId = account.id
    this.accountSpec = account.name
    console.log(`TradovateBroker[${this.id}]: connected (demo=${this.config.demo}, account=${account.name})`)
  }

  async close(): Promise<void> {
    // Tradovate REST is stateless; nothing to tear down until the Phase 2
    // market-data websocket lands.
    this.accessToken = undefined
  }

  // ---- Contract search ----

  async searchContracts(pattern: string): Promise<ContractDescription[]> {
    if (!pattern) return []
    const rows = await this.request<TradovateContractRaw[]>(
      'GET',
      `/contract/suggest?t=${encodeURIComponent(pattern)}&l=20`,
    )
    const out: ContractDescription[] = []
    for (const row of rows) {
      try {
        const desc = new ContractDescription()
        desc.contract = makeFuturesContract(row.name)
        out.push(desc)
      } catch {
        // Skip names we can't parse into a dated contract (e.g. continuous roots).
      }
    }
    return out
  }

  async getContractDetails(query: Contract): Promise<ContractDetails | null> {
    const symbol = resolveSymbol(query)
    if (!symbol) return null
    const details = new ContractDetails()
    details.contract = makeFuturesContract(symbol)
    details.orderTypes = 'MKT,LMT,STP,STP LMT'
    return details
  }

  // ---- Trading operations ----

  async placeOrder(contract: Contract, order: Order, tpsl?: TpSlParams): Promise<PlaceOrderResult> {
    const symbol = resolveSymbol(contract)
    if (!symbol) return { success: false, error: 'Cannot resolve contract to Tradovate symbol' }
    if (tpsl?.takeProfit || tpsl?.stopLoss) {
      // Bracket/OSO orders use a different Tradovate endpoint — Phase 2.
      return { success: false, error: 'Tradovate bracket (TP/SL) orders are not wired yet (Phase 2).' }
    }

    try {
      const payload: Record<string, unknown> = {
        accountId: this.accountId,
        accountSpec: this.accountSpec,
        symbol,
        action: mapOrderAction(order.action),
        orderQty: order.totalQuantity.equals(UNSET_DECIMAL) ? 1 : order.totalQuantity.toNumber(),
        orderType: mapOrderType(order.orderType),
        timeInForce: mapTimeInForce(order.tif),
        isAutomated: true,
      }
      if (!order.lmtPrice.equals(UNSET_DECIMAL)) payload.price = order.lmtPrice.toNumber()
      if (!order.auxPrice.equals(UNSET_DECIMAL)) payload.stopPrice = order.auxPrice.toNumber()

      const result = await this.request<TradovatePlaceOrderResponse>('POST', '/order/placeorder', payload)
      if (result.failureReason) {
        return { success: false, error: result.failureText ?? result.failureReason }
      }
      const orderState = new OrderState()
      orderState.status = 'Submitted'
      return { success: true, orderId: result.orderId != null ? String(result.orderId) : undefined, orderState }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async modifyOrder(orderId: string, changes: Partial<Order>): Promise<PlaceOrderResult> {
    try {
      const payload: Record<string, unknown> = { orderId: Number(orderId) }
      if (changes.totalQuantity != null && !changes.totalQuantity.equals(UNSET_DECIMAL)) payload.orderQty = changes.totalQuantity.toNumber()
      if (changes.lmtPrice != null && !changes.lmtPrice.equals(UNSET_DECIMAL)) payload.price = changes.lmtPrice.toNumber()
      if (changes.auxPrice != null && !changes.auxPrice.equals(UNSET_DECIMAL)) payload.stopPrice = changes.auxPrice.toNumber()
      if (changes.tif) payload.timeInForce = mapTimeInForce(changes.tif)

      const result = await this.request<TradovatePlaceOrderResponse>('POST', '/order/modifyorder', payload)
      if (result.failureReason) {
        return { success: false, error: result.failureText ?? result.failureReason }
      }
      const orderState = new OrderState()
      orderState.status = 'Submitted'
      return { success: true, orderId, orderState }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async cancelOrder(orderId: string): Promise<PlaceOrderResult> {
    try {
      await this.request<TradovatePlaceOrderResponse>('POST', '/order/cancelorder', { orderId: Number(orderId) })
      const orderState = new OrderState()
      orderState.status = 'Cancelled'
      return { success: true, orderId, orderState }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async closePosition(contract: Contract, quantity?: Decimal): Promise<PlaceOrderResult> {
    const symbol = resolveSymbol(contract)
    if (!symbol) return { success: false, error: 'Cannot resolve contract to Tradovate symbol' }

    const positions = await this.getPositions()
    const pos = positions.find(p => resolveSymbol(p.contract) === symbol)
    if (!pos) return { success: false, error: `No open Tradovate position for ${symbol}` }

    const order = new Order()
    order.action = pos.side === 'long' ? 'SELL' : 'BUY'
    order.orderType = 'MKT'
    order.totalQuantity = quantity ?? pos.quantity.abs()
    order.tif = 'DAY'
    return this.placeOrder(contract, order)
  }

  // ---- Queries ----

  async getAccount(): Promise<AccountInfo> {
    try {
      const balances = await this.request<TradovateCashBalanceRaw[]>('GET', '/cashBalance/list')
      const mine = balances.filter(b => b.accountId === this.accountId)
      const latest = mine.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
      const cash = latest ? new Decimal(latest.amount) : new Decimal(0)
      const realized = latest?.realizedPnL != null ? new Decimal(latest.realizedPnL) : new Decimal(0)
      return {
        baseCurrency: 'USD',
        netLiquidation: cash.toString(),
        totalCashValue: cash.toString(),
        unrealizedPnL: '0',
        realizedPnL: realized.toString(),
      }
    } catch (err) {
      throw BrokerError.from(err)
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const raw = await this.request<TradovatePositionRaw[]>('GET', '/position/list')
      const mine = raw.filter(p => p.accountId === this.accountId && p.netPos !== 0)
      const contracts = await this.resolveContractNames(mine.map(p => p.contractId))
      return mine.map((p) => {
        const name = contracts.get(p.contractId) ?? String(p.contractId)
        const contract = this.safeContract(name)
        const qty = new Decimal(Math.abs(p.netPos))
        return buildPosition({
          contract,
          currency: 'USD',
          side: p.netPos > 0 ? 'long' : 'short',
          quantity: qty,
          avgCost: p.netPrice != null ? new Decimal(p.netPrice).toString() : '0',
          // Live mark/unrealized PnL needs the MD websocket — Phase 2. Mark at
          // entry for now so position math stays consistent rather than wrong.
          marketPrice: p.netPrice != null ? new Decimal(p.netPrice).toString() : '0',
          realizedPnL: '0',
          multiplier: contract.multiplier || '1',
        })
      })
    } catch (err) {
      throw BrokerError.from(err)
    }
  }

  async getOrders(orderIds: string[]): Promise<OpenOrder[]> {
    const out: OpenOrder[] = []
    for (const id of orderIds) {
      const o = await this.getOrder(id)
      if (o) out.push(o)
    }
    return out
  }

  async getOrder(orderId: string): Promise<OpenOrder | null> {
    try {
      const raw = await this.request<TradovateOrderRaw>('GET', `/order/item?id=${encodeURIComponent(orderId)}`)
      const contracts = await this.resolveContractNames([raw.contractId])
      const name = contracts.get(raw.contractId) ?? String(raw.contractId)
      const contract = this.safeContract(name)

      const order = new Order()
      order.action = raw.action.toUpperCase()
      order.orderType = (raw.orderType ?? 'Market').toUpperCase()
      if (raw.price != null) order.lmtPrice = new Decimal(raw.price)
      if (raw.stopPrice != null) order.auxPrice = new Decimal(raw.stopPrice)
      if (raw.timeInForce) order.tif = raw.timeInForce.toUpperCase()
      order.orderId = 0 // Tradovate ids are numeric strings carried via OpenOrder, not IBKR's numeric orderId

      return { contract, order, orderState: makeOrderState(raw.ordStatus, raw.text) }
    } catch {
      return null
    }
  }

  async getQuote(_contract: Contract): Promise<Quote> {
    return marketDataNotYet('live quotes')
  }

  async getMarketClock(): Promise<MarketClock> {
    return marketDataNotYet('the session clock')
  }

  // ---- Capabilities ----

  getCapabilities(): AccountCapabilities {
    return {
      supportedSecTypes: ['FUT', 'FOP'],
      supportedOrderTypes: ['MKT', 'LMT', 'STP', 'STP LMT'],
      // No historicalBars capability declared — getHistorical is intentionally
      // unimplemented until the Phase 2 market-data feed lands.
    }
  }

  // ---- Contract identity ----

  getNativeKey(contract: Contract): string {
    return resolveSymbol(contract) ?? contract.symbol
  }

  resolveNativeKey(nativeKey: string): Contract {
    return makeFuturesContract(nativeKey)
  }

  // ---- Internal ----

  /** Build a contract from a Tradovate name, tolerating unparseable names. */
  private safeContract(name: string): Contract {
    try {
      return makeFuturesContract(name)
    } catch {
      // Fallback for names we can't yet parse (continuous roots, contractId
      // strings) — a minimally-populated contract so callers don't crash.
      // Phase 2 resolves these via Tradovate /contract metadata.
      const c = new Contract()
      c.symbol = name
      c.secType = 'FUT'
      c.exchange = 'CME'
      c.currency = 'USD'
      c.localSymbol = name
      c.multiplier = '1'
      return c
    }
  }

  /** Resolve a set of Tradovate contractIds to their dated names. */
  private async resolveContractNames(ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>()
    const unique = [...new Set(ids)]
    await Promise.all(unique.map(async (id) => {
      try {
        const c = await this.request<TradovateContractRaw>('GET', `/contract/item?id=${id}`)
        if (c?.name) map.set(id, c.name)
      } catch {
        // Leave unresolved — caller falls back to the numeric id.
      }
    }))
    return map
  }
}
