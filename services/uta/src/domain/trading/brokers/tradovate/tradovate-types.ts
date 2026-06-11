/**
 * Tradovate adapter — config + raw API shapes.
 *
 * Phase 1 scaffold. The raw shapes mirror the subset of Tradovate's REST
 * responses (https://api.tradovate.com/) the adapter actually reads; fields
 * we don't consume are intentionally omitted rather than typed loosely.
 */

export interface TradovateBrokerConfig {
  id?: string
  label?: string
  /** Tradovate login email/username. */
  username: string
  /** Tradovate login password. */
  password: string
  /** Developer app id (from Tradovate API Access). */
  appId: string
  /** Developer app version string. */
  appVersion: string
  /** API client id (numeric, as string). */
  cid: string
  /** API client secret. */
  sec: string
  /** When true, route to the demo/simulation host (no real money). */
  demo: boolean
}

// ==================== Tradovate REST raw shapes ====================

export interface TradovateAuthResponse {
  accessToken?: string
  /** ISO timestamp at which the access token expires. */
  expirationTime?: string
  userId?: number
  name?: string
  hasLive?: boolean
  /** Present when auth failed (e.g. captcha / penalty / bad credentials). */
  errorText?: string
  /** Present when the request is throttled — seconds to wait before retry. */
  'p-ticket'?: string
  'p-time'?: number
}

export interface TradovateAccountRaw {
  id: number
  name: string
  userId: number
  accountType?: string
  active?: boolean
  /** 'Demo' | 'Live' */
  legalStatus?: string
}

export interface TradovateCashBalanceRaw {
  id: number
  accountId: number
  timestamp: string
  /** Net liquidation-ish cash balance in the account currency. */
  amount: number
  realizedPnL?: number
  weekendUsd?: number
  currencyId?: number
}

export interface TradovatePositionRaw {
  id: number
  accountId: number
  contractId: number
  timestamp: string
  /** Signed net position: >0 long, <0 short, 0 flat. */
  netPos: number
  /** Average entry price for the open position. */
  netPrice?: number
  bought?: number
  boughtValue?: number
  sold?: number
  soldValue?: number
}

export interface TradovateOrderRaw {
  id: number
  accountId: number
  contractId: number
  /** 'Buy' | 'Sell' */
  action: string
  /** 'Working' | 'Completed' | 'Canceled' | 'Rejected' | 'Filled' | ... */
  ordStatus: string
  /** 'Market' | 'Limit' | 'Stop' | 'StopLimit' | ... */
  orderType?: string
  price?: number
  stopPrice?: number
  /** 'Day' | 'GTC' | 'IOC' | 'FOK' */
  timeInForce?: string
  text?: string
}

export interface TradovateContractRaw {
  id: number
  /** Dated contract name, e.g. "ESM6". */
  name: string
  contractMaturityId?: number
  /** Product symbol root, e.g. "ES". */
  providerTickerSymbol?: string
}

/** Response from POST /order/placeorder and /order/modifyorder. */
export interface TradovatePlaceOrderResponse {
  orderId?: number
  failureReason?: string
  failureText?: string
}

/** Response from POST /order/cancelorder. */
export interface TradovateCancelOrderResponse {
  commandId?: number
  failureReason?: string
  failureText?: string
}
