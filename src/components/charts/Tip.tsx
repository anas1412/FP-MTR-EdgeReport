import { useRef, useState } from "react"

export interface TipState {
  x: number
  y: number
  html: string
}

// Tooltip that behaves like the original: fixed-position bubble clamped to the
// viewport, with a hidden probe used for measuring before it is placed.
export function useChartTip() {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<TipState | null>(null)

  const show = (ev: { clientX: number; clientY: number }, html: string) => {
    const probe = bodyRef.current
    if (!probe) return
    probe.innerHTML = html
    const w = probe.offsetWidth + 20 // +padding
    const h = probe.offsetHeight + 12
    let x = ev.clientX + 14
    let y = ev.clientY + 16
    if (x + w > innerWidth - 10) x = ev.clientX - w - 14
    if (y + h > innerHeight - 10) y = ev.clientY - h - 16
    setTip({ x, y, html })
  }

  const hide = () => setTip(null)

  return {
    show,
    hide,
    tip,
    probeRef: bodyRef,
  }
}

export function ChartTipHost({
  tip,
  probeRef,
}: {
  tip: TipState | null
  probeRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="chart-tip-host" aria-hidden="true">
      <div ref={probeRef} className="chart-tip-probe" />
      {tip && (
        <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
          <span dangerouslySetInnerHTML={{ __html: tip.html }} />
        </div>
      )}
    </div>
  )
}