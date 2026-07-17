import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Euro, Package, FileCheck2, CheckCircle2, Truck, Users, Building2, Link2 } from 'lucide-react'
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
import { getDashboardKpis, getRecentDeliveries, getMonthlyTrend } from './dashboard.queries'
import type { TrendPeriod } from './dashboard.queries'
import { formatCents, STATUS_LABELS, STATUS_COLORS } from '../livraisons/livraisons.logic'
import { effectiveHtCts } from '../../shared/lib/money'
import { getARapprocherCounts } from '../../shared/lib/aRapprocher.queries'
import type { ARapprocherCounts } from '../../shared/lib/aRapprocher'
import type { DashboardKpis } from './dashboard.queries'
import type { DeliveryRow } from '../livraisons/livraisons.types'

export function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [recent, setRecent] = useState<DeliveryRow[]>([])
  const [trend, setTrend] = useState<{ month: string; caHtCts: number; nb: number; nbFacturee: number; nbPayee: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [period, setPeriod] = useState<TrendPeriod>('6m')
  const [metric, setMetric] = useState<'ca' | 'livraisons'>('ca')
  const [aRapprocher, setARapprocher] = useState<ARapprocherCounts | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [k, r, t, ar] = await Promise.all([
      getDashboardKpis(),
      getRecentDeliveries(),
      getMonthlyTrend('6m'),
      getARapprocherCounts(),
    ])
    setKpis(k)
    setRecent(r.data ?? [])
    setTrend(t)
    setARapprocher(ar)
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
                  {metric === 'ca' ? "Chiffre d'affaires HT" : 'Livraisons'}
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
                  {(['ca', 'livraisons'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setMetric(m)}
                      className={`px-3 py-1.5 transition-colors ${metric === m
                        ? 'bg-[var(--brand)] text-white font-semibold'
                        : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
                      {m === 'ca' ? 'CA HT' : 'Livraisons'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {loading
              ? <Skeleton className="h-[220px]" />
              : <LineChart
                  key={`${period}-${metric}`}
                  points={trend.map(t => ({ label: t.month, value: metric === 'ca' ? t.caHtCts : t.nb }))}
                  formatValue={metric === 'ca' ? formatCents : v => `${v} liv.`}
                  formatAxisY={metric === 'ca'
                    ? (v: number) => {
                        if (v === 0) return '0'
                        const eur = Math.round(v / 100)
                        return eur >= 1000 ? `${Math.round(eur / 1000)} k€` : `${eur} €`
                      }
                    : (v: number) => String(Math.round(v))
                  }
                />
            }
          </div>

          {/* Référentiels */}
          <div className="glass rounded-[var(--r-xl)] p-3">
            <div className="px-3 py-2.5 mb-1">
              <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Référentiels
              </span>
            </div>
            {loading ? (
              <div className="flex flex-col gap-2 p-1">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : (
              <div className="flex flex-col">
                {[
                  { icon: <Truck size={18} />, value: kpis!.vehiculesActifs, label: 'Véhicules actifs', path: '/flotte' },
                  { icon: <Users size={18} />, value: kpis!.chauffeurs, label: 'Chauffeurs actifs', path: '/equipe-hub' },
                  { icon: <Building2 size={18} />, value: kpis!.clientsActifs, label: 'Clients actifs', path: '/tiers' },
                ].map(item => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center gap-3 p-3 rounded-[var(--r-md)] hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                  >
                    <span className="w-10 h-10 rounded-[var(--r-md)] grid place-items-center bg-[var(--brand-soft)] text-[var(--brand)] shrink-0">
                      {item.icon}
                    </span>
                    <span>
                      <b className="font-mono text-xl text-[var(--text)]">{item.value}</b>
                      <small className="block text-[var(--text-muted)] text-[var(--fs-xs)]">{item.label}</small>
                    </span>
                    <ChevronRight size={18} className="ml-auto text-[var(--text-disabled)]" />
                  </button>
                ))}
                {/* À rapprocher — visible seulement si N > 0 (état neutre sinon,
                 *   pour ne pas ajouter de bruit quand tout est propre). Route
                 *   par défaut vers Trésorerie où se fait le rapprochement. */}
                {aRapprocher && aRapprocher.total > 0 && (
                  <button
                    onClick={() => navigate('/tresorerie')}
                    className="w-full flex items-center gap-3 p-3 rounded-[var(--r-md)] hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                  >
                    <span className="w-10 h-10 rounded-[var(--r-md)] grid place-items-center bg-[var(--warning)]/15 text-[var(--warning)] shrink-0">
                      <Link2 size={18} />
                    </span>
                    <span className="min-w-0">
                      <b className="font-mono text-xl text-[var(--text)]">{aRapprocher.total}</b>
                      <small className="block text-[var(--text-muted)] text-[var(--fs-xs)]">
                        À traiter
                        {aRapprocher.tresorerie > 0 && ` · ${aRapprocher.tresorerie} mouvement${aRapprocher.tresorerie > 1 ? 's' : ''}`}
                        {aRapprocher.encaissements > 0 && ` · ${aRapprocher.encaissements} encaissement${aRapprocher.encaissements > 1 ? 's' : ''}`}
                        {aRapprocher.categorisation > 0 && ` · ${aRapprocher.categorisation} à catégoriser`}
                      </small>
                    </span>
                    <ChevronRight size={18} className="ml-auto text-[var(--text-disabled)]" />
                  </button>
                )}
              </div>
            )}
          </div>
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
