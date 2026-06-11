/**
 * Real-network e2e — keyless CcxtBroker against live public exchanges (no API
 * key). Proves the whole keyless path: construct → init() WITHOUT credentials
 * (must not throw) → getHistorical → real OHLCV. Gated; does NOT mock ccxt.
 *
 *   Run:  CCXT_E2E=1 pnpm -F @traderalice/uta-service exec vitest run CcxtBroker.e2e
 */
import { describe, it, expect } from 'vitest'
import { CcxtBroker } from './CcxtBroker.js'
import { Contract } from '@traderalice/ibkr'

describe.skipIf(!process.env.CCXT_E2E)('CcxtBroker — keyless e2e (real exchange, no key)', () => {
  for (const exchange of ['binance', 'okx', 'bybit']) {
    it(`${exchange}: keyless init + getHistorical returns real bars`, async () => {
      const acc = new CcxtBroker({ exchange, keyless: true, sandbox: false })
      await acc.init() // no credentials — keyless must skip the credential check

      expect(acc.getCapabilities().historicalBars).toEqual({ supported: true, quality: 'realtime' })

      const c = new Contract()
      c.symbol = 'BTC'
      c.localSymbol = 'BTC/USDT'
      const bars = await acc.getHistorical(c, { interval: '1d', limit: 5 })

      expect(bars.length).toBeGreaterThan(0)
      expect(bars.length).toBeLessThanOrEqual(5)
      expect(typeof bars[0].close).toBe('string')
      expect(Number(bars[bars.length - 1].close)).toBeGreaterThan(0)
      // ascending by time
      const ts = bars.map((b) => b.timestamp.getTime())
      expect(ts).toEqual([...ts].sort((a, b) => a - b))
    }, 30_000)
  }
})
