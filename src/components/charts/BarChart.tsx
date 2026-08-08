import { useRef, useState } from "react"
import { signed } from "../../lib/analyze"
import { ChartTipHost, useChartTip } from "./Tip"

const W = 720
const H = 250
const L = 46
const R = 8
const T = 16
const B = 30

export interface BarItem {
  label: string
  v: number
}

export function BarChart({
  items,
  mode,
  fmt,
}: {
  items: BarItem[]
  mode: "r" | "n"
  fmt: (i: number) => string
}) {
  const { tip, show, hide, probeRef } = useChartTip()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const vals = items.map((i) => i.v)
  const max = Math.max(...vals.map(Math.abs), 1e-9)
  const plotH = H - T - B
  const band = (W - L - R) / items.length
  const bw = Math.min(band * 0.58, 44)
  const ax = T + plotH / 2
  const y = (v: number) => T + (plotH / 2) * (1 - v / max)

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
    for (let i = 0; i < items.length; i++) {
      const cx = L + band * i + band / 2
      if (vbX >= cx - bw / 2 && vbX <= cx + bw / 2) {
        setHover(i)
        show({ clientX: ev.clientX, clientY: ev.clientY }, fmt(i))
        return
      }
    }
    setHover(null)
    hide()
  }

  return (
    <div className="chart-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onMouseMove={onMove} onMouseLeave={() => { setHover(null); hide() }}>
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
        <line x1={L} y1={ax} x2={W - R} y2={ax} stroke="#4A4238" strokeWidth="1" />
        {items.map((it, i) => {
          const v = it.v
          const h = (Math.abs(v) / max) * (plotH / 2)
          const fill = mode === "n" ? "#C9962C" : v < -1e-9 ? "#D9534F" : v > 1e-9 ? "#4CAF7D" : "#5A5248"
          const x = L + band * i + band / 2
          const ly = v >= 0 ? ax - h - 5 : ax + h + 12
          return (
            <g key={i}>
              <rect
                x={x - bw / 2}
                y={v >= 0 ? ax - h : ax}
                width={bw}
                height={Math.max(h, 1)}
                fill={fill}
                opacity={hover === null || hover === i ? 0.9 : 0.35}
              />
              <text x={x} y={ly} textAnchor="middle" fontSize="12" fill={v < -1e-9 ? "#D9534F" : "#E3B95A"}>
                {mode === "n" ? v : signed(v, 1)}
              </text>
              <text x={x} y={H - 8} textAnchor="middle" fontSize="12.5" fill="#948B7C">{it.label}</text>
            </g>
          )
        })}
      </svg>
      <ChartTipHost tip={tip} probeRef={probeRef} />
    </div>
  )
}