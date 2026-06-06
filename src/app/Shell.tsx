import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, BarChart2,
  Truck, CalendarDays, Calendar, AlertTriangle, ClipboardCheck,
  Car, Fuel, Wrench,
  Users, Building2,
  CreditCard, Banknote, Receipt, Wallet,
  UserCheck, Clock,
  Bell, Bot, ScanText, Settings,
  Menu, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { features } from '../features.config'
import { ActionBar } from '../shared/actions/ActionBar'
import type { ActionKey } from '../shared/actions/ActionBar'

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
      { key: 'planning',    label: 'Planning',    icon: CalendarDays,    path: '/planning',     featureKey: 'planning'    },
      { key: 'calendrier',  label: 'Calendrier',  icon: Calendar,        path: '/calendrier',   featureKey: 'calendrier'  },
      { key: 'incidents',   label: 'Incidents',   icon: AlertTriangle,   path: '/incidents',    featureKey: 'incidents'   },
      { key: 'inspections', label: 'Inspections', icon: ClipboardCheck,  path: '/inspections',  featureKey: 'inspections' },
    ],
  },
  {
    title: 'Flotte',
    items: [
      { key: 'vehicules',   label: 'Véhicules',   icon: Car,    path: '/vehicules',   featureKey: 'vehicules'   },
      { key: 'carburant',   label: 'Carburant',   icon: Fuel,   path: '/carburant',   featureKey: 'carburant'   },
      { key: 'entretiens',  label: 'Entretiens',  icon: Wrench, path: '/entretiens',  featureKey: 'entretiens'  },
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
      { key: 'charges',     label: 'Charges',     icon: CreditCard, path: '/charges',     featureKey: 'charges'     },
      { key: 'encaissement',label: 'Encaissement',icon: Banknote,   path: '/encaissement',featureKey: 'encaissement'},
      { key: 'tresorerie',  label: 'Trésorerie',  icon: Wallet,     path: '/tresorerie',  featureKey: 'tresorerie'  },
      { key: 'tva',         label: 'TVA',         icon: Receipt,    path: '/tva',         featureKey: 'tva'         },
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
      { key: 'brouillons', label: 'Brouillons IA',icon: Bot,      path: '/brouillons', featureKey: 'brouillons' },
      { key: 'copilote',   label: 'Copilote IA',  icon: ScanText, path: '/copilote',   featureKey: 'copilote'   },
      { key: 'parametres', label: 'Paramètres',   icon: Settings, path: '/parametres', featureKey: 'parametres' },
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

export function Shell({ children, pageTitle, actions = [], onAction }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

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

        {/* Contenu de l'onglet */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
