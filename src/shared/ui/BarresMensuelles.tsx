/**
 * Barres mensuelles — une barre par mois, la valeur écrite au-dessus.
 *
 * Remplace la courbe lissée pour les montants par mois : un mois est une
 * valeur discrète, pas un point sur une courbe continue (le lissage inventait
 * des bosses entre deux mois). Pur HTML/CSS : pas de SVG, net à toute taille.
 * Le mois sélectionné (sinon le dernier, en cours) passe en dégradé or → marque ;
 * les autres sont en dégradé de la couleur de marque. Repères horizontaux
 * discrets + ligne pointillée de moyenne.
 *
 * Hauteur : fixe (`hauteur`, px) ou, sans elle, REMPLIT son parent — les barres
 * sont en % de la zone disponible, le graphique suit la taille de l'écran.
 */
const HAUTEUR_ETIQUETTE = '1.75rem'

export function BarresMensuelles({ points, formatCourt, formatLong, hauteur, selection = null, onSelection, afficherMoyenne = true }: {
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
  /** Ligne pointillée = moyenne des mois non nuls. */
  afficherMoyenne?: boolean
}) {
  const max = Math.max(1, ...points.map(p => p.valeur))
  const NON_NULS = points.filter(p => p.valeur > 0)
  const moyenne = NON_NULS.length ? NON_NULS.reduce((s, p) => s + p.valeur, 0) / NON_NULS.length : 0
  // En % de la zone des barres ; 85 % max pour laisser la place à l'étiquette.
  const pctDe = (v: number) => (v / max) * 85

  return (
    <div className={`relative flex items-stretch gap-2 ${hauteur ? '' : 'h-full min-h-[8rem]'}`}
      style={hauteur ? { height: hauteur + 48 } : undefined}>
      {/* Repères : maximum, mi-hauteur, moyenne — dans la zone des barres, étiquettes exclues. */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ bottom: HAUTEUR_ETIQUETTE }} aria-hidden="true">
        {[85, 42.5].map(b => (
          <div key={b} className="absolute inset-x-0 border-t border-[var(--border-soft)]" style={{ bottom: `${b}%` }} />
        ))}
        {afficherMoyenne && moyenne > 0 && (
          <div className="absolute inset-x-0 border-t border-dashed border-[var(--gold)]/60" style={{ bottom: `${pctDe(moyenne)}%` }} />
        )}
      </div>
      {points.map((p, i) => {
        const dernier = i === points.length - 1
        // Sélection explicite, sinon le mois en cours est en avant.
        const enAvant = selection != null ? i === selection : dernier
        const pct = p.valeur > 0 ? Math.max(2, pctDe(p.valeur)) : 0
        const Balise = onSelection ? 'button' : 'div'
        return (
          <Balise key={`${p.libelle}-${i}`} type={onSelection ? 'button' : undefined}
            onClick={onSelection ? () => onSelection(i) : undefined}
            aria-pressed={onSelection ? enAvant && selection != null : undefined}
            className={`group relative flex-1 min-w-0 flex flex-col items-center ${onSelection ? 'cursor-pointer' : ''}`}
            title={`${p.libelle} : ${formatLong(p.valeur)}${onSelection ? ' — voir les livraisons' : ''}`}>
            <div className="flex-1 w-full flex flex-col items-center justify-end min-h-0">
              <span className={`text-xs tabular-nums mb-1 ${enAvant ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                {p.valeur > 0 ? formatCourt(p.valeur) : '—'}
              </span>
              <div
                className={`barre-monte w-full max-w-[3.25rem] rounded-t-[var(--r-md)] transition-[height,filter] duration-300 ${onSelection ? 'group-hover:brightness-125' : ''}`}
                style={{
                  ['--i' as string]: i,
                  height: pct > 0 ? `${pct}%` : 2,
                  background: enAvant
                    ? 'linear-gradient(180deg, var(--gold), var(--brand))'
                    : 'linear-gradient(180deg, color-mix(in srgb, var(--brand) 62%, transparent), color-mix(in srgb, var(--brand) 18%, transparent))',
                  boxShadow: enAvant ? '0 0 1.25rem -0.25rem var(--brand)' : undefined,
                }}
              />
            </div>
            <span className={`flex items-center text-xs truncate max-w-full ${enAvant ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}
              style={{ height: HAUTEUR_ETIQUETTE }}>{p.libelle}</span>
          </Balise>
        )
      })}
    </div>
  )
}
