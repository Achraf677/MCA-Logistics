import type { ReactNode } from 'react'

export type TonCarte = 'brand' | 'gold' | 'info' | 'success' | 'danger' | 'violet' | 'neutral'

/** Couleur de thème d'un ton (jamais d'hexadécimal : les 4 thèmes écrasent ces variables). */
export const COULEUR_TON: Record<TonCarte, string> = {
  brand: 'var(--brand)',
  gold: 'var(--gold)',
  info: 'var(--info)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  violet: 'var(--accent-violet)',
  neutral: 'var(--text-muted)',
}

/** Pastille d'icône ronde teintée, identique dans toutes les cartes. */
export function PastilleIcone({ icone, ton = 'neutral' }: { icone: ReactNode; ton?: TonCarte }) {
  const c = COULEUR_TON[ton]
  return (
    <span className="inline-grid place-items-center h-7 w-7 shrink-0 rounded-full"
      style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
      {icone}
    </span>
  )
}

/**
 * Carte standard de la charte : fond carte, bordure fine, ombre douce, reflet
 * de la couleur de marque en haut. `accent` ajoute un liseré coloré à gauche.
 * Pas de backdrop-filter (cartes qui défilent : voir CLAUDE.md § 8).
 */
export function SectionCard({ titre, icone, ton = 'neutral', sous, droite, accent, children, className = '', corpsClassName = '' }: {
  titre?: string
  icone?: ReactNode
  ton?: TonCarte
  sous?: string
  droite?: ReactNode
  accent?: TonCarte
  children: ReactNode
  className?: string
  corpsClassName?: string
}) {
  return (
    <section
      className={`relative rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] overflow-hidden ${className}`}
      style={{
        backgroundImage: 'radial-gradient(120% 90% at 0% 0%, var(--glow-1), transparent 60%)',
        ...(accent ? { boxShadow: `inset 3px 0 0 ${COULEUR_TON[accent]}, var(--shadow-card)` } : null),
      }}>
      {(titre || droite) && (
        <header className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {icone && <PastilleIcone icone={icone} ton={ton} />}
            <div className="min-w-0">
              {titre && <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--text)] truncate">{titre}</h2>}
              {sous && <p className="text-xs text-[var(--text-muted)] truncate">{sous}</p>}
            </div>
          </div>
          {droite}
        </header>
      )}
      <div className={corpsClassName}>{children}</div>
    </section>
  )
}
