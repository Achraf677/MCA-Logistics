import { Route, ClipboardList, Receipt, User, type LucideIcon } from 'lucide-react'
import type { OngletEspace } from './espace.logic'

const ONGLETS: Array<{ cle: OngletEspace; libelle: string; icone: LucideIcon }> = [
  { cle: 'courses', libelle: 'Courses', icone: Route },
  { cle: 'tournee', libelle: 'Ma tournée', icone: ClipboardList },
  { cle: 'depenses', libelle: 'Dépenses', icone: Receipt },
  { cle: 'moi', libelle: 'Moi', icone: User },
]

/**
 * Navigation de l'espace salarié, en bas de l'écran : sous le pouce, une main.
 * Sur PC elle reste en bas, centrée, à la largeur de la colonne.
 */
export function BarreOnglets({ actif, onChange, pastilles = {} }: {
  actif: OngletEspace
  onChange: (o: OngletEspace) => void
  /** Petit point sur un onglet qui attend un geste (ex. journée à corriger). */
  pastilles?: Partial<Record<OngletEspace, boolean>>
}) {
  return (
    <>
      {/* Espace réservé : la barre ne cache jamais le bas de la page. */}
      <div className="h-24" aria-hidden />
      <nav aria-label="Espace salarié"
        className="fixed z-[15] inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--bg-card)]
          pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[40rem] grid grid-cols-4">
          {ONGLETS.map(o => {
            const Icone = o.icone
            const on = o.cle === actif
            return (
              <button key={o.cle} onClick={() => onChange(o.cle)} aria-current={on ? 'page' : undefined}
                className={`relative min-h-16 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                  on ? 'text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                <span className="relative">
                  <Icone size={22} strokeWidth={on ? 2.4 : 1.8} />
                  {pastilles[o.cle] && (
                    <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--danger)] border-2 border-[var(--bg-card)]" />
                  )}
                </span>
                {o.libelle}
                {on && <span className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-[var(--brand)]" />}
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
