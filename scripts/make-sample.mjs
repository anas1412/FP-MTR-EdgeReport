// Generates dist/index.html — the trading edge report with a FAKE demo
// dataset (seeded, deterministic, clearly not real trades).
// Pure Node, runs on Vercel's build.
//
//   node scripts/make-sample.mjs

import { readFileSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const template = readFileSync(join(root, "report_template.html"), "utf8")

// ── seeded RNG (deterministic, so the demo is reproducible) ────────────────
let seed = 20260807
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

// ── fake dataset ───────────────────────────────────────────────────────────
const ACCTS = [
  { id: "1001201", name: "Demo Evaluated" },
  { id: "1002290", name: "Demo Funded" },
  { id: "1003055", name: "Demo Express" },
]
const SYMBOLS = ["XAUUSD", "XAUUSD", "XAUUSD", "EURUSD", "NAS100", "US30"]
const REASONS = [
  ["CLOSE_REASON_TAKE_PROFIT", 0.42],
  ["CLOSE_REASON_STOP_LOSS", 0.26],
  ["CLOSE_REASON_USER", 0.28],
  ["CLOSE_REASON_TRAILING_STOP_LOSS", 0.04],
]
const start = Date.UTC(2026, 4, 4, 9, 0, 0) // 04 May 2026
const trades = []
const N = 92

for (let i = 0; i < N; i++) {
  const acct = pick(ACCTS)
  const symbol = pick(SYMBOLS)
  const side = rnd() > 0.5 ? "BUY" : "SELL"
  const openPrice = symbol === "XAUUSD" ? 4100 + rnd() * 220 : symbol === "EURUSD" ? 1.04 + rnd() * 0.12 : 14000 + rnd() * 4000
  const stopDist = openPrice * (0.0006 + rnd() * 0.004)
  const rr = 1.2 + rnd() * 2.4
  const win = rnd() < 0.56
  const move = win ? stopDist * rr : -stopDist * (0.9 + rnd() * 0.4)
  const closePrice = side === "BUY" ? openPrice + move : openPrice - move
  const volume = 0.1 + Math.round(rnd() * 6) / 10
  const openTime = new Date(start + i * (17 * 3600e3 + Math.floor(rnd() * 9) * 3600e3))
  const closeTime = new Date(openTime.getTime() + (30 + Math.floor(rnd() * 900)) * 60e3)
  const profit = win ? move * volume * 10 : move * volume * 10
  const reason = (() => {
    const r = rnd()
    let acc = 0
    for (const [name, w] of REASONS) {
      acc += w
      if (r < acc) return name
    }
    return "CLOSE_REASON_USER"
  })()

  const pad = (n) => String(n).padStart(2, "0")
  const fmt = (d) =>
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`

  const openPriceS = openPrice.toFixed(symbol === "EURUSD" ? 5 : 2)
  const closePriceS = closePrice.toFixed(symbol === "EURUSD" ? 5 : 2)
  const stopLoss = (side === "BUY" ? openPrice - stopDist : openPrice + stopDist).toFixed(symbol === "EURUSD" ? 5 : 2)
  const takeProfit = win
    ? (side === "BUY" ? closePrice + stopDist * 0.3 : closePrice - stopDist * 0.3).toFixed(symbol === "EURUSD" ? 5 : 2)
    : (side === "BUY" ? openPrice - stopDist * 0.9 : openPrice + stopDist * 0.9).toFixed(symbol === "EURUSD" ? 5 : 2)

  const R = stopDist > 0 ? move / stopDist : 0
  trades.push([acct.id, fmt(openTime), Math.round(R * 100) / 100, Math.round(profit * 100) / 100])
}

// ── embed into the template ────────────────────────────────────────────────
const html = template
  .replace("__TRADES__", JSON.stringify(trades))
  .replace(
    "Source files: CLOSED_POSITIONS_1972530, CLOSED_POSITIONS_2013767",
    "Demo dataset — generated sample, not real trades",
  )
  .replace("<title>Trading Edge Report — XAUUSD</title>", "<title>FP-MTR EdgeReport — Demo</title>")
  .replace('<div class="eyebrow">Trading Journal — XAUUSD</div>', '<div class="eyebrow">Demo — sample data, not real trades</div>')

mkdirSync(join(root, "dist"), { recursive: true })
writeFileSync(join(root, "dist", "index.html"), html)
console.log(`dist/index.html written: ${trades.length} sample trades embedded`)
