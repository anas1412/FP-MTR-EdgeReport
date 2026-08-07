# FP-MTR EdgeReport

Your FundingPips MatchTrader trading edge report, as a local website.

Log in with your FundingPips email and password, and the site fetches every
account's closed trades and builds your interactive edge report: win rate,
avg R, P&L, day-of-week and hour-of-day edges, the weekday×hour heatmap,
timezone selector (UTC-11..+14 or "My time (auto)"), best window.

## Run

```bash
bun install
bun run start
```

Then open **http://localhost:8787** in your browser.

- Your session is saved on your machine — no repeated logins
- **Log out** button clears it
- All FundingPips API calls go out from **your IP**, never a cloud server

## Live demo

The public site at https://fp-mtr-edgereport.vercel.app shows the login screen only — the full app (with live data) runs locally.

## Troubleshooting

- `login failed (HTTP 403)`: Cloudflare challenged your IP. Open the
  FundingPips sign-in page once in your browser to clear it, then retry.
- `session expired`: log in again — the button is in the top bar.
