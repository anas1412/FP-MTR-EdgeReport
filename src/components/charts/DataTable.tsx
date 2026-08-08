import { signed } from "../../lib/analyze"

export interface DataRow {
  label: string
  n: number
  wr: number
  avg: number | null
  s: number | null
}

export function DataTable({ title, rows }: { title: string; rows: DataRow[] }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>{title}</th>
          <th>Trades</th>
          <th>Win Rate</th>
          <th>Avg %</th>
          <th>Total %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">{r.n}</td>
            <td className="num">{r.wr.toFixed(1)}%</td>
            <td className="num">{r.avg === null ? "—" : <span className={r.avg < 0 ? "neg" : "pos"}>{signed(r.avg, 2)}</span>}</td>
            <td className="num">{r.s === null ? "—" : <span className={r.s < 0 ? "neg" : "pos"}>{signed(r.s, 2)}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}