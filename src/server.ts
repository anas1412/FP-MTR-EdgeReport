// FP-MTR EdgeReport — local website server (Bun)
//
// Serves the website UI on localhost and proxies ALL FundingPips API calls
// from YOUR machine's IP (never a cloud IP). Session is saved to
// .session.json so you don't re-login every time.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname, extname } from "path"
import { fileURLToPath } from "url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PORT = Number(process.env.PORT ?? 8787)
const baseURL = "https://mtr-platform.fundingpips.com"
const brokerID = "1"
const systemUUID = "beedbea9-c757-46ad-b93b-a52ba2c3d648"
const sessionFile = join(root, ".session.json")
const browserID = "fp-edgereport-local"

interface SessionAccount {
  tradingAccountId: string
  tradingApiToken: string
  name: string
}

interface Session {
  email: string
  accounts: SessionAccount[]
  cookies: Array<{ name: string; value: string }>
  savedAt: string
}

// ── session persistence ────────────────────────────────────────────────────
function loadSession(): Session | null {
  try {
    return existsSync(sessionFile) ? JSON.parse(readFileSync(sessionFile, "utf8")) : null
  } catch {
    return null
  }
}

function saveSession(s: Session) {
  writeFileSync(sessionFile, JSON.stringify(s, null, 2), { mode: 0o600 })
}

function clearSession() {
  if (existsSync(sessionFile)) writeFileSync(sessionFile, "")
}

// ── FundingPips API (real browser via headless Chromium — passes Cloudflare) ─
//
// Cloudflare blocks plain curl / Bun fetch by TLS fingerprint. A real
// Chromium instance has a browser fingerprint, so requests pass. All calls
// still originate from YOUR machine's IP. Cookies and CF clearance live in
// the browser context (survive across calls in one server run).

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core"

const chromiumCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter((p): p is string => !!p && existsSync(p))
const execPath = chromiumCandidates.find((p) => existsSync(p))

const MAX_PAGES = 3
let browser: Browser | null = null
let ctx: BrowserContext | null = null
let pagePool: Page[] = []
let pageCursor = 0
let browserFailed = false

async function getPage(): Promise<Page> {
  if (browserFailed || !execPath) {
    throw new Error("chromium not found — install it (bunx playwright-core install chromium) or set PLAYWRIGHT_CHROMIUM_EXECUTABLE")
  }
  const idx = pageCursor++ % MAX_PAGES
  if (pagePool[idx]) return pagePool[idx]
  if (!browser) {
    browser = await chromium.launch({
      executablePath: execPath,
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
    })
    ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    })
  }
  const pg = await ctx!.newPage()
  pg.setDefaultTimeout(120_000)
  await pg.goto(baseURL + "/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {})
  await pg.waitForTimeout(4000)
  pagePool[idx] = pg
  return pg
}

const isBlockPage = (text: string) =>
  text.startsWith("<") && /cloudflare|just a moment|cf-|challenge|access denied/i.test(text.slice(0, 2000))

async function fpBrowser(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const pg = await getPage()
  const send: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "x-browser-id": browserID,
  }
  for (const [k, v] of Object.entries(headers)) send[k.toLowerCase()] = v
  const referrer = send["referer"] || baseURL + "/sign-in"
  let last: { status: number; text: string } = { status: 0, text: "" }
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await pg.evaluate(
      async ({ path, method, body, headers, referrer, base }) => {
        const res = await fetch(base + path, {
          method,
          headers,
          referrer,
          body: body !== null ? JSON.stringify(body) : undefined,
        })
        return { status: res.status, text: await res.text() }
      },
      { path, method, body: body ?? null, headers: send, referrer, base: baseURL },
    )
    if (!isBlockPage(last.text)) return last
    await pg.goto(baseURL + "/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {})
    await pg.waitForTimeout(3000)
  }
  return last
}

async function fpFetch(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  return fpBrowser(path, method, body, headers)
}

async function login(email: string, password: string): Promise<Session> {
  const res = await fpFetch("/manager/co-login", "POST", { email, password, brokerId: brokerID })
  if (res.status !== 200) {
    throw new Error(`login failed (HTTP ${res.status}): ${res.text.slice(0, 200)}`)
  }
  const data = JSON.parse(res.text) as {
    email: string
    accounts: Array<{
      tradingAccountId: string
      tradingApiToken: string
      offer: { name?: string; description?: string }
    }>
  }
  if (!data.accounts?.length) throw new Error("no accounts found on this email")
  console.log("[co-login] account fields:", JSON.stringify(data.accounts.map((a) => {
    const copy: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(a)) copy[k] = k.toLowerCase().includes("token") ? "[redacted]" : v
    return copy
  }), null, 2))
  const session: Session = {
    email: data.email,
    accounts: data.accounts.map((a) => ({
      tradingAccountId: a.tradingAccountId,
      tradingApiToken: a.tradingApiToken,
      name: a.offer.description || a.offer.name || "",
    })),
    cookies: [],
    savedAt: new Date().toISOString(),
  }
  saveSession(session)
  return session
}

// ── closed positions → report trades ───────────────────────────────────────
interface Operation {
  id: string
  symbol: string
  volume: string
  side: string
  openPrice: string
  closePrice: string
  stopLoss: string
  openTime: string
  profit: string
  netProfit: string
}

function fmtDT(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function toTrade(acct: string, op: Operation, balance: number): [string, string, number, number] {
  const net = Number(op.netProfit ?? 0)
  const pct = balance > 0 ? Math.round((net / balance) * 10000) / 100 : 0
  return [acct, fmtDT(op.openTime), pct, net]
}

async function fetchReport(session: Session, days: number, onlyAccountId?: string, excludeIds?: Set<string>) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000)
  const trades: Array<[string, string, number, number]> = []
  const perAccount: Array<{ accountId: string; name: string; count: number; net: number; balance?: number; ret?: number; error?: string; authFailed?: boolean }> = []
  const accounts = session.accounts.filter(
    (a) => (!onlyAccountId || a.tradingAccountId === onlyAccountId) && !excludeIds?.has(a.tradingAccountId),
  )
  const results = await Promise.all(
    accounts.map(async (account) => {
      const accountTrades: Array<[string, string, number, number]> = []
      const h = { "auth-trading-api": account.tradingApiToken, Referer: baseURL + "/app/portfolio" }
      let res: { status: number; text: string }
      try {
        res = await fpFetch(`/mtr-api/${systemUUID}/balance`, "GET", undefined, h)
      } catch (err) {
        return { entry: { accountId: account.tradingAccountId, name: account.name, count: 0, net: 0, error: (err as Error).message }, trades: accountTrades }
      }
      if (res.status !== 200) {
        return {
          entry: {
            accountId: account.tradingAccountId,
            name: account.name,
            count: 0,
            net: 0,
            error: `HTTP ${res.status}: ${res.text.slice(0, 120)}`,
            authFailed: res.status === 401,
          },
          trades: accountTrades,
        }
      }
      let balance = 0
      try {
        const bal = JSON.parse(res.text) as { balance?: string | number }
        balance = Number(bal.balance ?? 0)
      } catch {}
      try {
        res = await fpFetch(
          `/mtr-api/${systemUUID}/closed-positions`,
          "POST",
          { from: from.toISOString(), to: to.toISOString(), symbols: [] },
          { "auth-trading-api": account.tradingApiToken, Referer: baseURL + "/app/portfolio/closed" },
        )
      } catch (err) {
        return { entry: { accountId: account.tradingAccountId, name: account.name, count: 0, net: 0, error: (err as Error).message }, trades: accountTrades }
      }
      if (res.status !== 200) {
        return {
          entry: {
            accountId: account.tradingAccountId,
            name: account.name,
            count: 0,
            net: 0,
            error: `HTTP ${res.status}: ${res.text.slice(0, 120)}`,
            authFailed: res.status === 401,
          },
          trades: accountTrades,
        }
      }
      const data = JSON.parse(res.text) as { operations: Operation[] }
      const ops = data.operations ?? []
      let net = 0
      for (const op of ops) net += Number(op.netProfit ?? 0)
      const base = balance - net > 0 ? balance - net : balance
      for (const op of ops) accountTrades.push(toTrade(account.tradingAccountId, op, base))
      return {
        entry: {
          accountId: account.tradingAccountId,
          name: account.name,
          count: ops.length,
          net,
          balance,
          base,
          ret: base > 0 ? Math.round((net / base) * 10000) / 100 : 0,
        },
        trades: accountTrades,
      }
    }),
  )
  for (const r of results) {
    if (r.entry) perAccount.push(r.entry)
    for (const t of r.trades) trades.push(t)
  }
  return { trades, perAccount }
}

// ── static file serving ────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

function serveStatic(pathname: string): Response {
  let rel = pathname === "/" ? "/index.html" : pathname
  if (rel === "/report-template") {
    try {
      const body = readFileSync(join(root, "report_template.html"))
      return new Response(body, { headers: { "Content-Type": MIME[".html"] } })
    } catch {
      return new Response("not found", { status: 404 })
    }
  }
  const file = join(root, "public", rel.replace(/^\/+/, ""))
  if (!file.startsWith(join(root, "public"))) return new Response("forbidden", { status: 403 })
  try {
    const body = readFileSync(file)
    return new Response(body, { headers: { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" } })
  } catch {
    return new Response("not found", { status: 404 })
  }
}

// ── routes ─────────────────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const method = req.method

    if (method === "GET" && !url.pathname.startsWith("/api")) return serveStatic(url.pathname)

    if (url.pathname === "/api/status") {
      const s = loadSession()
      return Response.json(
        s
          ? {
              loggedIn: true,
              email: s.email,
              savedAt: s.savedAt,
              accounts: s.accounts.map((a) => ({ tradingAccountId: a.tradingAccountId, name: a.name })),
            }
          : { loggedIn: false },
      )
    }

    if (url.pathname === "/api/login" && method === "POST") {
      try {
        const { email, password } = (await req.json()) as { email?: string; password?: string }
        if (!email || !password) return Response.json({ error: "email and password required" }, { status: 400 })
        const s = await login(email, password)
        return Response.json({
          loggedIn: true,
          email: s.email,
          accounts: s.accounts.map((a) => ({ tradingAccountId: a.tradingAccountId, name: a.name })),
        })
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 401 })
      }
    }

    if (url.pathname === "/api/report" && method === "GET") {
      const s = loadSession()
      if (!s) return Response.json({ error: "not logged in" }, { status: 401 })
      try {
        const days = Math.min(Number(url.searchParams.get("days") ?? 3650), 3650)
        const acct = url.searchParams.get("acct") ?? ""
        const exclude = new Set((url.searchParams.get("exclude") ?? "").split(",").filter(Boolean))
        const { trades, perAccount } = await fetchReport(s, days, acct || undefined, exclude)
        const allFailed = trades.length === 0 && perAccount.length > 0 && perAccount.every((a) => a.error)
        if (allFailed) {
          const e401 = perAccount.some((a) => a.error?.includes("401"))
          return Response.json(
            { error: e401 ? "session expired — please log in again" : perAccount[0].error },
            { status: 401 },
          )
        }
        return Response.json({ email: s.email, trades, perAccount })
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 401 })
      }
    }

    if (url.pathname === "/api/logout" && method === "POST") {
      clearSession()
      return Response.json({ loggedIn: false })
    }

    return new Response("not found", { status: 404 })
  },
})

console.log(`FP-MTR EdgeReport site: http://localhost:${server.port}`)
