import { useId } from 'react'

/**
 * Mini-courbe (sparkline) : tendance d'une série, sans axe ni étiquette.
 * Pur SVG, couleur = `var(--brand)` par défaut (suit le thème), s'étire à la
 * taille de son conteneur.
 */
export function MiniCourbe({ valeurs, couleur = 'var(--brand)', className = '' }: {
  valeurs: number[]
  couleur?: string
  className?: string
}) {
  const id = useId()
  if (valeurs.length < 2) return null
  const max = Math.max(...valeurs)
  const min = Math.min(...valeurs)
  const ecart = max - min || 1
  const L = 100, H = 32, marge = 3
  const pts = valeurs.map((v, i) => [
    (i / (valeurs.length - 1)) * L,
    H - marge - ((v - min) / ecart) * (H - marge * 2),
  ] as const)
  const ligne = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [dx, dy] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleur} stopOpacity=".35" />
          <stop offset="100%" stopColor={couleur} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${ligne} L${L} ${H} L0 ${H} Z`} fill={`url(#${id})`} />
      <path d={ligne} fill="none" stroke={couleur} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" />
      <circle cx={dx} cy={dy} r="1.8" fill={couleur} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
