import type { Ana } from "../../lib/analyze"
import { DAYS3, DAYS_FULL, pad2, signed } from "../../lib/analyze"

export function HeatmapTable({ ana }: { ana: Ana }) {
  const colHours = ana.hourKeys.slice()
  let rows = [1, 2, 3, 4, 5]
  if (ana.dayKeys.some((k) => k === 0)) rows.push(0)
  if (ana.dayKeys.some((k) => k === 6)) rows.push(6)

  let small = 0

  return (
    <table className="heatmap">
      <thead>
        <tr>
          <th></th>
          {colHours.map((h) => (
            <th key={h}>{pad2(h)}h</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d}>
            <td className="wd-label">{DAYS3[d]}</td>
            {colHours.map((h) => {
              const k = d + ":" + h
              const c = ana.cA[k]
              if (!c) {
                return (
                  <td key={k} className="heat-cell empty">
                    &middot;
                  </td>
                )
              }
              if (c.n < 3) small++
              const alpha = Math.min(0.65, 0.1 + 0.018 * Math.abs(c.avg))
              const col = c.avg < 0 ? "217,83,79" : "76,175,125"
              return (
                <td
                  key={k}
                  className="heat-cell"
                  style={{ background: `rgba(${col},${alpha.toFixed(2)})` }}
                  title={`${DAYS_FULL[d]} ${pad2(h)}:00 — ${c.n} trades, avg % ${signed(c.avg, 1)}, total % ${signed(c.s, 1)}`}
                >
                  <span className="heat-r">{signed(c.avg, 1)}</span>
                  <span className="heat-t">{signed(c.s, 1)}%</span>
                  <span className="heat-n">{c.n}t</span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}