import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Euro, Package, FileCheck2, CheckCircle2, Truck, Users, Building2, Tag, Fuel, Wrench, CalendarClock, CreditCard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { LineChart } from '../../shared/ui/LineChart'
import { TabActions } from '../../shared/ui/TabbedSection'
import { DrawerLivraison } from '../livraisons/DrawerLivraison'
import { getDashboardKpis, getRecentDeliveries, getMonthlyTrend, getActionItems } from './dashboard.queries'
import type { TrendPeriod, ActionItems } from './dashboard.queries'
import { formatCents, STATUS_LABELS, STATUS_COLORS } from '../livraisons/livraisons.logic'
import { effectiveHtCts } from '../../shared/lib/money'
import type { DashboardKpis } from './dashboard.queries'
import type { DeliveryRow } from '../livraisons/livraisons.types'

export function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [recent, setRecent] = useState<DeliveryRow[]>([])
  const [trend, setTrend] = useState<{ month: string; caHtCts: number; chargesHtCts: number; margeHtCts: number; nb: number; nbFacturee: number; nbPayee: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [period, setPeriod] = useState<TrendPeriod>('6m')
  const [metric, setMetric] = useState<'ca' | 'livraisons' | 'marge'>('ca')
  const [actions, setActions] = useState<ActionItems | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [k, r, t, a] = await Promise.all([
      getDashboardKpis(),
      getRecentDeliveries(),
      getMonthlyTrend('6m'),
      getActionItems(),
    ])
    setKpis(k)
    setRecent(r.data ?? [])
    setTrend(t)
    setActions(a)
    setLoading(false)
  }, [])

  const handlePeriodChange = async (p: TrendPeriod) => {
    setPeriod(p)
    const t = await getMonthlyTrend(p)
    setTrend(t)
  }

  useEffect(() => { load() }, [load])

  const openRow = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  const last = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  const deltaCA = (last && prev && prev.caHtCts > 0)
    ? { value: ((last.caHtCts - prev.caHtCts) / prev.caHtCts * 100).toFixed(1).replace('.', ',') + '%', dir: (last.caHtCts >= prev.caHtCts ? 'up' : 'down') as 'up' | 'down' }
    : undefined
  const deltaLiv = (last && prev)
    ? { value: String(Math.abs(last.nb - prev.nb)), dir: (last.nb >= prev.nb ? 'up' : 'down') as 'up' | 'down' }
    : undefined
  const deltaFacturee = (last && prev)
    ? { value: String(Math.abs(last.nbFacturee - prev.nbFacturee)), dir: (last.nbFacturee >= prev.nbFacturee ? 'up' : 'down') as 'up' | 'down' }
    : undefined
  const deltaPayee = (last && prev)
    ? { value: String(Math.abs(last.nbPayee - prev.nbPayee)), dir: (last.nbPayee >= prev.nbPayee ? 'up' : 'down') as 'up' | 'down' }
    : undefined

  return (
    <Shell pageTitle="Dashboard">
      <div className="space-y-6 min-w-0">

        {/* ── En-tête ── */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-1">
          <div className="min-w-0">
            <h2 className="font-display text-[28px] font-bold tracking-tight leading-none">Vue d'ensemble</h2>
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)] mt-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" style={{ boxShadow: '0 0 8px var(--success)' }} />
              Activité du mois · mise à jour à l'instant
            </p>
          </div>
          <TabActions>
            <Button variant="primary" size="compact" onClick={() => { setSelected(null); setDrawerOpen(true) }}>
              + Nouvelle livraison
            </Button>
          </TabActions>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 [&>*]:min-w-0">
          {loading ? (
            [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[88px]" />)
          ) : (
            <>
              <KpiCard label="CA HT du mois" value={formatCents(kpis!.caHtCts)} tone="success"
                icon={<Euro size={18} />} delta={deltaCA} spark={trend.map(t => t.caHtCts)} />
              <KpiCard label="Livraisons" value={kpis!.nbLivraisons} tone="info"
                icon={<Package size={18} />} delta={deltaLiv} spark={trend.map(t => t.nb)} />
              <KpiCard label="Facturées" value={kpis!.nbFacturee} tone="violet"
                icon={<FileCheck2 size={18} />}
                sub={`/ ${kpis!.nbLivraisons}`}
                delta={deltaFacturee}
                progress={kpis!.nbLivraisons ? Math.round((kpis!.nbFacturee / kpis!.nbLivraisons) * 100) : 0}
                spark={trend.map(t => t.nbFacturee)} />
              <KpiCard label="Payées" value={kpis!.nbPayee} tone="warning"
                icon={<CheckCircle2 size={18} />}
                sub={`/ ${kpis!.nbLivraisons}`}
                delta={deltaPayee}
                progress={kpis!.nbLivraisons ? Math.round((kpis!.nbPayee / kpis!.nbLivraisons) * 100) : 0}
                spark={trend.map(t => t.nbPayee)} />
            </>
          )}
        </div>

        {/* ── Graphe + Référentiels ── */}
        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 [&>*]:min-w-0">

          {/* Courbe CA */}
          <div className="glass rounded-[var(--r-xl)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-baseline gap-3">
                <span className="font-display font-semibold text-[var(--fs-h3)] text-[var(--text)]">
                  {metric === 'ca' ? "Chiffre d'affaires HT" : metric === 'marge' ? 'Marge HT (CA − charges)' : 'Livraisons'}
                </span>
              </div>
              {/* Contrôles période + métrique */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden text-[var(--fs-xs)]">
                  {(['6m', '12m', 'ytd'] as TrendPeriod[]).map(p => (
                    <button key={p} type="button" onClick={() => handlePeriodChange(p)}
                      className={`px-3 py-1.5 transition-colors ${period === p
                        ? 'bg-[var(--brand)] text-white font-semibold'
                        : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
                      {p === '6m' ? '6 mois' : p === '12m' ? '12 mois' : 'Année'}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden text-[var(--fs-xs)]">
                  {(['ca', 'livraisons', 'marge'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setMetric(m)}
                      className={`px-3 py-1.5 transition-colors ${metric === m
                        ? 'bg-[var(--brand)] text-white font-semibold'
                        : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
                      {m === 'ca' ? 'CA HT' : m === 'marge' ? 'Marge' : 'Livraisons'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {loading
              ? <Skeleton className="h-[220px]" />
              : <LineChart
                  key={`${period}-${metric}`}
                  points={trend.map(t => ({
                    label: t.month,
                    value: metric === 'ca' ? t.caHtCts : metric === 'marge' ? t.margeHtCts : t.nb,
                  }))}
                  formatValue={metric === 'livraisons' ? v => `${v} liv.` : formatCents}
                />
            }
          </div>

          {/* À traiter + Référentiels compacts */}
          <ActionPanel
            loading={loading}
            actions={actions}
            kpis={kpis}
            onNavigate={navigate}
          />
        </div>

        {/* ── Dernières livraisons ── */}
        <div className="glass rounded-[var(--r-xl)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              Dernières livraisons
            </span>
            <Button variant="ghost" size="compact" onClick={() => navigate('/livraisons')}>
              Voir tout <ChevronRight size={13} />
            </Button>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-muted)]">
              <p className="text-[var(--fs-sm)]">Aucune livraison enregistrée.</p>
              <Button variant="primary" onClick={() => navigate('/livraisons')}>
                Créer une livraison
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                <table className="w-full text-[var(--fs-sm)]">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] text-left">
                      {['Date', 'Client', 'Chauffeur', 'Montant HT', 'Statut'].map(h => (
                        <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((row, i) => (
                      <tr
                        key={row.id}
                        onClick={() => openRow(row)}
                        className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                          ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                      >
                        <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                          {new Date(row.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)]">
                          {row.clients?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {row.team_members?.full_name
                            ? <span className="inline-flex items-center gap-2">
                                <DriverAvatar name={row.team_members.full_name} />
                                {row.team_members.full_name}
                              </span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--text)]">
                          {formatCents(effectiveHtCts(row))}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Mobile */}
              <div className="md:hidden flex flex-col gap-2 p-3">
                {recent.map(row => (
                  <button
                    key={row.id}
                    onClick={() => openRow(row)}
                    className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</span>
                      <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                        {row.team_members?.full_name && ` · ${row.team_members.full_name}`}
                      </span>
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {formatCents(effectiveHtCts(row))}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      <DrawerLivraison
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        delivery={selected}
        onSaved={load}
      />
    </Shell>
  )
}

// ── Panneau "À traiter" + référentiels compacts ────────────────────────────

interface ActionPanelProps {
  loading: boolean
  actions: ActionItems | null
  kpis: import('./dashboard.queries').DashboardKpis | null
  onNavigate: (path: string) => void
}

function ActionPanel({ loading, actions, kpis, onNavigate }: ActionPanelProps) {
  const items = actions ? [
    {
      count: actions.facturesImpayees,
      label: actions.facturesImpayees === 1 ? '1 facture impayée' : `${actions.facturesImpayees} factures impayées`,
      sub: actions.montantImpayeCts > 0 ? `· ${(actions.montantImpayeCts / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : undefined,
      path: '/finance?tab=relances',
      icon: <Euro size={14} />,
      iconBg: 'bg-[var(--brand-soft)]',
      iconColor: 'var(--brand)',
      badgeBg: 'var(--brand-soft)',
      badgeColor: 'var(--brand)',
    },
    {
      count: actions.chargesNonCategorisees,
      label: actions.chargesNonCategorisees === 1 ? '1 charge non catégorisée' : `${actions.chargesNonCategorisees} charges non catégorisées`,
      path: '/finance?tab=charges',
      icon: <Tag size={14} />,
      iconBg: 'bg-[var(--warn-soft)]',
      iconColor: 'var(--warn)',
      badgeBg: 'var(--warn-soft)',
      badgeColor: 'var(--warn)',
    },
    {
      count: actions.carburantARapprocher,
      label: actions.carburantARapprocher === 1 ? '1 charge carburant à rapprocher' : `${actions.carburantARapprocher} charges carburant à rapprocher`,
      path: '/flotte?tab=carburant',
      icon: <Fuel size={14} />,
      iconBg: 'bg-[var(--warn-soft)]',
      iconColor: 'var(--warn)',
      badgeBg: 'var(--warn-soft)',
      badgeColor: 'var(--warn)',
    },
    {
      count: actions.entretienARapprocher,
      label: actions.entretienARapprocher === 1 ? '1 charge entretien à rapprocher' : `${actions.entretienARapprocher} charges entretien à rapprocher`,
      path: '/flotte?tab=entretiens',
      icon: <Wrench size={14} />,
      iconBg: 'bg-[var(--warn-soft)]',
      iconColor: 'var(--warn)',
      badgeBg: 'var(--warn-soft)',
      badgeColor: 'var(--warn)',
    },
    {
      count: actions.entretienAVenir,
      label: actions.entretienAVenir === 1 ? '1 entretien à venir' : `${actions.entretienAVenir} entretiens à venir`,
      path: '/flotte?tab=entretiens',
      icon: <CalendarClock size={14} />,
      iconBg: 'bg-[color-mix(in_srgb,var(--info)_14%,transparent)]',
      iconColor: 'var(--info)',
      badgeBg: 'color-mix(in srgb, var(--info) 14%, transparent)',
      badgeColor: 'var(--info)',
    },
    {
      count: actions.qontoDebitsATraiter,
      label: actions.qontoDebitsATraiter === 1 ? '1 débit bancaire à rapprocher' : `${actions.qontoDebitsATraiter} débits bancaires à rapprocher`,
      sub: actions.montantQontoATraiterCts > 0 ? `· ${(actions.montantQontoATraiterCts / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : undefined,
      path: '/tresorerie',
      icon: <CreditCard size={14} />,
      iconBg: 'bg-[var(--warn-soft)]',
      iconColor: 'var(--warn)',
      badgeBg: 'var(--warn-soft)',
      badgeColor: 'var(--warn)',
    },
  ].filter(a => a.count > 0) : []

  return (
    <div className="glass rounded-[var(--r-xl)] p-4 flex flex-col min-h-0">
      <div className="px-1 py-1 mb-2">
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          À traiter
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-8 gap-2">
          <CheckCircle2 size={22} className="text-[var(--success)]" />
          <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Tout est à jour</span>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map(item => (
            <button
              key={`${item.path}-${item.label}`}
              type="button"
              onClick={() => onNavigate(item.path)}
              className="flex items-center gap-3 px-2 py-2.5 rounded-[var(--r-md)] hover:bg-[var(--bg-card-hover)] transition-colors w-full text-left"
            >
              <span className={`w-7 h-7 rounded-[var(--r-sm)] grid place-items-center shrink-0 ${item.iconBg}`}
                style={{ color: item.iconColor }}>
                {item.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-[var(--fs-sm)] text-[var(--text)] leading-snug block truncate">
                  {item.label}
                </span>
                {item.sub && (
                  <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{item.sub}</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[var(--fs-xs)] font-semibold min-w-[20px] text-center px-1.5 py-0.5 rounded-full"
                style={{ background: item.badgeBg, color: item.badgeColor }}>
                {item.count}
              </span>
              <ChevronRight size={13} className="text-[var(--text-disabled)] shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Référentiels compacts */}
      {!loading && kpis && (
        <div className="mt-auto pt-3 border-t border-[var(--border)] flex items-center gap-2 flex-wrap">
          {[
            { icon: <Truck size={12} />, value: kpis.vehiculesActifs, label: 'véh.', path: '/flotte' },
            { icon: <Users size={12} />, value: kpis.chauffeurs, label: 'chauf.', path: '/equipe-hub' },
            { icon: <Building2 size={12} />, value: kpis.clientsActifs, label: 'clients', path: '/tiers' },
          ].map(chip => (
            <button
              key={chip.path}
              type="button"
              onClick={() => onNavigate(chip.path)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--brand)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <span className="text-[var(--text-disabled)]">{chip.icon}</span>
              <span className="font-mono font-semibold text-[var(--fs-xs)] text-[var(--text)]">{chip.value}</span>
              <span className="text-[var(--fs-xs)]">{chip.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
