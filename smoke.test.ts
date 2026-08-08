// Smoke tests for csv.ts and analyze.ts run under bun
import { parseCsv, normalizeTime } from "./src/lib/csv"
import { analyze, computeInsights } from "./src/lib/analyze"
import type { Trade } from "./src/types"

let failures = 0
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log("PASS " + name)
  else {
    failures++
    console.log("FAIL " + name + " " + detail)
  }
}

// ── canonical 4-col CSV ────────────────────────────────────────────────────
const canonical = `account,open_time,return_pct,net_profit
111111,2026-01-05 10:30:00,2.35,470.00
111111,2026-02-11 14:00:00,-1.20,-240.00
222222,2026-03-01 09:15:00,0.85,170.00
`
const r1 = parseCsv(canonical, "canon.csv")
check("canonical parses", r1.ok)
if (r1.ok) {
  check("canonical 2 accounts", r1.data.accounts.length === 2)
  check("canonical times normalized to DD/MM/YYYY", r1.data.accounts[0].rows[0][1] === "05/01/2026 10:30:00")
  check("canonical pct kept", r1.data.accounts[0].rows[0][2] === 2.35)
}

// ── MatchTrader-style export: different headers, quoted field, ISO time ────
// ← no account column → account id MUST come from the filename, not the symbol
const mt = `Symbol,Volume,Side,Open Price,Close Price,Net P&L,Open Time
"XAUUSD, gold",0.50,buy,2345.10,2351.40,315.00,2026-04-02T08:15:00.000Z
EURUSD,1.00,sell,1.0850,1.0800,-50.00,2026-04-03T16:45:00.000Z
`
const r2 = parseCsv(mt, "CLOSED_POSITIONS_2013767_1786092064347.csv")
check("matchtrader-style parses", r2.ok)
if (r2.ok) {
  check("account id from filename", r2.data.accounts.length === 1 && r2.data.accounts[0].accountId === "2013767")
  check("both symbols grouped under one account", r2.data.accounts[0].rows.length === 2)
  check("ISO time normalized", r2.data.accounts[0].rows[0][1] === "02/04/2026 08:15:00")
  check("pct is null when column missing", r2.data.accounts[0].rows[0][2] === null)
  check("missingPct flagged", r2.data.missingPct === true)
}
const r2b = parseCsv(mt, "positions_12345_999.csv")
check("lowercase positions_ filename also works", r2b.ok && r2b.data.accounts.length === 1 && r2b.data.accounts[0].accountId === "12345")
const r2c = parseCsv(canonical, "whatever.csv")
check("explicit account column beats filename", r2c.ok && r2c.data.accounts.length === 2 && r2c.data.accounts[0].accountId === "111111")

// ── missing pct but balance present → derived pct ──────────────────────────
const balCsv = `account,open_time,net_profit,balance
333333,2026-05-01 10:00:00,100.00,1000.00
`
const r3 = parseCsv(balCsv, "bal.csv")
check("balance-derived pct", r3.ok && r3.data.accounts[0].rows[0][2] === 10)

// ── missing pct and no balance → null; size-derives pct in analyze ─────────
const noPctCsv = `account,open_time,net_profit
444444,2026-05-02 11:00:00,250.00
`
const r3b = parseCsv(noPctCsv, "nopct.csv")
check("no pct → null kept", r3b.ok && r3b.data.accounts[0].rows[0][2] === null)
if (r3b.ok) {
  const sizes = new Map([["444444", 10000]])
  const ana3 = analyze(r3b.data.accounts[0].rows, 0, sizes)
  check("size-derived pct = net/size*100", ana3.T[0].R === 2.5 && ana3.totalPct === 2.5)
  const ana3b = analyze(r3b.data.accounts[0].rows, 0, new Map())
  check("no size → pct stays unknown", ana3b.nKnown === 0 && ana3b.totalPct === 0)
}

// ── bad files ──────────────────────────────────────────────────────────────
const r4 = parseCsv("foo,bar\n1,2\n", "bad.csv")
check("bad header rejected", !r4.ok)
const r5 = parseCsv("", "empty.csv")
check("empty rejected", !r5.ok)

// ── analysis on a known set ────────────────────────────────────────────────
// 3 trades: 2 wins +1% each, 1 loss -1% → win rate 66.7%, total +1%, EV 0.33
const trades: Trade[] = [
  ["A", "06/01/2026 09:00:00", 1, 10],
  ["A", "07/01/2026 09:00:00", 1, 10],
  ["A", "08/01/2026 09:00:00", -1, -10],
]
const ana = analyze(trades, 0)
check("n=3", ana.n === 3)
check("win rate 66.7%", Math.abs(ana.wins / ana.n - 2 / 3) < 1e-9)
check("sumR = +1", ana.sumR === 1)
check("cum correct", ana.cum[0] === 1 && ana.cum[1] === 2 && ana.cum[2] === 1)
check("dow of Monday (09:00 UTC)", ana.T[0].dow === 2 && ana.T[0].hour === 9)
const ins = computeInsights(ana)
check("EV 0.33", Math.abs(ins.ev - 1 / 3) < 1e-9)
check("best window found", ins.best !== null && ins.best.cell.startsWith("Tue"))

// ── timezone shift changes hour ────────────────────────────────────────────
const ana2 = analyze(trades, 3)
check("UTC+3 shifts hour to 12", ana2.T[0].hour === 12)

// ── normalizeTime variants ─────────────────────────────────────────────────
check("norm ISO", normalizeTime("2026-01-05T10:30:00.000Z") === "05/01/2026 10:30:00")
check("norm dash", normalizeTime("2026-01-05 10:30:00") === "05/01/2026 10:30:00")
check("norm slash", normalizeTime("05/01/2026 10:30:00") === "05/01/2026 10:30:00")
check("norm short hour", normalizeTime("2026-01-05T9:05:00Z") === "05/01/2026 09:05:00")

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall smoke tests passed")
process.exit(failures ? 1 : 0)
