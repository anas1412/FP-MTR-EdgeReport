# FP-MTR EdgeReport

Your FundingPips MatchTrader trading edge report, as a local website.

Log in with your FundingPips email and password, and the site fetches every
account's closed trades and builds your interactive edge report: win rate,
avg R, P&L, day-of-week and hour-of-day edges, the weekday×hour heatmap,
timezone selector (UTC-11..+14 or "My time (auto)"), best window.

## How to run

Install [Bun](https://bun.sh) (one-time):

```bash
curl -fsSL https://bun.sh/install | bash
```

Then, in the project folder:

```bash
bun install
bun run start
```

Open **http://localhost:8787** in your browser and log in with your FundingPips credentials.

The server talks to FundingPips through your own headless Chromium, so
[Chromium or Google Chrome](https://www.google.com/chrome/) must be installed
on the machine (most systems have one already). If yours lives elsewhere,
point to it with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome bun run start`.

## What you get

- Session saved on your machine — no repeated logins; **Log out** clears it
- All FundingPips API calls go out from **your IP**, never a cloud server
- **Account filter** in the report bar: run the whole report or one account
- **Archived accounts** are detected automatically (a closed account returns
  401) and excluded by default — tick "Include archived" to bring them back
- **Timezone selector** — MatchTrader stores server time in UTC+0; "My time"
  uses your browser's clock

## Troubleshooting

- `login failed (HTTP 403)`: Cloudflare challenged your IP. Open the
  FundingPips sign-in page once in your browser to clear it, then retry.
- `session expired — please log in again`: the app logs you out automatically;
  just log back in.
- `chromium not found`: install Chromium or Google Chrome, or set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
- Port 8787 already in use: `fuser -k 8787/tcp`, then start again.
