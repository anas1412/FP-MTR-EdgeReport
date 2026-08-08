import type { ParseResult, ParsedAccount, Trade } from "../types"

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%&]/g, "")

const COLS: Record<string, string[]> = {
  open: ["opentime", "opentime2", "time", "date", "datetime", "closetime", "closeentry"],
  net: ["netprofit", "netpl", "netp/l", "netp&l", "profit", "pl", "amount", "net"],
  pct: ["returnpct", "pct", "return", "%return", "return%", "percent"],
  acct: ["account", "accountid", "login", "log", "logid", "tradingaccount"],
  bal: ["balance", "equity", "startbalance", "accountbalance", "balanceafter"],
}

type ColIndex = { open: number; net: number; pct: number; acct: number; bal: number }

const ACCT_RE = /^(?:CLOSED_)?POSITIONS?_?(\d{4,})(?:_|\.)/i

export function accountIdFromFile(fileName: string): string {
  const base = fileName.replace(/\.csv$/i, "")
  const m = base.match(ACCT_RE)
  if (m) return m[1]
  const any = base.match(/(\d{4,})/)
  return any ? any[1] : base
}

function pick(headers: string[]): ColIndex | null {
  const find = (kind: keyof typeof COLS) => headers.findIndex((h) => COLS[kind].includes(norm(h)))
  const open = find("open")
  const net = find("net")
  if (open < 0 || net < 0) return null
  return { open, net, pct: find("pct"), acct: find("acct"), bal: find("bal") }
}

function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQ = !inQ
    } else if (ch === "," && !inQ) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

export function normalizeTime(raw: string): string {
  const s = String(raw || "").trim()
  if (!s) return ""
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) return `${m[1]}/${m[2]}/${m[3]} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0")
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  return ""
}

export function parseCsv(text: string, fileName: string): ParseResult {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const lines = clean.split("\n").filter((l) => l.trim())
  if (!lines.length) return { ok: false, data: null, error: `${fileName}: empty file` }
  const header = parseLine(lines[0])
  const cols = pick(header)
  if (!cols) {
    return {
      ok: false,
      data: null,
      error: `${fileName}: no recognizable columns (need a time column and a net-profit column)`,
    }
  }
  const accounts = new Map<string, Trade[]>()
  let skipped = 0
  let missingPct = cols.pct < 0
  for (const ln of lines.slice(1)) {
    const f = parseLine(ln)
    if (f.length <= Math.max(cols.net, cols.open)) continue
    const time = normalizeTime(f[cols.open])
    if (!time) {
      skipped++
      continue
    }
    const net = parseFloat(f[cols.net])
    if (isNaN(net)) continue
    let pct: number | null = cols.pct >= 0 ? parseFloat(f[cols.pct]) : null
    let acct = cols.acct >= 0 ? f[cols.acct].trim() : ""
    const base = cols.bal >= 0 ? parseFloat(f[cols.bal]) : NaN
    if ((pct === null || pct === 0 || isNaN(pct)) && !isNaN(base) && base > 0) {
      pct = Math.round((net / base) * 10000) / 100
    }
    if (pct === null || isNaN(pct)) {
      pct = null
      missingPct = true
    }
    if (!acct) acct = accountIdFromFile(fileName)
    if (!accounts.has(acct)) accounts.set(acct, [])
    accounts.get(acct)!.push([
      acct,
      time,
      pct === null ? null : Math.round(pct * 100) / 100,
      Math.round(net * 100) / 100,
    ])
  }
  const result: ParsedAccount[] = [...accounts.entries()].map(([accountId, rows]) => ({
    accountId,
    rows,
  }))
  if (result.length === 0) {
    return { ok: false, data: null, error: `${fileName}: no parseable trade rows (skipped ${skipped})` }
  }
  return { ok: true, data: { accounts: result, missingPct }, error: null }
}