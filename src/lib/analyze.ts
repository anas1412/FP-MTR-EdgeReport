import type { Trade } from "../types"

export const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export const DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const pad2 = (n: number) => String(n).padStart(2, "0")
const parseDT = (s: string) => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/)!.slice(1).map(Number)
  return Date.UTC(m[2], m[1] - 1, m[0], m[3], m[4])
}
export const signed = (v: number, dec: number) => {
  const a = Math.abs(v)
  if (a < Math.pow(10, -dec) / 2) return (v < 0 ? "-" : "+") + (0).toFixed(dec)
  return (v < 0 ? "-" : "+") + a.toFixed(dec)
}
export const fmtShort = (d: Date) => pad2(d.getUTCDate()) + " " + MON3[d.getUTCMonth()]
export const fmtFull = (d: Date) => pad2(d.getUTCDate()) + " " + MON3[d.getUTCMonth()] + " " + d.getUTCFullYear()

export function tzLabel(off: number) {
  const abs = Math.abs(off)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return "UTC" + (off < 0 ? "-" : "+") + h + (m ? ":" + pad2(m) : "")
}
export const currentOffset = () => -new Date().getTimezoneOffset() / 60

export interface RTrade {
  acct: string
  ts: number
  dow: number
  hour: number
  R: number | null
  p: number
  dt: Date
}

export interface Agg {
  n: number
  w: number
  s: number
  p: number
  avg: number
  wr: number
}

export interface Ana {
  T: RTrade[]
  cum: number[]
  totalPct: number | null
  dayKeys: number[]
  hourKeys: number[]
  dA: Record<number, Agg>
  hA: Record<number, Agg>
  cA: Record<string, Agg>
  aA: Record<string, Agg>
  n: number
  nKnown: number
  wins: number
  sumR: number
  sumP: number
  range: [Date | null, Date | null]
}

export function analyze(trades: Trade[], off: number, sizes: Map<string, number> = new Map()): Ana {
  const T: RTrade[] = trades.map((t) => {
    const ts = parseDT(t[1]) + off * 3600e3
    const dt = new Date(ts)
    const R = t[2] ?? (sizes.get(t[0]) ? Math.round((t[3] / sizes.get(t[0])!) * 10000) / 100 : null)
    return { acct: t[0], ts, dow: dt.getUTCDay(), hour: dt.getUTCHours(), R, p: t[3], dt }
  })
  T.sort((a, b) => a.ts - b.ts)
  const days: Record<number, RTrade[]> = {}
  const hours: Record<number, RTrade[]> = {}
  const cells: Record<string, RTrade[]> = {}
  let wins = 0,
    sumR = 0,
    sumP = 0,
    nKnown = 0,
    run = 0
  const cum: number[] = []
  for (const t of T) {
    if (t.p > 0) wins++
    if (t.R !== null) {
      nKnown++
      sumR += t.R
      sumP += t.p
      run += t.R
    }
    cum.push(run)
    ;(days[t.dow] = days[t.dow] || []).push(t)
    ;(hours[t.hour] = hours[t.hour] || []).push(t)
    const k = t.dow + ":" + t.hour
    ;(cells[k] = cells[k] || []).push(t)
  }
  const agg = (a: RTrade[]): Agg => {
    const n = a.length,
      w = a.filter((t) => t.p > 0).length,
      s = a.reduce((x, t) => x + (t.R ?? 0), 0),
      p = a.reduce((x, t) => x + t.p, 0)
    const k = a.filter((t) => t.R !== null).length
    return { n, w, s, p, avg: k ? s / k : 0, wr: (w / n) * 100 }
  }
  const dayOrder = [1, 2, 3, 4, 5, 6, 0]
  const dayKeys = Object.keys(days).map(Number).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
  const hourKeys = Object.keys(hours).map(Number).sort((a, b) => a - b)
  const dA: Record<number, Agg> = {}
  const hA: Record<number, Agg> = {}
  const cA: Record<string, Agg> = {}
  const aA: Record<string, Agg> = {}
  dayKeys.forEach((k) => (dA[k] = agg(days[k])))
  hourKeys.forEach((k) => (hA[k] = agg(hours[k])))
  Object.keys(cells).forEach((k) => (cA[k] = agg(cells[k])))
  const accts: Record<string, RTrade[]> = {}
  T.forEach((t) => {
    ;(accts[t.acct] = accts[t.acct] || []).push(t)
  })
  Object.keys(accts).forEach((k) => (aA[k] = agg(accts[k])))
  return {
    T,
    cum,
    dA,
    hA,
    cA,
    aA,
    dayKeys,
    hourKeys,
    n: T.length,
    nKnown,
    wins,
    sumR,
    sumP,
    totalPct: sumR,
    range: T.length ? [T[0].dt, T[T.length - 1].dt] : [null, null],
  }
}

export function bestWindow(ana: Ana) {
  let bestCell: { d: number; h: number; s: number; n: number } | null = null
  let anyCell: { d: number; h: number; s: number; n: number } | null = null
  for (const d of ana.dayKeys) {
    for (const h of ana.hourKeys) {
      const c = ana.cA[d + ":" + h]
      if (!c) continue
      if (!anyCell || c.s > anyCell.s) anyCell = { d, h, s: c.s, n: c.n }
      if (c.n >= 3 && (!bestCell || c.s > bestCell.s)) bestCell = { d, h, s: c.s, n: c.n }
    }
  }
  if (!anyCell) return null
  const b: NonNullable<typeof bestCell> = bestCell ?? anyCell
  let bd: { k: number; s: number } | null = null
  let bh: { k: number; s: number } | null = null
  for (const k of ana.dayKeys) {
    if (!bd || ana.dA[k].s > bd.s) bd = { k, s: ana.dA[k].s }
  }
  for (const k of ana.hourKeys) {
    if (!bh || ana.hA[k].s > bh.s) bh = { k, s: ana.hA[k].s }
  }
  return {
    cell: DAYS3[b.d] + " " + pad2(b.h) + "h–" + pad2((b.h + 1) % 24) + "h",
    meta: "best day: " + DAYS3[bd!.k] + " · best time: " + pad2(bh!.k) + "h",
  }
}

export interface Insights {
  winRate: number
  avgW: number
  avgL: number
  rr: number
  ev: number
  best: ReturnType<typeof bestWindow>
  bestDay: { k: number; a: Agg }
  worstDay: { k: number; a: Agg }
  bestHour: { h: number; a: Agg }
  worstHour: { h: number; a: Agg }
  busiest: { h: number; a: Agg }
}

export function computeInsights(ana: Ana): Insights {
  const winTs = ana.T.filter((t) => t.R !== null && t.R > 0.2)
  const lossTs = ana.T.filter((t) => t.p <= 0 && t.R !== null)
  const avgW = winTs.length ? winTs.reduce((s, t) => s + t.R!, 0) / winTs.length : 0
  const avgL = lossTs.length ? lossTs.reduce((s, t) => s + t.R!, 0) / lossTs.length : 0
  const rr = avgL < 0 ? avgW / -avgL : 0
  const ev = ana.nKnown ? ana.sumR / ana.nKnown : 0
  let bd: { k: number; a: Agg } | null = null
  let wd: { k: number; a: Agg } | null = null
  ana.dayKeys.forEach((k) => {
    if (!bd || ana.dA[k].s > bd.a.s) bd = { k, a: ana.dA[k] }
    if (!wd || ana.dA[k].avg < wd.a.avg) wd = { k, a: ana.dA[k] }
  })
  let bh: { h: number; a: Agg } | null = null
  let wh: { h: number; a: Agg } | null = null
  let busiest: { h: number; a: Agg } | null = null
  ana.hourKeys.forEach((h) => {
    if (!bh || ana.hA[h].s > bh.a.s) bh = { h, a: ana.hA[h] }
    if (!wh || ana.hA[h].avg < wh.a.avg) wh = { h, a: ana.hA[h] }
    if (!busiest || ana.hA[h].n > busiest.a.n) busiest = { h, a: ana.hA[h] }
  })
  return {
    winRate: (ana.wins / ana.n) * 100,
    avgW,
    avgL,
    rr,
    ev,
    best: bestWindow(ana),
    bestDay: bd!,
    worstDay: wd!,
    bestHour: bh!,
    worstHour: wh!,
    busiest: busiest!,
  }
}