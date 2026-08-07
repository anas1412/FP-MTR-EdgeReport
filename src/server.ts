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

// ── FundingPips API (browser-identical headers via curl — passes Cloudflare) ─
//
// Bun's own fetch has a non-browser TLS fingerprint that Cloudflare flags;
// curl with the full browser header set passes (verified). Cookies live in a
// curl cookie jar file so the session persists between requests.

import { spawnSync } from "child_process"

const cookieJarFile = join(root, ".session-cookies.txt")

function browserArgs(): string[] {
  return [
    "-H",
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "-H",
    "Accept: application/json, text/plain, */*",
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    "-H",
    "Origin: " + baseURL,
    "-H",
    "Referer: " + baseURL + "/sign-in",
    "-H",
    'Sec-Ch-Ua: "Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "-H",
    "Sec-Ch-Ua-Mobile: ?0",
    "-H",
    'Sec-Ch-Ua-Platform: "Linux"',
    "-H",
    "Sec-Fetch-Dest: empty",
    "-H",
    "Sec-Fetch-Mode: cors",
    "-H",
    "Sec-Fetch-Site: same-origin",
    "-H",
    "X-Browser-Id: " + browserID,
    "-H",
    "Content-Type: application/json",
    "-b",
    cookieJarFile,
    "-c",
    cookieJarFile,
  ]
}

async function fpCurl(path: string, method: string, body?: unknown, extraHeaders: string[] = []): Promise<{ status: number; text: string }> {
  const args = ["-sS", "-X", method, ...browserArgs(), ...extraHeaders]
  if (body !== undefined) args.push("--data-binary", JSON.stringify(body))
  args.push("-w", "\n%{http_code}", baseURL + path)
  const out = spawnSync("curl", args, { encoding: "utf8", timeout: 20_000 })
  if (out.error) throw new Error("curl failed: " + out.error.message)
  const lines = out.stdout.trimEnd().split("\n")
  const status = Number(lines.pop())
  return { status, text: lines.join("\n") }
}

async function login(email: string, password: string): Promise<Session> {
  const res = await fpCurl("/manager/co-login", "POST", { email, password, brokerId: brokerID })
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

function toTrade(acct: string, op: Operation): [string, string, number, number] {
  const openPrice = Number(op.openPrice)
  const closePrice = Number(op.closePrice)
  const stopLoss = Number(op.stopLoss)
  const stopDist = Math.abs(openPrice - stopLoss)
  const reward = op.side === "BUY" ? closePrice - openPrice : openPrice - closePrice
  const R = stopDist > 0 ? reward / stopDist : 0
  return [acct, fmtDT(op.openTime), Math.round(R * 100) / 100, Number(op.profit)]
}

async function fetchReport(session: Session, days: number) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000)
  const trades: Array<[string, string, number, number]> = []
  const perAccount: Array<{ accountId: string; name: string; count: number; net: number }> = []
  for (const account of session.accounts) {
    const res = await fpCurl(
      `/mtr-api/${systemUUID}/closed-positions`,
      "POST",
      { from: from.toISOString(), to: to.toISOString(), symbols: [] },
      ["-H", "auth-trading-api: " + account.tradingApiToken, "-H", "Referer: " + baseURL + "/app/portfolio/closed"],
    )
    if (res.status === 401) {
      throw new Error("session expired — please log in again")
    }
    if (res.status !== 200) {
      throw new Error(`account ${account.tradingAccountId}: HTTP ${res.status}`)
    }
    const data = JSON.parse(res.text) as { operations: Operation[] }
    const ops = data.operations ?? []
    for (const op of ops) trades.push(toTrade(account.tradingAccountId, op))
    perAccount.push({
      accountId: account.tradingAccountId,
      name: account.name,
      count: ops.length,
      net: ops.reduce((s, op) => s + Number(op.netProfit ?? 0), 0),
    })
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
        const days = Math.min(Number(url.searchParams.get("days") ?? 90), 3650)
        const { trades, perAccount } = await fetchReport(s, days)
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
