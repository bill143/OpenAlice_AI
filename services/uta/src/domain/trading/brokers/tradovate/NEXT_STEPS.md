# Tradovate connector — what's next (Phase 2)

Phase 1 (shipped) is the scaffold: a `TradovateBroker` implementing the full
`IBroker` interface, registered in the engine registry + preset catalog, with
the order / account / position REST flow wired and unit-tested against a fetch
double. It defaults to Tradovate's **demo** host and wires **no** live trading.

Phase 2 turns the scaffold into a working, verified paper-trading connector.

## Work items (in suggested order)

1. **Connect it to the live demo simulator.**
   - Create a free Tradovate demo account and generate API credentials
     (Tradovate → Application Settings → API Access: `appId`, `cid`, `sec`).
   - Add a "Tradovate (Demo)" account in Settings, keep the toggle on **Demo**.
   - Verify `init()` authenticates and resolves the account end-to-end.

2. **Market-data WebSocket** (the main Phase-1 deferral).
   - Implement the `wss://md-demo.tradovateapi.com/v1/websocket` feed.
   - Replace the Phase-2 stubs in `TradovateBroker.ts`:
     - `getQuote()` — real-time bid/ask/last.
     - `getMarketClock()` — session open/close from product trading hours.
     - `getHistorical()` + a `historicalBars` capability — OHLCV bars.
   - These currently raise a clear `BrokerError` (search `marketDataNotYet`).

3. **Authoritative contract metadata.**
   - In `tradovate-contracts.ts`, the multiplier comes from a small static map
     (`FUTURES_MULTIPLIER`) and the exchange defaults to `CME`. Replace both
     with the real values from Tradovate's `/contract` + `/product` endpoints
     so every product (not just the well-known roots) resolves correctly.
   - Fill the exact expiry day (currently YYYYMM only) from the contract's
     maturity record.

4. **Streaming fills & order state.**
   - Subscribe to order/fill events so positions and order status update live,
     instead of only on poll. Feed `avgFillPrice` through `OpenOrder`.

5. **Bracket / TP-SL orders.**
   - `placeOrder()` currently rejects `tpsl` with a Phase-2 message. Wire
     Tradovate's OSO/OCO order endpoints to support take-profit / stop-loss.

6. **Options-on-futures (FOP).**
   - Capability already declares `FOP`. Add the option-leg contract mapping
     (strike / right / expiry) and verify an option order round-trips in sim.

7. **End-to-end sim verification.**
   - A guarded E2E spec (like the existing `*.e2e.spec.ts` broker tests) that
     places, inspects, and cancels a paper futures order against the demo host.

## Guardrails (unchanged)

- Build and verify against the **demo/simulation host only** — fake money.
- **Do not** wire or default anything to the live host without an explicit,
  deliberate decision by the account owner. The Demo/Live toggle exists; live
  is opt-in, never the default.
- This is broker-boundary code: keep it 100% in-house, no external PRs.

## Pointers

- Connector: `services/uta/src/domain/trading/brokers/tradovate/`
- Settings form (preset): `TRADOVATE_PRESET` in
  `packages/uta-protocol/src/brokers/preset-catalog.ts`
- Engine registration: `services/uta/src/domain/trading/brokers/registry.ts`
- Phase-1 stubs to replace: search `marketDataNotYet` and `Phase 2` in
  `TradovateBroker.ts`.
