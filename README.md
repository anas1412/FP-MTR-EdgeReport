# FP-MTR EdgeReport

Your FundingPips MatchTrader trading edge report, as a **static React app**.

Upload your MatchTrader CSV exports and the site builds your interactive
edge report: win rate, avg return %, total return %, EV per trade,
day-of-week and hour-of-day edges, the weekday×hour heatmap, best window.
No login, no backend, no data leaves your browser.

## How it works

- Files are parsed **in the browser** and stored in `localStorage` only.
- Uploading a file for an account you already have **replaces** that
  account's trades; new accounts are **appended**. No duplicates.
- The whole analysis runs client-side: `src/lib/analyze.ts` (same math as
  before) feeds React SVG charts with hover tooltips.

## Accepted CSV formats

Header-tolerant parsing auto-detects columns by name:

- canonical: `account,open_time,return_pct,net_profit`
- MatchTrader-style exports (`Symbol, Volume, Side, Open Price, Close Price,
  Net P&L, Open Time`, quoted fields, ISO times)
- missing `return_pct` but a balance column present → `% = net / balance`

When an export has **no** `return_pct` and **no** balance column, the report
cannot compute percentage-based stats (`net` is $, `%` needs a balance).
Pick the account size once (5k / 10k / 25k / 50k / 100k) in the report —
it is saved locally and used as `% = net / size` for that account.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

## Deploy to Vercel

```bash
npm run build
vercel --prod        # static only, no functions
```

or connect the repo — Vercel auto-detects Vite (`vercel.json` included).

## Scripts

| command               | what                          |
|-----------------------|-------------------------------|
| `npm run dev`         | local dev server              |
| `npm run build`       | typecheck + production build  |
| `npm run preview`     | serve the built app           |
| `npm run typecheck`   | `tsc --noEmit`                |
| `npm run test`        | smoke tests (parse + analysis) |

## Structure

```
src/
  main.tsx / App.tsx      boot + view routing (Upload ⇄ Report)
  lib/csv.ts              tolerant CSV parsing
  lib/store.ts            localStorage persistence, per-account merge
  lib/analyze.ts          report math (ported from the original template)
  components/             UploadView, ReportView, charts (SVG + tooltips)
  exportHtml.tsx          standalone HTML export of the report
```

## Privacy

Everything happens in the browser. CSVs never leave your machine, there is
no account system, and clearing browser data removes your files.
