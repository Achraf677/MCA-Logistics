/**
 * Barres mensuelles — une barre par mois, la valeur écrite au-dessus.
 *
 * Remplace la courbe lissée pour les montants par mois : un mois est une
 * valeur discrète, pas un point sur une courbe continue (le lissage inventait
 * des bosses entre deux mois). Pur HTML/CSS : pas de SVG, net à toute taille.
 * Le dernier mois (en cours) est à la couleur de la marque, les autres adoucis.
 */
export function BarresMensuelles({ points, formatCourt, formatLong, hauteur = 150 }: {
  points: Array<{ libelle: string; valeur: number }>
  /** Valeur au-dessus de la barre (ex. « 1,9 k€ »). */
  formatCourt: (v: number) => string
  /** Infobulle (ex. « 1 894,59 € »). */
  formatLong: (v: number) => string
  hauteur?: number
}) {
  const max = Math.max(1, ...points.map(p => p.valeur))
  return (
    <div className="flex items-end gap-2" style={{ height: hauteur + 48 }}>
      {points.map((p, i) => {
        const dernier = i === points.length - 1
        const h = p.valeur > 0 ? Math.max(4, Math.round((p.valeur / max) * hauteur)) : 2
        return (
          <div key={`${p.libelle}-${i}`} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${p.libelle} : ${formatLong(p.valeur)}`}>
            <span className={`text-[var(--fs-xs)] tabular-nums mb-1 ${dernier ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>
              {p.valeur > 0 ? formatCourt(p.valeur) : '—'}
            </span>
            <div
              className="w-full max-w-[44px] rounded-t-[var(--r-sm)] transition-[height] duration-300"
              style={{
                height: h,
                background: dernier ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 35%, transparent)',
              }}
            />
            <span className="mt-1.5 text-[var(--fs-xs)] text-[var(--text-muted)] truncate max-w-full">{p.libelle}</span>
          </div>
        )
      })}
    </div>
  )
}
