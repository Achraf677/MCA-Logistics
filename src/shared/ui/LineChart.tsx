import { useState } from 'react'

interface Pt { label: string; value: number }

interface LineChartProps {
  points: Pt[]
  formatValue?: (v: number) => string
  formatAxisY?: (v: number) => string
}

/** Catmull-Rom → cubic Bezier, lissage fidèle aux données. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2)
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`
  const d: string[] = [`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, pts.length - 1)]
    const cp1x = (p1.x + (p2.x - p0.x) / 6).toFixed(1)
    const cp1y = (p1.y + (p2.y - p0.y) / 6).toFixed(1)
    const cp2x = (p2.x - (p3.x - p1.x) / 6).toFixed(1)
    const cp2y = (p2.y - (p3.y - p1.y) / 6).toFixed(1)
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`)
  }
  return d.join(' ')
}

export function LineChart({ points, formatValue, formatAxisY }: LineChartProps) {
  const W = 620, H = 220
  const padL = 52, padR = 18      // padL réservé aux labels Y
  const chartTop = 8, chartBot = H - 34

  const [hovered, setHovered] = useState<number | null>(null)
  const [tipPos, setTipPos] = useState({ pctX: 0, pctY: 0 })

  if (!points.length) return <div style={{ height: H }} />

  const vals  = points.map(p => p.value)
  const maxV  = Math.max(...vals, 1)
  const minV  = Math.min(...vals, 0)
  const span  = maxV - minV || 1

  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(points.length - 1, 1)
  const y = (v: number) => chartBot - ((v - minV) / span) * (chartBot - chartTop)

  const pts   = points.map((p, i) => ({ x: x(i), y: y(p.value) }))
  const lineD = smoothPath(pts)
  const areaD = `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${chartBot} L${pts[0].x.toFixed(1)},${chartBot} Z`

  const fmt     = formatValue ?? (v => String(v))
  const fmtAxis = formatAxisY ?? (v => {
    if (v === 0) return '0'
    if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`
    return String(Math.round(v))
  })

  const hpt     = hovered !== null ? points[hovered] : null
  const animKey = vals.join(',')

  // Grille Y : 3 niveaux (min, mid, max)
  const gridTicks = [0, 0.5, 1].map(f => ({
    value: minV + f * span,
    svgY: y(minV + f * span),
  }))

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const idx  = points.reduce((best, _, i) =>
      Math.abs(x(i) - svgX) < Math.abs(x(best) - svgX) ? i : best, 0)
    setHovered(idx)
    setTipPos({
      pctX: (e.clientX - rect.left) / rect.width,
      pctY: (e.clientY - rect.top)  / rect.height,
    })
  }

  const tipOnRight = tipPos.pctX > 0.65
  const tipAbove   = tipPos.pctY > 0.55

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ cursor: 'crosshair', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="lc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--gold)"  />
          </linearGradient>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0"    />
          </linearGradient>
          {/* Clip : empêche l'overshoot de la courbe de dépasser l'axe */}
          <clipPath id="lc-clip">
            <rect x={padL} y={chartTop} width={W - padL - padR} height={chartBot - chartTop + 1} />
          </clipPath>
        </defs>

        {/* Grille horizontale discrète */}
        {gridTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} y1={t.svgY} x2={W - padR} y2={t.svgY}
              stroke="var(--border)" strokeWidth="1" opacity="0.45"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={padL - 6} y={t.svgY + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-disabled)"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {fmtAxis(t.value)}
            </text>
          </g>
        ))}

        {/* Aire dégradée — clippée */}
        <path
          key={`area-${animKey}`}
          d={areaD}
          fill="url(#lc-area)"
          clipPath="url(#lc-clip)"
          className="lc-area"
        />

        {/* Courbe nette — clippée, un seul trait dégradé, sans glow */}
        <path
          key={`line-${animKey}`}
          d={lineD}
          fill="none"
          stroke="url(#lc-line)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          shapeRendering="geometricPrecision"
          vectorEffect="non-scaling-stroke"
          clipPath="url(#lc-clip)"
          pathLength="1"
          className="lc-line"
        />

        {/* Crosshair au survol */}
        {hovered !== null && (
          <line
            x1={x(hovered)} y1={chartTop} x2={x(hovered)} y2={chartBot}
            stroke="var(--text-disabled)" strokeWidth="1" strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Points + labels axe X */}
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
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x(i)} y={H - 3}
                textAnchor="middle"
                fontSize="11"
                fill={isHov ? 'var(--text)' : 'var(--text-muted)'}
                fontWeight={isHov ? '600' : 'normal'}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip HTML — hors SVG, pas de distorsion preserveAspectRatio */}
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
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {fmt(hpt.value)}
          </div>
        </div>
      )}
    </div>
  )
}
