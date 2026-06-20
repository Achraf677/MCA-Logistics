const PALETTES: [string, string][] = [
  ['#7bdcff', '#4c8dff'],
  ['#b6f5d8', '#1fd18e'],
  ['#ffd27b', '#ffb020'],
  ['#9b8cff', '#6c5ce7'],
  ['#7ce0c0', '#13b8a6'],
]

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  const a = p[0][0] ?? ''
  const b = p.length > 1 ? p[p.length - 1][0] : ''
  return (a + b).toUpperCase()
}

export function DriverAvatar({ name, size = 26 }: { name: string; size?: number }) {
  const h = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return (
    <span
      className="inline-grid place-items-center rounded-full shrink-0 font-semibold leading-none"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.42),
        color: '#0d1117',
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
    >
      {getInitials(name)}
    </span>
  )
}
