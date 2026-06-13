import { useState, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, BarChart2,
  Truck, CalendarDays,
  Users, Building2,
  Wallet,
  UserCheck, Clock,
  Bell, Settings,
  Menu, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { features } from '../features.config'
import { ActionBar } from '../shared/actions/ActionBar'
import type { ActionKey } from '../shared/actions/ActionBar'
import { AssistantWidget } from '../features/assistant/AssistantWidget'

interface NavItem {
  key: string
  label: string
  icon: React.ElementType
  path: string
  featureKey: keyof typeof features
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { key: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard, path: '/',              featureKey: 'dashboard'   },
      { key: 'rentabilite', label: 'Rentabilité',  icon: TrendingUp,      path: '/rentabilite',   featureKey: 'rentabilite' },
      { key: 'statistiques',label: 'Statistiques', icon: BarChart2,       path: '/statistiques',  featureKey: 'statistiques'},
    ],
  },
  {
    title: 'Opérations',
    items: [
      { key: 'livraisons',  label: 'Livraisons',  icon: Truck,           path: '/livraisons',   featureKey: 'livraisons'  },
      // Page à sous-onglets : Tournées · Planning · Calendrier.
      { key: 'planning',    label: 'Planning',    icon: CalendarDays,    path: '/planning-hub', featureKey: 'planningHub' },
      // Incidents + Inspections déplacés dans Flotte ; Tournées + Calendrier regroupés ici.
    ],
  },
  {
    title: 'Flotte',
    items: [
      // Page à sous-onglets : Véhicules · Carburant · Entretiens · Inspections · Incidents.
      { key: 'flotte', label: 'Flotte', icon: Truck, path: '/flotte', featureKey: 'flotte' },
    ],
  },
  {
    title: 'Tiers',
    items: [
      { key: 'clients',     label: 'Clients',     icon: Users,    path: '/clients',     featureKey: 'clients'     },
      { key: 'fournisseurs',label: 'Fournisseurs',icon: Building2,path: '/fournisseurs',featureKey: 'fournisseurs'},
    ],
  },
  {
    title: 'Finance',
    items: [
      // Page à sous-onglets : Trésorerie · Charges · Encaissement · TVA.
      { key: 'finance', label: 'Finance', icon: Wallet, path: '/finance', featureKey: 'finance' },
    ],
  },
  {
    title: 'Équipe',
    items: [
      { key: 'equipe', label: 'Équipe', icon: UserCheck, path: '/equipe', featureKey: 'equipe' },
      { key: 'heures', label: 'Heures', icon: Clock,     path: '/heures', featureKey: 'heures' },
    ],
  },
  {
    title: 'Système',
    items: [
      { key: 'alertes',    label: 'Alertes',      icon: Bell,     path: '/alertes',    featureKey: 'alertes'    },
      { key: 'parametres', label: 'Paramètres',   icon: Settings, path: '/parametres', featureKey: 'parametres' },
      // Brouillons IA & Copilote IA retirés du menu : leurs capacités sont dans l'assistant.
    ],
  },
]

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.map((s) => [s.title, true]))
  )

  const toggle = (title: string) =>
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }))

  return (
    <nav className="flex-1 overflow-y-auto py-2">
      {NAV.map((section) => {
        const visibleItems = section.items.filter((item) => features[item.featureKey])
        if (visibleItems.length === 0) return null
        const isOpen = openSections[section.title]

        return (
          <div key={section.title} className="mb-1">
            {!collapsed && (
              <button
                onClick={() => toggle(section.title)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[var(--fs-xs)] font-semibold uppercase tracking-wider text-[var(--text-disabled)] hover:text-[var(--text-muted)] transition-colors"
              >
                {section.title}
                {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            )}
            {(!collapsed || true) && isOpen && (
              <ul>
                {visibleItems.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 mx-1 rounded-[var(--r-md)] text-[var(--fs-sm)] transition-colors ${
                          isActive
                            ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-medium'
                            : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]'
                        }`
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon size={15} className="shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

interface ShellProps {
  children: ReactNode
  pageTitle: string
  actions?: ActionKey[]
  onAction?: (key: ActionKey) => void
}

// Permet d'IMBRIQUER un Shell dans un autre (pages à sous-onglets) : un Shell
// rendu à l'intérieur d'un Shell parent n'affiche QUE son contenu (+ ses actions),
// pas une 2e sidebar/topbar. Les pages métier restent inchangées.
const ShellNestContext = createContext(false)

export function Shell({ children, pageTitle, actions = [], onAction }: ShellProps) {
  const nested = useContext(ShellNestContext)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Sous-vue d'une page à sous-onglets : pas de chrome, on garde juste les actions.
  if (nested) {
    return (
      <div className="flex flex-col gap-4">
        {actions.length > 0 && (
          <div className="flex justify-end">
            <ActionBar actions={actions} onAction={onAction} />
          </div>
        )}
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col bg-[var(--bg-elevated)] border-r border-[var(--border)]
          transition-all duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0
          ${collapsed ? 'w-[var(--sidebar-w-icon)]' : 'w-[var(--sidebar-w)]'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-[var(--topbar-h)] px-3 border-b border-[var(--border)] shrink-0">
          {!collapsed && (
            <span className="font-display font-bold text-[var(--fs-h3)] text-[var(--brand)] tracking-tight">
              MCA Logistics
            </span>
          )}
          <button
            onClick={() => { setCollapsed(!collapsed); setSidebarOpen(false) }}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-sm)] transition-colors hidden lg:flex"
            aria-label="Replier la navigation"
          >
            <Menu size={15} />
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] rounded-[var(--r-sm)] transition-colors lg:hidden"
            aria-label="Fermer le menu"
          >
            <X size={15} />
          </button>
        </div>

        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Zone principale */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Topbar */}
        <header className="flex items-center justify-between h-[var(--topbar-h)] px-4 bg-[var(--bg-elevated)] border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-sm)] transition-colors lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={16} />
            </button>
            <h1 className="font-display font-semibold text-[var(--fs-h2)] text-[var(--text)]">
              {pageTitle}
            </h1>
          </div>
          <ActionBar actions={actions} onAction={onAction} />
        </header>

        {/* Contenu de l'onglet — tout Shell rendu ici devient « imbriqué » (sous-onglet). */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <ShellNestContext.Provider value={true}>
            {children}
          </ShellNestContext.Provider>
        </main>
      </div>

      {/* Assistant global — présent sur toutes les pages, hors du <main> */}
      <AssistantWidget />
    </div>
  )
}
