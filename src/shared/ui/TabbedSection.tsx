import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePermissions } from '../permissions/usePermissions'

export interface SubTab {
  key:      string
  label:    string
  element:  ReactNode
  permKey?: string  // clé catalogue (ex: 'livraisons.devis') — absent = toujours visible
}

/**
 * Page à SOUS-ONGLETS générique.
 *
 * Masquage des onglets :
 *  - Seulement quand ready && !isPresident.
 *  - Tant que !ready : tous les onglets visibles (évite tout écran vide).
 *  - Si l'URL pointe vers un onglet masqué → redirige silencieusement vers le 1er visible.
 *  - Si tous les onglets sont masqués (ready) → "Accès non autorisé".
 */
export function TabbedSection({ tabs }: { tabs: SubTab[] }) {
  const [params, setParams] = useSearchParams()
  const { ready, isPresident, can } = usePermissions()

  const visibleTabs = (ready && !isPresident)
    ? tabs.filter(t => !t.permKey || can(t.permKey, 'view'))
    : tabs

  const current = params.get('tab')
  const active  = visibleTabs.find(t => t.key === current) ?? visibleTabs[0]

  const select = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    setParams(next)
  }

  if (visibleTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <p className="text-[var(--fs-sm)] font-medium text-[var(--text-muted)]">Accès non autorisé</p>
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
          Vous n'avez pas les droits pour accéder à cette section.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Barre de sous-onglets */}
      <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
        {visibleTabs.map(t => {
          const isActive = t.key === active?.key
          return (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              className={`px-4 py-2.5 text-[var(--fs-sm)] whitespace-nowrap transition-colors -mb-px
                ${isActive
                  ? 'text-[var(--brand)] border-b-2 border-[var(--brand)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] rounded-t-[var(--r-sm)]'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenu de l'onglet actif */}
      {active && <div key={active.key}>{active.element}</div>}
    </div>
  )
}
