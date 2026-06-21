import { useSearchParams } from 'react-router-dom'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePermissions } from '../permissions/usePermissions'

export interface SubTab {
  key:      string
  label:    string
  element:  ReactNode
  permKey?: string
}

// Slot d'actions de la barre d'onglets : un onglet enfant y téléporte ses boutons via portail.
const TabActionsContext = createContext<HTMLElement | null>(null)
export function TabActions({ children }: { children: ReactNode }) {
  const slot = useContext(TabActionsContext)
  return slot ? createPortal(children, slot) : null
}

export function TabbedSection({ tabs }: { tabs: SubTab[] }) {
  const [params, setParams] = useSearchParams()
  const { ready, isPresident, can } = usePermissions()
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)

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
    <TabActionsContext.Provider value={actionsSlot}>
      <div className="flex flex-col gap-5">
        {/* Barre de sous-onglets + slot d'actions à droite (aligné sur la barre fine) */}
        <div className="flex items-end justify-between gap-3 border-b border-[var(--border)]">
          <div className="flex gap-1 overflow-x-auto">
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
          <div ref={setActionsSlot} className="flex items-center gap-2 shrink-0 pb-1.5" />
        </div>

        {/* Contenu de l'onglet actif */}
        {active && <div key={active.key}>{active.element}</div>}
      </div>
    </TabActionsContext.Provider>
  )
}
