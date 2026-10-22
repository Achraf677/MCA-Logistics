import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Un mois d'une liste Finance : en-tête cliquable (mois · résumé), contenu replié ou ouvert.
 * Le mois courant est ouvert d'office, les autres repliés (`ouvertDefaut`).
 */
export function GroupeMois({ titre, resume, ouvertDefaut, children }: {
  titre: string
  resume?: ReactNode
  ouvertDefaut: boolean
  children: ReactNode
}) {
  const [ouvert, setOuvert] = useState(ouvertDefaut)
  return (
    <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-card-hover)] transition-colors">
        <ChevronDown size={15} className={`shrink-0 text-[var(--text-muted)] transition-transform ${ouvert ? '' : '-rotate-90'}`} />
        <span className="font-display font-semibold text-[var(--text)]">{titre}</span>
        {resume && <span className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)] tabular-nums">{resume}</span>}
      </button>
      {ouvert && <div className="border-t border-[var(--border)]">{children}</div>}
    </section>
  )
}
