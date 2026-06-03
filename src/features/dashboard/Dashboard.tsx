import { useState, useEffect, useCallback } from 'react'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { DrawerLivraison } from '../../shared/drawers/DrawerLivraison'
import { getDashboardKpis, getRecentDeliveries, getMonthlyTrend } from './dashboard.queries'
import { formatCents, STATUS_LABELS, STATUS_COLOR } from '../livraisons/livraisons.logic'
import type { DashboardKpis } from './dashboard.queries'
import type { DeliveryRow } from '../livraisons/livraisons.types'

export function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [recent, setRecent] = useState<DeliveryRow[]>([])
  const [trend, setTrend] = useState<{ month: string; caHtCts: number; nb: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [k, r, t] = await Promise.all([
      getDashboardKpis(),
      getRecentDeliveries(),
      getMonthlyTrend(),
    ])
    setKpis(k)
    setRecent(r.data ?? [])
    setTrend(t)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const openRow = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  const maxCa = trend.length ? Math.max(...trend.map(t => t.caHtCts), 1) : 1

  return (
    <Shell pageTitle="Dashboard">
      <div className="space-y-8">

        {/* ── KPIs du mois ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest capitalize">
              {monthLabel}
            </h2>
            <Button variant="ghost" size="compact" onClick={() => navigate('/livraisons')}>
              Voir toutes <ArrowRight size={13} />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loading ? (
              [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[72px]" />)
            ) : (
              <>
                <KpiCard label="CA HT du mois" value={formatCents(kpis!.caHtCts)} accent />
                <KpiCard label="Livraisons" value={kpis!.nbLivraisons} />
                <KpiCard label="% Facturé" value={`${kpis!.factureePct} %`} />
                <KpiCard label="% Payé" value={`${kpis!.payeePct} %`} accent={kpis!.payeePct >= 80} />
              </>
            )}
          </div>
        </section>

        {/* ── Référentiels + Tendance ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Référentiels */}
          <div className="space-y-3">
            <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              Référentiels
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {loading ? (
                [0, 1, 2].map(i => <Skeleton key={i} className="h-[72px]" />)
              ) : (
                <>
                  <KpiCard label="Véhicules" value={kpis!.vehiculesActifs} sub="actifs" />
                  <KpiCard label="Chauffeurs" value={kpis!.chauffeurs} sub="actifs" />
                  <KpiCard label="Clients" value={kpis!.clientsActifs} sub="actifs" />
                </>
              )}
            </div>
          </div>

          {/* Tendance 6 mois */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-[var(--text-muted)]" />
              <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                CA HT — 6 derniers mois
              </h2>
            </div>
            <div className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4">
              {loading ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="flex items-end gap-2 h-24">
                  {trend.map((t, i) => {
                    const height = maxCa > 0 ? Math.max((t.caHtCts / maxCa) * 100, 4) : 4
                    const isCurrent = i === trend.length - 1
                    return (
                      <div key={t.month} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] text-[var(--text-disabled)] font-mono">
                          {t.caHtCts > 0 ? `${Math.round(t.caHtCts / 100)}€` : ''}
                        </span>
                        <div
                          className={`w-full rounded-t-[3px] transition-all ${
                            isCurrent ? 'bg-[var(--brand)]' : 'bg-[var(--brand)]/30'
                          }`}
                          style={{ height: `${height}%` }}
                          title={`${t.month} : ${formatCents(t.caHtCts)} — ${t.nb} livraison${t.nb !== 1 ? 's' : ''}`}
                        />
                        <span className="text-[10px] text-[var(--text-muted)] capitalize">{t.month}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Dernières livraisons ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              Dernières livraisons
            </h2>
            <Button variant="ghost" size="compact" onClick={() => navigate('/livraisons')}>
              Voir tout <ArrowRight size={13} />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
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
              <div className="hidden md:block rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
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
                          {row.team_members?.full_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--text)]">
                          {formatCents(row.montant_ht_cts)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={STATUS_COLOR[row.statut]}>{STATUS_LABELS[row.statut]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden flex flex-col gap-2">
                {recent.map(row => (
                  <button
                    key={row.id}
                    onClick={() => openRow(row)}
                    className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</span>
                      <Badge color={STATUS_COLOR[row.statut]}>{STATUS_LABELS[row.statut]}</Badge>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                        {row.team_members?.full_name && ` · ${row.team_members.full_name}`}
                      </span>
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {formatCents(row.montant_ht_cts)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
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
