import { useState, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, CalendarDays, Truck,
  Users, Wallet, UserCheck, Settings,
  Menu, X, LogOut,
} from 'lucide-react'
import { features } from '../features.config'
import { ActionBar } from '../shared/actions/ActionBar'
import type { ActionKey } from '../shared/actions/ActionBar'
import { AssistantWidget } from '../features/assistant/AssistantWidget'
import { AlertesBell } from '../features/alertes/AlertesBell'
import { TabActions } from '../shared/ui/TabbedSection'
import { SyncIndicator } from '../shared/ui/SyncIndicator'
import { supabase, useProfile } from './providers'
import { usePermissions } from '../shared/permissions/usePermissions'

interface NavItem {
  key:        string
  label:      string
  icon:       React.ElementType
  path:       string
  featureKey: keyof typeof features
  section?:   string  // nom de section catalogue (ex: 'Livraisons')
}

// Sidebar plate, ultra-épurée : 8 entrées, chacune = une page à sous-onglets.
const NAV: NavItem[] = [
  { key: 'pilotage',   label: 'Pilotage',   icon: LayoutDashboard, path: '/pilotage',     featureKey: 'pilotage',    section: 'Pilotage'   },
  { key: 'livraisons', label: 'Livraisons', icon: Package,         path: '/livraisons',   featureKey: 'livraisons',  section: 'Livraisons' },
  { key: 'planning',   label: 'Planning',   icon: CalendarDays,    path: '/planning-hub', featureKey: 'planningHub', section: 'Planning'   },
  { key: 'flotte',     label: 'Flotte',     icon: Truck,           path: '/flotte',       featureKey: 'flotte',      section: 'Flotte'     },
  { key: 'tiers',      label: 'Tiers',      icon: Users,           path: '/tiers',        featureKey: 'tiers',       section: 'Tiers'      },
  { key: 'finance',    label: 'Finance',    icon: Wallet,          path: '/finance',      featureKey: 'finance',     section: 'Finance'    },
  { key: 'equipe',     label: 'Équipe',     icon: UserCheck,       path: '/equipe-hub',   featureKey: 'equipeHub',   section: 'Équipe'     },
  { key: 'systeme',    label: 'Système',    icon: Settings,        path: '/systeme',      featureKey: 'systeme',     section: 'Système'    },
]

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const { pathname } = useLocation()
  const { ready, isPresident, canViewSection } = usePermissions()

  // Pilotage est aussi actif sur la racine "/" (l'app s'ouvre sur le Dashboard).
  const isItemActive = (item: NavItem) =>
    pathname === item.path || (item.path === '/pilotage' && pathname === '/')

  // Masquage sidebar : seulement quand ready && !isPresident.
  // Pendant !ready → nav complète (anti-écran-noir).
  const visibleNav = NAV.filter(item =>
    features[item.featureKey] &&
    (!(ready && !isPresident) || !item.section || canViewSection(item.section))
  )

  return (
    <nav className="flex-1 overflow-y-auto py-2 px-2">
      <ul>
        {visibleNav.map((item) => (
          <li key={item.key}>
            <NavLink
              to={item.path}
              className={() =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--r-md)] text-[var(--fs-sm)] transition-colors ${
                  isItemActive(item)
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
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [q, setQ] = useState('')
  const { profile } = useProfile()

  const handleLogout = async () => {
    setLogoutLoading(true)
    await supabase.auth.signOut()
    // onAuthStateChange → user=null → AppCore affiche LoginPage automatiquement
  }

  // Sous-vue d'une page à sous-onglets : pas de chrome, on garde juste les actions.
  if (nested) {
    return (
      <div className="flex flex-col gap-4">
        {actions.length > 0 && (
          <TabActions>
            <ActionBar actions={actions} onAction={onAction} />
          </TabActions>
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
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-grid place-items-center w-10 h-10 rounded-[var(--r-lg)] shrink-0 font-display font-bold text-white text-[16px]"
                    style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-deep))' }}>M</span>
              <div className="flex flex-col min-w-0">
                <span className="font-display font-bold text-[var(--fs-h3)] text-[var(--text)] leading-tight">MCA Logistics</span>
                <span className="text-[var(--fs-xs)] text-[var(--text-muted)] leading-tight">Pilotage interne</span>
              </div>
            </div>
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

        {/* Bas de sidebar : carte utilisateur */}
        <div className="shrink-0 border-t border-[var(--border)] p-3">
          {!collapsed && profile ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full grid place-items-center text-white font-display font-semibold text-[var(--fs-sm)] shrink-0"
                   style={{ background: 'var(--grad)' }}>
                {profile.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate leading-tight">{profile.full_name}</p>
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)] leading-tight">Président</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={logoutLoading}
                title="Se déconnecter"
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-sm)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              title="Se déconnecter"
              className="flex items-center justify-center w-full p-2 rounded-[var(--r-md)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </aside>

      {/* Zone principale */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Topbar */}
        <header className="flex items-center h-[var(--topbar-h)] px-4 gap-3 bg-[var(--bg-elevated)] border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3 shrink-0">
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
          <div className="flex-1 max-w-[420px] mx-4 hidden md:block">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && q.trim()) navigate('/livraisons?q=' + encodeURIComponent(q.trim())) }}
              placeholder="Rechercher une livraison, un client…"
              className="w-full h-9 rounded-[var(--r-pill)] bg-[var(--bg-card)] border border-[var(--border)] px-4 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <ActionBar actions={actions} onAction={onAction} />
            <SyncIndicator />
            <AlertesBell />
            {profile && (
              <div
                className="w-9 h-9 rounded-full grid place-items-center text-white font-display font-semibold text-[var(--fs-sm)] shrink-0"
                style={{ background: 'var(--grad)' }}
                title={profile.full_name}
              >
                {profile.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
            )}
          </div>
        </header>

        {/* Contenu de l'onglet — tout Shell rendu ici devient « imbriqué » (sous-onglet). */}
        <main
          className="flex-1 overflow-auto p-5 md:p-8 lg:p-10"
          style={{ backgroundImage:
            'radial-gradient(900px 400px at 15% -5%, var(--glow-1), transparent 70%), radial-gradient(700px 360px at 95% 0%, var(--glow-2), transparent 70%)' }}
        >
          <div key={location.pathname} className="page-enter">
            <ShellNestContext.Provider value={true}>
              {children}
            </ShellNestContext.Provider>
          </div>
        </main>
      </div>

      {/* Assistant global — présent sur toutes les pages, hors du <main> */}
      <AssistantWidget />
    </div>
  )
}
