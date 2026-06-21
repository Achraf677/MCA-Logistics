interface Pt { label: string; value: number }

export function LineChart({ points }: { points: Pt[] }) {
  const W = 620, H = 220, pad = 18
  if (!points.length) return <div style={{ height: H }} />
  const max = Math.max(...points.map(p => p.value), 1)
  const min = Math.min(...points.map(p => p.value), 0)
  const span = max - min || 1
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(points.length - 1, 1)
  const y = (v: number) => H - 34 - ((v - min) / span) * (H - 64)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length-1).toFixed(1)},${H-16} L${x(0).toFixed(1)},${H-16} Z`
  const peak = points.reduce((a, p, i) => (p.value > points[a].value ? i : a), 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lc-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--brand)"/>
          <stop offset="1" stopColor="var(--gold)"/>
        </linearGradient>
        <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0.28"/>
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0"/>
        </linearGradient>
        <filter id="lc-glow">
          <feGaussianBlur stdDeviation="3.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d={area} fill="url(#lc-area)" className="lc-area" />
      <path d={line} fill="none" stroke="url(#lc-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#lc-glow)" className="lc-line" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={i === peak ? 5.5 : 4} fill={i === peak ? 'var(--brand)' : 'var(--bg)'} stroke="url(#lc-line)" strokeWidth="2.5" />
          <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="11" fill="var(--text-muted)" style={{ fontFamily: 'var(--font-mono)' }}>{p.label}</text>
        </g>
      ))}
    </svg>
  )
}
