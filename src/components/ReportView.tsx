import { useMemo, useState } from "react"
import type { Store, Trade } from "../types"
import { allTrades, setAccountSize } from "../lib/store"
import {
  analyze,
  computeInsights,
  currentOffset,
  DAYS3,
  DAYS_FULL,
  fmtFull,
  pad2,
  signed,
  tzLabel,
} from "../lib/analyze"
import { EquityChart } from "./charts/EquityChart"
import { BarChart } from "./charts/BarChart"
import { HeatmapTable } from "./charts/HeatmapTable"
import { DataTable } from "./charts/DataTable"

export interface ReportViewProps {
  store: Store
  onManage: () => void
  onExport: () => void
  onStore: (s: Store) => void
}

export function ReportView({ store, onManage, onExport, onStore }: ReportViewProps) {
  const [tz, setTz] = useState("auto")
  const [acct, setAcct] = useState("")
  const off = tz === "auto" ? currentOffset() : +tz

  const trades = useMemo(() => allTrades(store), [store])
  const filtered: Trade[] = useMemo(
    () => (acct ? trades.filter((t) => t[0] === acct) : trades),
    [trades, acct],
  )
  const sizes = useMemo(
    () =>
      new Map(
        store.accounts
          .filter((e) => e.size !== undefined)
          .map((e) => [e.accountId, e.size as number]),
      ),
    [store],
  )
  const ana = useMemo(() => analyze(filtered, off, sizes), [filtered, off, sizes])
  const ins = useMemo(() => computeInsights(ana), [ana])

  const tzl = tzLabel(off)
  const auto = tz === "auto"
  const acctIds = useMemo(() => [...new Set(trades.map((t) => t[0]))].sort(), [trades])

  const small = Object.values(ana.cA).filter((c) => c.n < 3).length

  const SIZES = [5000, 10000, 25000, 50000, 100000]

  const needSize = useMemo(
    () =>
      store.accounts.filter(
        (e) => e.size === undefined && e.rows.some((t) => t[2] === null),
      ),
    [store],
  )
  const pickSize = (id: string, size: number) => onStore(setAccountSize(store, id, size))
  const hasPct = ana.nKnown > 0

  const dayRows = ana.dayKeys.map((k) => ({
    label: DAYS_FULL[k],
    n: ana.dA[k].n,
    wr: ana.dA[k].wr,
    avg: hasPct ? ana.dA[k].avg : null,
    s: hasPct ? ana.dA[k].s : null,
  }))
  const hourRows = ana.hourKeys.map((h) => ({
    label: pad2(h) + ":00",
    n: ana.hA[h].n,
    wr: ana.hA[h].wr,
    avg: hasPct ? ana.hA[h].avg : null,
    s: hasPct ? ana.hA[h].s : null,
  }))
  const acctRows = Object.keys(ana.aA)
    .map((k) => {
      const agg = ana.aA[k]
      const known = ana.T.some((t) => t.acct === k && t.R !== null)
      return {
        label: k,
        n: agg.n,
        wr: agg.wr,
        avg: known ? agg.avg : null,
        s: known ? agg.s : null,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const tzOptions = (() => {
    const opts: Array<{ v: string; label: string }> = []
    for (let o = -11; o <= 14; o++) {
      opts.push({ v: String(o), label: `UTC${o >= 0 ? "+" : ""}${o}${o === 0 ? " (MatchTrader)" : ""}` })
    }
    return opts
  })()

  if (ana.n === 0) {
    return (
      <div className="wrap">
        <div className="eyebrow">FP-MTR EdgeReport</div>
        <h1>Trading Edge Report</h1>
        <div className="subtitle">
          <b>0</b> closed trades — upload CSVs to build the report.
        </div>
        <div className="appbar">
          <div className="spacer" />
          <button type="button" className="btn-export" onClick={onManage}>Manage files</button>
        </div>
        <p className="no-data">No trades yet — go back and add some CSVs.</p>
      </div>
    )
  }

  const sourceFiles = acctIds.map((id) => "CLOSED_POSITIONS_" + id).join(", ")

  return (
    <div className="wrap">
      <div className="eyebrow">FP-MTR EdgeReport · FundingPips</div>
      <h1>Trading Edge Report</h1>
      <div className="subtitle">
        <b>{ana.n}</b> closed trades across <b>{Object.keys(ana.aA).length}</b> account(s)
        &nbsp;·&nbsp; <span>{ana.range[0] && fmtFull(ana.range[0])} → {ana.range[1] && fmtFull(ana.range[1])}</span>
        &nbsp;·&nbsp; shown in <b>{tzl}</b>
        &nbsp;·&nbsp; owner: <b>uploaded locally — nothing leaves your browser</b>
      </div>

      <div className="appbar">
        <span className="tzlabel">Time zone</span>
        <select
          className="tz-select"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          aria-label="Time zone"
        >
          <option value="auto">{auto ? "My time (" + tzl + ")" : "My time (auto)"}</option>
          {tzOptions.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>
        <span className="tzlabel">Account</span>
        <select className="tz-select" value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {acctIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button type="button" className="btn-export" onClick={onExport}>Export HTML</button>
        <button type="button" className="btn-logout" onClick={onManage}>Manage files</button>
      </div>
      <div className="tzhint">MatchTrader exports server time in UTC+0. "My time" uses your browser's local clock; pick any other offset to view in a specific zone.</div>

      {needSize.length > 0 && (
        <div className="panel size-strip">
          <div className="panel-title">Set account sizes</div>
          <div className="size-desc">
            Your exports carry net P&amp;L in <b>$</b> but not account size — so return %, Avg RR, EV and
            Avg Profit / Trade can't be computed yet. Pick the size per account below (stored locally,
            used as the balance for <code>net / size</code>).
          </div>
          <div className="size-rows">
            {needSize.map((e) => (
              <div className="size-row" key={e.accountId}>
                <span className="size-id">{e.accountId}</span>
                <select
                  className="tz-select"
                  value=""
                  onChange={(ev) => pickSize(e.accountId, +ev.target.value)}
                  aria-label={`Account size for ${e.accountId}`}
                >
                  <option value="" disabled>choose size…</option>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>${s.toLocaleString("en-US")}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-strip">
        <div className="stat">
          <div className="label">Trades</div>
          <div className="value" id="sTradesV">{ana.n}</div>
        </div>
        <div className="stat">
          <div className="label">Win Rate</div>
          <div className="value">{ins.winRate.toFixed(1)}%</div>
        </div>
        <div className="stat">
          <div className="label">Avg RR</div>
          <div className={`value ${ins.rr >= 1 ? "pos" : "neg"}`}>{hasPct && ins.rr ? ins.rr.toFixed(2) : "—"}</div>
          <div className="sub">avg RR, no BE, no losses</div>
        </div>
        <div className="stat">
          <div className="label">Avg Profit / Trade</div>
          <div className={`value ${ins.avgW < 0 ? "neg" : "pos"}`}>{hasPct ? signed(ins.avgW, 2) + "%" : "—"}</div>
          <div className="sub">winners only, above 0.2%</div>
        </div>
        <div className="stat">
          <div className="label">Total Return</div>
          <div className={`value ${ana.sumR < 0 ? "neg" : "pos"}`}>{hasPct ? signed(ana.sumR, 2) + "%" : "—"}</div>
        </div>
        <div className="stat">
          <div className="label">EV / Trade</div>
          <div className={`value ${ins.ev < 0 ? "neg" : "pos"}`}>{hasPct ? signed(ins.ev, 2) + "%" : "—"}</div>
          <div className="sub">expected value, per trade</div>
        </div>
        <div className="stat">
          <div className="label">Best Window</div>
          <div className="value">{ins.best ? ins.best.cell : "—"}</div>
          <div className="sub">{ins.best ? ins.best.meta : ""}</div>
        </div>
      </div>

      <section>
        <div className="section-head">
          <span className="section-num">01</span>
          <h2>Equity Curve — Cumulative Return</h2>
        </div>
        <div className="section-desc">Running total of % return in chronological order across all accounts. Flat or declining stretches are where the edge disappeared, not just where losses happened to cluster.</div>
        <div className="panel">
          <div className="panel-title">Cumulative return (%)</div>
          <EquityChart ana={ana} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <span className="section-num">02</span>
          <h2>Edge by Day of Week</h2>
        </div>
        <div className="section-desc">Grouped by the day you <i>entered</i> the trade — not when it closed. Avg % is your expectancy per trade, total % is the reward that day.</div>
        <div className="grid-3">
          <div className="panel">
            <div className="panel-title">Avg return by weekday</div>
            <BarChart
              items={ana.dayKeys.map((k) => ({ label: DAYS3[k], v: ana.dA[k].avg }))}
              mode="r"
              fmt={(i) => `${DAYS_FULL[ana.dayKeys[i]]} — avg <b>${signed(ana.dA[ana.dayKeys[i]].avg, 2)}%</b> over ${ana.dA[ana.dayKeys[i]].n} trades`}
            />
          </div>
          <div className="panel">
            <div className="panel-title">Total return by weekday</div>
            <BarChart
              items={ana.dayKeys.map((k) => ({ label: DAYS3[k], v: ana.dA[k].s }))}
              mode="r"
              fmt={(i) => `${DAYS_FULL[ana.dayKeys[i]]} — total <b>${signed(ana.dA[ana.dayKeys[i]].s, 2)}%</b> over ${ana.dA[ana.dayKeys[i]].n} trades`}
            />
          </div>
          <div className="panel">
            <div className="panel-title">Trade frequency by weekday</div>
            <BarChart
              items={ana.dayKeys.map((k) => ({ label: DAYS3[k], v: ana.dA[k].n }))}
              mode="n"
              fmt={(i) => `${DAYS_FULL[ana.dayKeys[i]]} — <b>${ana.dA[ana.dayKeys[i]].n}</b> trades`}
            />
          </div>
        </div>
        <DataTable title="Day" rows={dayRows} />
      </section>

      <section>
        <div className="section-head">
          <span className="section-num">03</span>
          <h2>Edge by Entry Hour</h2>
        </div>
        <div className="section-desc">Same idea, by clock hour of entry (platform time, shown in <span>{tzl}</span>). This is usually the sharpest lens on "when to avoid, when to trade."</div>
        <div className="grid-3">
          <div className="panel">
            <div className="panel-title">Avg return by hour</div>
            <BarChart
              items={ana.hourKeys.map((h) => ({ label: pad2(h) + ":00", v: ana.hA[h].avg }))}
              mode="r"
              fmt={(i) => `${pad2(ana.hourKeys[i])}:00 — avg <b>${signed(ana.hA[ana.hourKeys[i]].avg, 2)}%</b> over ${ana.hA[ana.hourKeys[i]].n} trades`}
            />
          </div>
          <div className="panel">
            <div className="panel-title">Total return by hour</div>
            <BarChart
              items={ana.hourKeys.map((h) => ({ label: pad2(h) + ":00", v: ana.hA[h].s }))}
              mode="r"
              fmt={(i) => `${pad2(ana.hourKeys[i])}:00 — total <b>${signed(ana.hA[ana.hourKeys[i]].s, 2)}%</b> over ${ana.hA[ana.hourKeys[i]].n} trades`}
            />
          </div>
          <div className="panel">
            <div className="panel-title">Trade frequency by hour</div>
            <BarChart
              items={ana.hourKeys.map((h) => ({ label: pad2(h) + ":00", v: ana.hA[h].n }))}
              mode="n"
              fmt={(i) => `${pad2(ana.hourKeys[i])}:00 — <b>${ana.hA[ana.hourKeys[i]].n}</b> trades`}
            />
          </div>
        </div>
        <DataTable title="Hour" rows={hourRows} />
      </section>

      <section>
        <div className="section-head">
          <span className="section-num">04</span>
          <h2>Weekday × Hour Matrix</h2>
        </div>
        <div className="section-desc">Every cell is a day/hour combination: top is avg %, middle is total %, bottom is trade count. Green = positive expectancy, red = negative. Empty cells mean you haven't traded that slot yet.</div>
        <HeatmapTable ana={ana} />
        <div className="note">{small} weekday/hour cells have fewer than 3 trades — treat those numbers as early signal, not proof.</div>
      </section>

      <section>
        <div className="section-head">
          <span className="section-num">05</span>
          <h2>Takeaways</h2>
        </div>
        <div className="callout">
          <ul>
            {ins.ev >= 0.2 ? (
              <li><b>EV / trade:</b> {signed(ins.ev, 2)}% — above the 0.2% bar. Over 100 trades at this edge that is ~{signed(ins.ev * 100, 1)}% on the account.</li>
            ) : (
              <li><b>EV / trade:</b> {signed(ins.ev, 2)}% — below the 0.2% bar. Either use bigger risk per trade or improve your average RR. More RR usually costs win rate, so find the balance that keeps EV above 0.2%.</li>
            )}
            <li><b>Winners vs losers:</b> winners above 0.2% average {signed(ins.avgW, 2)}% ({ana.T.filter((t) => t.R !== null && t.R > 0.2).length} trades), losers average {signed(ins.avgL, 2)}% at a {ins.winRate.toFixed(1)}% win rate — it is the size of winners vs losers that drives the total, not the win rate.</li>
            <li><b>Best day:</b> {DAYS_FULL[ins.bestDay.k]} — total {signed(ins.bestDay.a.s, 2)}% over {ins.bestDay.a.n} trades.</li>
            <li><b>Worst day:</b> {DAYS_FULL[ins.worstDay.k]} — avg % {signed(ins.worstDay.a.avg, 2)} over {ins.worstDay.a.n} trades{ins.worstDay.a.avg < 0 ? " — consider sitting this one out or cutting size." : ""}</li>
            <li><b>Best hour:</b> {pad2(ins.bestHour.h)}:00 — total {signed(ins.bestHour.a.s, 2)}% over {ins.bestHour.a.n} trades.</li>
            <li><b>Worst hour:</b> {pad2(ins.worstHour.h)}:00 — avg % {signed(ins.worstHour.a.avg, 2)} over {ins.worstHour.a.n} trades{ins.worstHour.a.avg < 0 ? " — this window is bleeding expectancy." : ""}</li>
            <li><b>Busiest hour:</b> {pad2(ins.busiest.h)}:00 with {ins.busiest.a.n} trades — check whether volume there matches the edge, or if you're just present out of habit.</li>
            <li>Read Avg % together with trade count. A great number on 2–3 trades is noise, not an edge — wait for more data before acting on it.</li>
          </ul>
        </div>
      </section>

      <section>
        <div className="section-head">
          <span className="section-num">06</span>
          <h2>By Account</h2>
        </div>
        <DataTable title="Account" rows={acctRows} />
      </section>

      <footer>
        <span>% return = net P&L ÷ account balance</span>
        <span>Source files: {sourceFiles}</span>
      </footer>
    </div>
  )
}