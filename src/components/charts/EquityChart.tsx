import { useRef, useState } from "react"
import type { Ana } from "../../lib/analyze"
import { fmtFull, fmtShort, pad2, signed } from "../../lib/analyze"
import { ChartTipHost, useChartTip } from "./Tip"

const W = 720
const H = 250
const L = 46
const R = 8
const T = 16
const B = 30

export function EquityChart({ ana }: { ana: Ana }) {
  const { tip, show, hide, probeRef } = useChartTip()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const vals = ana.cum
  const max = Math.max(...vals.map(Math.abs), 1e-9)
  const y = (v: number) => T + ((H - T - B) / 2) * (1 - v / max)
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(vals.length - 1, 1)
  const ax = y(0)
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${y(v).toFixed(1)}`)

  const toVB = (ev: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const scale = Math.min(rect.width / W, rect.height / H)
    const offX = (rect.width - W * scale) / 2
    return (ev.clientX - rect.left - offX) / scale
  }

  const onMove = (ev: React.MouseEvent) => {
    const vbX = toVB(ev)
    if (vbX === null) return
    const i = Math.round((vbX - L) / ((W - L - R) / Math.max(vals.length - 1, 1)))
    if (i < 0 || i >= vals.length) {
      setHover(null)
      hide()
      return
    }
    setHover(i)
    show(
      { clientX: ev.clientX, clientY: ev.clientY },
      fmtFull(ana.T[i].dt) +
        " " +
        pad2(ana.T[i].dt.getUTCHours()) +
        ":" +
        pad2(ana.T[i].dt.getUTCMinutes()) +
        " — <b>" +
        signed(vals[i], 2) +
        "%</b>",
    )
  }

  return (
    <div className="chart-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onMouseMove={onMove} onMouseLeave={() => { setHover(null); hide() }}>
        <line x1={L} y1={ax} x2={W - R} y2={ax} stroke="#4A4238" strokeWidth="1" />
        {[1, -1].map((t) => {
          const vv = (max / 2) * t
          return (
            <g key={t}>
              <line x1={L} y1={y(vv)} x2={W - R} y2={y(vv)} stroke="#332C24" strokeWidth="1" />
              <text x={L - 6} y={y(vv) + 3} textAnchor="end" fontSize="11" fill="#948B7C">
                {Math.abs(vv) >= 100 ? Math.round(vv) : vv.toFixed(1)}
              </text>
            </g>
          )
        })}
        <polyline points={pts.join(" ")} fill="none" stroke="#C9962C" strokeWidth="1.5" />
        <polygon points={`${L},${ax} ${pts.join(" ")} ${W - R},${ax}`} fill="rgba(201,150,44,0.10)" />
        {hover !== null && (
          <line x1={X(hover)} y1={T} x2={X(hover)} y2={H - B} stroke="#C9962C" strokeWidth="1" opacity="0.5" />
        )}
        {vals.map((_, i) => (
          <circle
            key={i}
            cx={X(i).toFixed(1)}
            cy={y(vals[i]).toFixed(1)}
            r="3"
            fill="#C9962C"
            opacity={hover === i ? 0.9 : 0}
          />
        ))}
        <text x={L} y={H - 8} fontSize="12" fill="#948B7C">{fmtShort(ana.range[0]!)}</text>
        <text x={W - R} y={H - 8} textAnchor="end" fontSize="12" fill="#948B7C">{fmtShort(ana.range[1]!)}</text>
      </svg>
      <ChartTipHost tip={tip} probeRef={probeRef} />
    </div>
  )
}