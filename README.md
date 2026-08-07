# FP-MTR EdgeReport

Your FundingPips MatchTrader trading edge report, as a local website.

Log in with your FundingPips email and password, and the site fetches every
account's closed trades and builds your interactive edge report: win rate,
avg return %, total return %, EV per trade, day-of-week and hour-of-day edges,
the weekday×hour heatmap, best window.

## How to run

Install [Bun](https://bun.sh) (one-time):

```bash
curl -fsSL https://bun.sh/install | bash
```

Then get the code and start it:

```bash
git clone https://github.com/anas1412/FP-MTR-EdgeReport
cd FP-MTR-EdgeReport
bun install
bun run start
```

Open **http://localhost:8787** in your browser and log in with your FundingPips credentials.

## What you get

- Session saved on your machine — no repeated logins; **Log out** clears it
- All FundingPips API calls go out from **your IP**, never a cloud server
- **Account filter** in the report bar: run the whole report or one account

## Troubleshooting

- `login failed (HTTP 403)`: Cloudflare challenged your IP. Open the
  FundingPips sign-in page once in your browser to clear it, then retry.
- `session expired — please log in again`: the app logs you out automatically;
  just log back in.
- `chromium not found`: install Chromium or Google Chrome, or set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
- Port 8787 already in use: `fuser -k 8787/tcp`, then start again.
