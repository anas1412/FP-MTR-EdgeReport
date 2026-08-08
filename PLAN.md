# FP-MTR EdgeReport — React Rewrite Plan

Goal: turn the Bun server + static-HTML app into a **pure React (Vite) client-side
app** that runs on any static host (Vercel, GitHub Pages, local `npm run dev`).
Zero backend, zero accounts, zero login. Users upload their FundingPips
MatchTrader CSV exports, the browser stores them locally, and the report
builds from that data.

## Why this architecture

- The report math already runs 100% in the browser (`report_template.html`):
  it needs only an array of `[account, "DD/MM/YYYY HH:MM", returnPct, netProfit]`.
- Vercel hosting + static output => no functions, no env vars, no cost.
- localStorage keeps each user's CSVs in their own browser. Uploading a file
  for a known account **replaces** that account's rows (an export is the
  complete truth); a new account is **appended**. No duplicates ever.

## Layout

```
index.html              Vite entry (theme, fonts, #root)
src/
  main.tsx              React boot
  App.tsx               view routing: UploadView ⇄ ReportView
  styles.css            design system (ported, unchanged look)
  types.ts              Trade, StoreEntry, Analysis, Row types
  lib/
    csv.ts              tolerant header detection + parsing
    store.ts            localStorage persistence, merge/replace, quota guard
    analyze.ts          the report math, ported verbatim from report_template.html
  components/
    UploadView.tsx      dropzone, progress, account manager (remove / clear all)
    ReportView.tsx      stat strip, appbar (TZ + account filters), sections
    charts/
      EquityChart.tsx   cumulative return line with hover
      BarChart.tsx      day/hour bars (avg / total / frequency)
      HeatmapTable.tsx  weekday × hour matrix
      DataTable.tsx     generic stats table
      ChartTip.tsx      shared tooltip
    takeoways.ts        insight strings
  exportHtml.ts         standalone HTML file from the same data (no server)
PLAN.md                 this document
vercel.json             static framework config
```

## CSV parsing (`lib/csv.ts`)

Header-tolerant. Detect columns by name (case/space/underscore-insensitive):

| meaning      | accepted names                                   |
|--------------|--------------------------------------------------|
| open time    | `open_time`, `open time`, `time`, `date`, `datetime` |
| net profit   | `net_profit`, `net profit`, `net p&l`, `profit`, `p&l`, `amount` |
| return %     | `return_pct`, `return`, `return %`, `% return`, `pct` |
| account      | `account`, `account id`, `login`, `log id`, `symbol` |
| balance      | `balance`, `equity`, `start balance` (fallback for % ) |

- Quoted fields (`"sym, X"`), CRLF, BOM, trailing commas handled.
- If `return_pct` missing but balance exists, `pct = net / balance * 100`.
- If neither, `pct = 0` with a per-account warning surfaced in the UI.
- Time normalization: ISO, `YYYY-MM-DD HH:MM`, and `DD/MM/YYYY HH:MM` all
  normalized to the report's `DD/MM/YYYY HH:MM:SS` canonical form.

## 2. Storage (`lib/store.ts`)

- `localStorage["fp-mtr-store"]` = `{ version: 2, accounts: StoreEntry[] }`
- `StoreEntry = { accountId, name, file, uploadedAt, rows: Trade[] }`
- `addCsvParsed(file, accounts[])`: for each account in the file:
  - exists same `accountId` -> **replace** rows, keep id, update file/date
  - else -> append
- `removeAccount(id)`, `clearAll()`, `list()`, quota errors caught
  (clear message: browser storage full).

## 3. Report (`lib/analyze.ts`, `ReportView`, charts)

- `analyze(trades, offsetHours)` -> the same `A` object the template built:
  `T`, `cum`, `dA`, `hA`, `cA`, `aA`, `dayKeys`, `hourKeys`, n/wins/sumR/sumP/range.
- `bestWindow(A)`, `computeStats(A)` — identical formulas (win rate, avg RR,
  avg profit/trade, total return, EV, best window, per-account rows,
  cell-count note, takeaways).
- Charts reimplemented as React SVG components with real hover tooltips
  (hover index -> tooltip + phantom bar/point).
- Timezone selector: same `UTC+0 .. UTC+14` list; "auto" = browser local.
- Footer: source list = uploaded account IDs, `owner:` line becomes
  "uploaded locally — nothing leaves your browser".

## 4. Export static HTML (`exportHtml.ts`)

- Renders the report to a **standalone HTML file** via
  `react-dom/server.browser` `renderToString` + inlined `styles.css` +
  calendar date in filename. `Export HTML` button in the appbar.

## 5. Cleanup (after the rewrite is green)

| Path                    | action |
|-------------------------|--------|
| `src/server.ts`         | delete (was Bun backend)    |
| `src/bridge.py`         | delete (python bridge)      |
| `report_template.html`  | delete (logic lives in React now) |
| `API.md`                | delete (documents the dead server) |
| `install.sh`            | delete (unrelated installer) |
| legacy session files    | delete (`.session*.json`, `.curl-cookies.txt`, `.login-probe.json`, `trades/`) |
| `bun.lock`, le package.json scripts, playwright dep | replaced by npm |
| `node_modules`, npm install again |
| `README.md`             | rewrite for React + Vercel    |
| `.gitignore`            | update (node_modules, dist, .vercel) |

## 6. Verification

1. `npm run typecheck` && `npm run build` clean
2. smoke: parse a canonical 4-col CSV + a simulated MatchTrader export
   (different headers, quoted fields, ISO times) into a report
3. io: upload 2 accounts -> report; re-upload one -> replace (count stable); remove account -> gone; reload -> persists
4. report: TZ switch re-renders, account filter, export HTML opens standalone
5. `npm run dev` eyeball pass
6. Vercel: `vercel --prod` at the end (user does it, or we do if logged in here)