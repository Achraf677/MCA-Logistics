/**
 * Barres mensuelles — une barre par mois, la valeur écrite au-dessus.
 *
 * Remplace la courbe lissée pour les montants par mois : un mois est une
 * valeur discrète, pas un point sur une courbe continue (le lissage inventait
 * des bosses entre deux mois). Pur HTML/CSS : pas de SVG, net à toute taille.
 * Le mois sélectionné (sinon le dernier, en cours) est à la couleur de la marque.
 *
 * Hauteur : fixe (`hauteur`, px) ou, sans elle, REMPLIT son parent — les barres
 * sont en % de la zone disponible, le graphique suit la taille de l'écran.
 */
export function BarresMensuelles({ points, formatCourt, formatLong, hauteur, selection = null, onSelection }: {
  points: Array<{ libelle: string; valeur: number }>
  /** Valeur au-dessus de la barre (ex. « 1,9 k€ »). */
  formatCourt: (v: number) => string
  /** Infobulle (ex. « 1 894,59 € »). */
  formatLong: (v: number) => string
  /** Hauteur des barres en px ; absente = remplit le parent (qui doit avoir une hauteur). */
  hauteur?: number
  /** Index de la barre sélectionnée (mise en avant), ou null. */
  selection?: number | null
  /** Rend les barres cliquables. */
  onSelection?: (index: number) => void
}) {
  const max = Math.max(1, ...points.map(p => p.valeur))
  return (
    <div className={`flex items-stretch gap-2 ${hauteur ? '' : 'h-full min-h-[8rem]'}`}
      style={hauteur ? { height: hauteur + 48 } : undefined}>
      {points.map((p, i) => {
        const dernier = i === points.length - 1
        // Sélection explicite, sinon le mois en cours est en avant.
        const enAvant = selection != null ? i === selection : dernier
        // En % de la zone des barres ; 85 % max pour laisser la place à l'étiquette.
        const pct = p.valeur > 0 ? Math.max(2, (p.valeur / max) * 85) : 0
        const Balise = onSelection ? 'button' : 'div'
        return (
          <Balise key={`${p.libelle}-${i}`} type={onSelection ? 'button' : undefined}
            onClick={onSelection ? () => onSelection(i) : undefined}
            aria-pressed={onSelection ? enAvant && selection != null : undefined}
            className={`group flex-1 min-w-0 flex flex-col items-center ${onSelection ? 'cursor-pointer' : ''}`}
            title={`${p.libelle} : ${formatLong(p.valeur)}${onSelection ? ' — voir les livraisons' : ''}`}>
            <div className="flex-1 w-full flex flex-col items-center justify-end min-h-0">
              <span className={`text-xs tabular-nums mb-1 ${enAvant ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                {p.valeur > 0 ? formatCourt(p.valeur) : '—'}
              </span>
              <div
                className={`w-full max-w-[2.75rem] rounded-t-[var(--r-sm)] transition-[height,filter] duration-300 ${onSelection ? 'group-hover:brightness-125' : ''}`}
                style={{
                  height: pct > 0 ? `${pct}%` : 2,
                  background: enAvant ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 35%, transparent)',
                }}
              />
            </div>
            <span className={`mt-1.5 text-xs truncate max-w-full ${enAvant && selection != null ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>{p.libelle}</span>
          </Balise>
        )
      })}
    </div>
  )
}
