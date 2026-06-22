import { useState } from 'react'

interface Pt { label: string; value: number }

interface LineChartProps {
  points: Pt[]
  formatValue?: (v: number) => string
}

export function LineChart({ points, formatValue }: LineChartProps) {
  const W = 620, H = 220, pad = 18
  const chartTop = 8, chartBot = H - 34

  const [hovered, setHovered] = useState<number | null>(null)
  const [tipPos, setTipPos] = useState({ pctX: 0, pctY: 0 })

  if (!points.length) return <div style={{ height: H }} />

  const vals = points.map(p => p.value)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = max - min || 1

  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(points.length - 1, 1)
  const y = (v: number) => chartBot - ((v - min) / span) * (chartBot - chartTop)

  const lineD = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const areaD = `${lineD} L${x(points.length - 1).toFixed(1)},${chartBot} L${x(0).toFixed(1)},${chartBot} Z`
  const peak = vals.reduce((a, v, i) => (v > vals[a] ? i : a), 0)

  const fmt = formatValue ?? (v => String(v))
  const hpt = hovered !== null ? points[hovered] : null

  // Key changes when data changes → CSS animation re-triggers via DOM replacement
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
  const tipAbove = tipPos.pctY > 0.55

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
            <stop offset="1" stopColor="var(--gold)" />
          </linearGradient>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
          <filter id="lc-glow">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Aire dégradée */}
        <path key={`area-${animKey}`} d={areaD} fill="url(#lc-area)" className="lc-area" />

        {/* Courbe draw-in — pathLength="1" normalise l'offset pour le CSS */}
        <path key={`line-${animKey}`} d={lineD} fill="none" stroke="url(#lc-line)"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          filter="url(#lc-glow)" pathLength="1" className="lc-line" />

        {/* Crosshair */}
        {hovered !== null && (
          <line
            x1={x(hovered)} y1={chartTop} x2={x(hovered)} y2={chartBot}
            stroke="var(--text-disabled)" strokeWidth="1" strokeDasharray="4 3"
          />
        )}

        {/* Points + labels */}
        {points.map((p, i) => {
          const isHov = i === hovered
          const isPeak = i === peak
          return (
            <g key={i}>
              {isHov && (
                <circle cx={x(i)} cy={y(p.value)} r={16}
                  fill="var(--brand)" opacity="0.12" />
              )}
              <circle
                cx={x(i)} cy={y(p.value)}
                r={isHov ? 6 : isPeak ? 5.5 : 4}
                fill={isHov || isPeak ? 'var(--brand)' : 'var(--bg)'}
                stroke="url(#lc-line)" strokeWidth="2.5"
              />
              <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="11"
                fill={isHov ? 'var(--text)' : 'var(--text-muted)'}
                fontWeight={isHov ? '600' : 'normal'}
                style={{ fontFamily: 'var(--font-mono)' }}>
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip HTML overlay — positionné en % du container, pas de distorsion SVG */}
      {hpt && hovered !== null && (
        <div style={{
          position: 'absolute',
          left: tipOnRight ? undefined : `calc(${tipPos.pctX * 100}% + 12px)`,
          right: tipOnRight ? `calc(${(1 - tipPos.pctX) * 100}% + 12px)` : undefined,
          top: tipAbove ? undefined : `calc(${tipPos.pctY * 100}% - 8px)`,
          bottom: tipAbove ? `calc(${(1 - tipPos.pctY) * 100}% + 8px)` : undefined,
          pointerEvents: 'none',
          zIndex: 10,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '6px 10px',
          minWidth: '88px',
          boxShadow: 'var(--shadow-card)',
          whiteSpace: 'nowrap',
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
