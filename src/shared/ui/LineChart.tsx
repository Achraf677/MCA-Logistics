import { useState, useEffect, useRef } from 'react'

interface Pt { label: string; value: number }

interface LineChartProps {
  points: Pt[]
  formatValue?: (v: number) => string
}

/** Catmull-Rom → cubic Bezier pour une courbe lissée passant par chaque point. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`
  const d: string[] = [`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, pts.length - 1)]
    const cp1x = (p1.x + (p2.x - p0.x) / 6).toFixed(1)
    const cp2x = (p2.x - (p3.x - p1.x) / 6).toFixed(1)
    // Clamp vertical uniquement : empêche l'undershoot/overshoot sans casser le lissage horizontal
    const yLo = Math.min(p1.y, p2.y), yHi = Math.max(p1.y, p2.y)
    const cp1y = Math.min(yHi, Math.max(yLo, p1.y + (p2.y - p0.y) / 6)).toFixed(1)
    const cp2y = Math.min(yHi, Math.max(yLo, p2.y - (p3.y - p1.y) / 6)).toFixed(1)
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`)
  }
  return d.join(' ')
}

export function LineChart({ points, formatValue }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // W mesuré en px → viewBox identique → ratio 1:1, aucune distorsion
  const [W, setW] = useState(620)
  const H = 220, pad = 18
  const chartTop = 8
  // Labels mois maintenant en HTML sous le SVG → on récupère le bas
  const chartBot = H - 10

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (w > 0) setW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [hovered, setHovered] = useState<number | null>(null)
  const [tipPos, setTipPos] = useState({ pctX: 0, pctY: 0 })

  if (!points.length) return <div ref={containerRef} style={{ height: H + 24 }} />

  const vals = points.map(p => p.value)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = max - min || 1
  const hasNegative = vals.some(v => v < 0)

  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(points.length - 1, 1)
  const y = (v: number) => chartBot - ((v - min) / span) * (chartBot - chartTop)

  const pts = points.map((p, i) => ({ x: x(i), y: y(p.value) }))
  const lineD = smoothPath(pts)
  const areaD = `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${chartBot} L${pts[0].x.toFixed(1)},${chartBot} Z`

  const fmt = formatValue ?? (v => String(v))
  const hpt = hovered !== null ? points[hovered] : null
  // animKey basé sur les données UNIQUEMENT — le resize ne redéclenche pas l'animation
  const animKey = vals.join(',')

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const idx = points.reduce((best, _, i) =>
      Math.abs(x(i) - svgX) < Math.abs(x(best) - svgX) ? i : best, 0)
    setHovered(idx)
    setTipPos({
      pctX: (e.clientX - rect.left) / rect.width,
      pctY: (e.clientY - rect.top) / rect.height,
    })
  }

  const tipOnRight = tipPos.pctX > 0.65
  const tipAbove   = tipPos.pctY > 0.55

  return (
    <div ref={containerRef}>
      {/* Wrapper SVG avec position:relative pour le tooltip */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          style={{ cursor: 'crosshair', display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="lc-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--brand)" />
              <stop offset="1" stopColor="var(--gold)" />
            </linearGradient>
            <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Aire dégradée */}
          <path key={`area-${animKey}`} d={areaD} fill="url(#lc-area)" className="lc-area" />

          {/* Courbe — vector-effect évite l'épaisseur variable si scale résiduel */}
          <path
            key={`line-${animKey}`}
            d={lineD}
            fill="none"
            stroke="url(#lc-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            shapeRendering="geometricPrecision"
            pathLength="1"
            className="lc-line"
            vectorEffect="non-scaling-stroke"
          />

          {/* Ligne zéro (marge négative) */}
          {hasNegative && (
            <line
              x1={pad} y1={y(0)} x2={W - pad} y2={y(0)}
              stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Crosshair */}
          {hovered !== null && (
            <line
              x1={x(hovered)} y1={chartTop} x2={x(hovered)} y2={chartBot}
              stroke="var(--text-disabled)" strokeWidth="1" strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Points — pas de <text> SVG, labels en HTML ci-dessous */}
          {points.map((p, i) => {
            const isHov = i === hovered
            return (
              <g key={i}>
                {isHov && (
                  <circle cx={x(i)} cy={y(p.value)} r={14}
                    fill="var(--brand)" opacity="0.15" />
                )}
                <circle
                  cx={x(i)} cy={y(p.value)}
                  r={isHov ? 5.5 : 3.5}
                  fill="var(--brand)"
                  stroke="var(--bg-card)"
                  strokeWidth="2"
                  shapeRendering="geometricPrecision"
                />
              </g>
            )
          })}
        </svg>

        {/* Tooltip HTML — positionné relatif au wrapper SVG */}
        {hpt && hovered !== null && (
          <div style={{
            position: 'absolute',
            left:   tipOnRight ? undefined : `calc(${tipPos.pctX * 100}% + 12px)`,
            right:  tipOnRight ? `calc(${(1 - tipPos.pctX) * 100}% + 12px)` : undefined,
            top:    tipAbove   ? undefined : `calc(${tipPos.pctY * 100}% - 8px)`,
            bottom: tipAbove   ? `calc(${(1 - tipPos.pctY) * 100}% + 8px)` : undefined,
            pointerEvents: 'none',
            zIndex: 10,
            background:   'var(--bg-elevated)',
            border:       '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding:      '6px 10px',
            minWidth:     '88px',
            boxShadow:    'var(--shadow-card)',
            whiteSpace:   'nowrap',
          }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
              {hpt.label}
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: hpt.value < 0 ? 'var(--danger)' : 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {fmt(hpt.value)}
            </div>
          </div>
        )}
      </div>

      {/* Labels mois en HTML — netteté native du navigateur, aucun étirement SVG */}
      <div style={{ position: 'relative', height: 20, marginTop: 3 }}>
        {points.map((p, i) => {
          const isHov = i === hovered
          return (
            <span
              key={i}
              style={{
                position:  'absolute',
                left:      `${(x(i) / W) * 100}%`,
                transform: 'translateX(-50%)',
                fontSize:  11,
                fontFamily:'var(--font-mono)',
                color:     isHov ? 'var(--text)' : 'var(--text-muted)',
                fontWeight:isHov ? 600 : 400,
                whiteSpace:'nowrap',
                lineHeight:'1',
                userSelect:'none',
              }}
            >
              {p.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
