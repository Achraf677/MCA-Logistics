import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface SubTab {
  key: string
  label: string
  element: ReactNode
}

/**
 * Page à SOUS-ONGLETS générique : barre de sous-onglets + contenu de l'onglet actif.
 * L'onglet actif est piloté par le query param `?tab=<key>` → liens profonds et
 * bouton retour navigateur fonctionnent ; défaut = 1er onglet.
 * Réutilisé par les domaines (Finance, Flotte, …) pour ré-agencer les pages existantes.
 */
export function TabbedSection({ tabs }: { tabs: SubTab[] }) {
  const [params, setParams] = useSearchParams()
  const current = params.get('tab')
  const active = tabs.find(t => t.key === current) ?? tabs[0]

  const select = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    setParams(next)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Barre de sous-onglets */}
      <div className="flex gap-0 border-b border-[var(--border)] overflow-x-auto">
        {tabs.map(t => {
          const isActive = t.key === active.key
          return (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              className={`px-4 py-2 text-[var(--fs-sm)] whitespace-nowrap transition-colors -mb-px
                ${isActive
                  ? 'text-[var(--brand)] border-b-2 border-[var(--brand)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenu de l'onglet actif (re-monté à chaque changement d'onglet) */}
      <div key={active.key}>{active.element}</div>
    </div>
  )
}
