---
name: openalice-quant
description: >
  How to compute technical analysis with OpenAlice's Quant Calculator (v2) — a
  small Python/pandas-subset scripting language over K-lines, keyed by barId so
  you compute on a SPECIFIC source (a broker's bars matching what you trade, or a
  named vendor) and can batch many timeframes/symbols/indicators in ONE call.
  Use whenever the task is technical/quantitative on price data: "RSI on BTC",
  "is AAPL above its 200-day", "50/200 golden cross check", "multi-timeframe
  momentum", "how extended is X (z-score)", "does this track the sector
  (correlation)", "trend strength", "compare 1h/4h/12h at once". Two tools:
  `searchBars` (find a barId) then `calculateQuant` (compute) — or via CLI,
  `alice analysis search-bars` then `alice analysis quant`.
---

# OpenAlice Quant Calculator (v2)

A bounded, side-effect-free expression language for technical analysis. You write
a short script; it fetches K-lines by **barId** and returns a value (or a panel
of values). Get barIds from `searchBars` first.

## The loop

**MCP tools:** `searchBars({ query })` → pick a `barId` → `calculateQuant({ script })`.

**CLI (workspace agents):**
```bash
alice analysis search-bars --query AAPL
alice analysis quant --script $'s = bars("yfinance|AAPL", "1d", count=250, asset="equity")\nsma(s.close, 50)'
```

## Language

A script is zero or more `name = ...` bindings, then a final result expression:

```python
s = bars("alpaca-paper|AAPL", "1d", count=250)
sma(s.close, 50) - sma(s.close, 200)        # +ve = 50 above 200 (uptrend)
```

**`bars(barId, interval, count=, asOf=, start=, end=, asset=)`**
- `barId`: `"{source}|{symbol}"` from searchBars. Broker (`alpaca-paper|AAPL`,
  `binance-readonly|BTC/USDT`) needs NO `asset=`; vendor (`yfinance|AAPL`,
  `fmp|AAPL`) needs `asset="equity"|"crypto"|"currency"|"commodity"`.
- `interval`: `1m 5m 15m 30m 1h 4h 1d 1w`.
- Window: `count=N` (most-recent N bars — the natural window for indicators), OR
  `start=/end=` (YYYY-MM-DD date range), OR `end=+count=` (point-in-time backtest).

**Columns** of a bars() series: `s.open / s.high / s.low / s.close / s.volume`.

**Indexing:** raw columns are series — index them: `s.close[-1]` (latest),
`s.close[-2]` (one back). **Indicators already return the latest scalar — do NOT
index them** (`sma(s.close, 50)`, not `sma(...)[-1]`).

**Arithmetic:** `+ - * /`, parentheses, unary minus.

## Panels — batch many computations in one call

The result can be a **labeled dict** or a **positional list** (each entry a single
value, max 50). Use this instead of calling the tool N times:

```python
h1  = bars("binance-readonly|BTC/USDT", "1h",  count=250)
h4  = bars("binance-readonly|BTC/USDT", "4h",  count=250)
h12 = bars("binance-readonly|BTC/USDT", "12h", count=250)
{ "1h": rsi(h1.close, 14), "4h": rsi(h4.close, 14), "12h": rsi(h12.close, 14) }
```
→ `{ "1h": 53.2, "4h": 48.9, "12h": 61.4 }`

## Function catalog

| Group | Functions |
|---|---|
| Trend | `sma(s, n)` `ema(s, n)` `macd(s, fast, slow, signal)` `slope(s, n)` (signed, rankable trend) |
| Momentum | `rsi(s, n=14)` `roc(s, n)` (% change over n) |
| Volatility | `stdev(s)` `atr(high, low, close, n)` `bbands(s, n, std)` `zscore(s, n?)` (how extended vs window) |
| Volume | `rvol(volume, n=20)` `obv(close, volume)` `mfi(high, low, close, volume, n=14)` `vwap(high, low, close, volume)` |
| Stats | `max/min/sum/average/median(s)` `highest(s, n)` `lowest(s, n)` |
| Comparison | `correlation(a, b)` (−1..1; relative strength / pairs / "tracks the sector?") |

Records: `bbands` → `{upper, middle, lower}`; `macd` → `{macd, signal, histogram}`.

## Examples

```python
# Momentum % over the last 20 bars
s = bars("yfinance|AAPL", "1d", count=60, asset="equity")
roc(s.close, 20)

# How overbought/oversold vs the trailing 20 sessions
s = bars("yfinance|TSLA", "1d", count=60, asset="equity")
zscore(s.close, 20)

# Does this token move with BTC? (relative strength)
btc = bars("binance-readonly|BTC/USDT", "1d", count=90)
sui = bars("binance-readonly|SUI/USDT", "1d", count=90)
correlation(btc.close, sui.close)

# A one-call dashboard
s = bars("yfinance|NVDA", "1d", count=250, asset="equity")
{
  "rsi":        rsi(s.close, 14),
  "roc_20d_%":  roc(s.close, 20),
  "vs_200ma":   s.close[-1] - sma(s.close, 200),
  "trend":      slope(s.close, 50),
  "z_20d":      zscore(s.close, 20),
  "atr_14":     atr(s.high, s.low, s.close, 14),
}
```

## Self-correction

On failure the tool returns `{ error: { kind, message, suggestion } }`, not a
crash — read it and fix the script. It pinpoints the problem: unknown function
(with "did you mean"), wrong arity/type, insufficient bars (raise `count=`),
undeclared name, and common Python reflexes (`s.close.rolling(50).mean()` →
"use `sma(s.close, 50)`"; `sma(...)[-1]` → "drop the [-1]"; slices/`if` → not
supported here).

## Gotchas

- Indicators return the latest **scalar** — never `[-1]` them; only raw columns
  are series.
- Vendor barIds need `asset=`; broker barIds infer it.
- No conditionals/booleans (no `if`, no crossover operator) — compute the parts
  and compare in your own reasoning, or return them in a panel.
- For arbitrary/looping logic beyond these primitives, use an auto-quant
  workspace, not this tool.
