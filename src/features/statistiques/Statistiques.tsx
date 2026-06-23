import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Euro, TrendingDown, Fuel, Wrench } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { formatCents } from '../../shared/lib/money'
import { getStatistiquesData } from './statistiques.queries'
import { caMensuel, annualTotals, topClients, chargesByCategory, type StatistiquesData } from './statistiques.logic'

const TOP_N = 6

const FR_MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

type StatData = StatistiquesData

export function Statistiques() {
  const [data, setData] = useState<StatData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await getStatistiquesData()
    // Supabase infère `clients` comme un tableau (quirk du typage de jointure) ;
    // au runtime c'est un objet to-one. Cast via unknown, comme l'ancien Record<string, unknown>.
    setData(d as unknown as StatData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const monthlyCa = caMensuel(data?.deliveries ?? [])
  const maxCa = Math.max(...monthlyCa.map(m => m.cts), 1)

  const { caTotal, chargesTotal, carburantTotal, entretienTotal } = annualTotals({
    deliveries: data?.deliveries ?? [],
    charges: data?.charges ?? [],
  })

  // Marge = CA − charges totales (carburant/entretien sont déjà inclus dans chargesTotal)
  const margeBrute = caTotal - chargesTotal
  const tauxMarge = caTotal > 0
    ? (margeBrute / caTotal * 100).toFixed(1) + ' %'
    : '—'

  const allClients = topClients(data?.deliveries ?? [])
  const visibleClients = allClients.slice(0, TOP_N)
  const restClients = allClients.slice(TOP_N)
  const restClientsCts = restClients.reduce((s, c) => s + c.cts, 0)
  const maxClient = allClients[0]?.cts ?? 1

  const sortedCategories = chargesByCategory(data?.charges ?? [])
  const visibleCategories = sortedCategories.slice(0, TOP_N)
  const restCategories = sortedCategories.slice(TOP_N)
  const restCategoriesCts = restCategories.reduce((s, [, cts]) => s + cts, 0)
  const maxCategory = sortedCategories[0]?.[1] ?? 1

  const currentMonth = new Date().getMonth()
  const year = data?.year ?? new Date().getFullYear()

  return (
    <Shell pageTitle="Statistiques">
      <div className="space-y-6">

        {/* ── KPIs annuels ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Année {year}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loading ? [0,1,2,3].map(i => <Skeleton key={i} className="h-[72px]" />) : <>
              <KpiCard label="CA HT"      value={formatCents(caTotal)}       tone="success" icon={<Euro size={18} />} />
              <KpiCard label="Charges HT" value={formatCents(chargesTotal)}   tone="warning" icon={<TrendingDown size={18} />} />
              <KpiCard label="Carburant"  value={formatCents(carburantTotal)} tone="warning" icon={<Fuel size={18} />}    sub="dont charges HT" />
              <KpiCard label="Entretiens" value={formatCents(entretienTotal)} tone="warning" icon={<Wrench size={18} />}  sub="dont charges HT" />
            </>}
          </div>
        </section>

        {/* ── Bande Résultat ────────────────────────────────────────────── */}
        {!loading && (
          <div className="glass rounded-[var(--r-xl)] px-5 py-4">
            <div className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
              Résultat {year}
            </div>
            <div className="flex items-baseline gap-4 flex-wrap">
              <span
                className="text-2xl font-bold font-mono"
                style={{ color: margeBrute < 0 ? 'var(--danger)' : 'var(--text)' }}
              >
                {formatCents(margeBrute)}
              </span>
              <span
                className="text-[var(--fs-sm)] font-mono"
                style={{ color: margeBrute < 0 ? 'var(--danger)' : 'var(--text-muted)' }}
              >
                {tauxMarge}
              </span>
            </div>
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mt-2">
              Inclut les achats d'immobilisations (ex. véhicule)&nbsp;; l'amortissement est traité dans Pennylane.
            </p>
          </div>
        )}

        {/* ── Graphe CA mensuel ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            CA HT mensuel
          </h2>
          <div className="glass rounded-[var(--r-xl)] p-5">
            {loading ? <Skeleton className="h-40" /> : (
              <div className="flex items-end gap-1.5 h-40">
                {monthlyCa.map(({ month, cts }) => {
                  const height = maxCa > 0 ? Math.max((cts / maxCa) * 100, cts > 0 ? 4 : 0) : 0
                  const isCurrent = month === currentMonth
                  // Libellé compact k€ au-dessus des barres non nulles
                  const kLabel = (cts / 100000).toFixed(1).replace(/\.0$/, '') + 'k'
                  return (
                    <div key={month} className="flex flex-col items-center gap-1 flex-1">
                      {cts > 0 && (
                        <span className={`text-[9px] font-mono leading-none ${isCurrent ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-disabled)]'}`}>
                          {kLabel}
                        </span>
                      )}
                      <div className="w-full flex items-end flex-1">
                        <div
                          className={`w-full rounded-t-[3px] transition-all ${
                            isCurrent ? 'bg-[var(--brand)]' : 'bg-[var(--brand)]/25'
                          }`}
                          style={{ height: height > 0 ? `${height}%` : '2px' }}
                          title={`${FR_MONTHS_SHORT[month]} : ${formatCents(cts)}`}
                        />
                      </div>
                      <span className={`text-[9px] font-mono leading-none ${isCurrent ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                        {FR_MONTHS_SHORT[month]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Grille 2 colonnes : top clients / charges par catégorie ──── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Top clients */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Top clients (CA HT)
              </h2>
              <Link
                to="/clients"
                className="text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
              >
                Voir tout →
              </Link>
            </div>
            <div className="glass rounded-[var(--r-xl)] divide-y divide-[var(--border)] overflow-hidden">
              {loading ? (
                <div className="p-4"><Skeleton className="h-32" /></div>
              ) : allClients.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune donnée
                </p>
              ) : <>
                {visibleClients.map((c, i) => {
                  const pct = caTotal > 0 ? (c.cts / caTotal * 100).toFixed(1) : '0.0'
                  return (
                    <div key={i} className="px-4 py-3 flex items-center gap-3 min-h-[52px]">
                      <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{c.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[var(--fs-xs)] font-mono text-[var(--text-muted)]">{pct} %</span>
                            <span className="text-[var(--fs-xs)] font-mono text-[var(--text)]">{formatCents(c.cts)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--brand)] transition-all"
                            style={{ width: `${(c.cts / maxClient) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {restClients.length > 0 && (
                  <div className="px-4 py-3 flex items-center justify-between min-h-[44px]">
                    <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                      + {restClients.length} autre{restClients.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-[var(--fs-xs)] font-mono text-[var(--text-muted)]">
                      · {formatCents(restClientsCts)}
                    </span>
                  </div>
                )}
              </>}
            </div>
          </section>

          {/* Charges par catégorie */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Charges par catégorie
              </h2>
              <Link
                to="/charges"
                className="text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
              >
                Voir tout →
              </Link>
            </div>
            <div className="glass rounded-[var(--r-xl)] divide-y divide-[var(--border)] overflow-hidden">
              {loading ? (
                <div className="p-4"><Skeleton className="h-32" /></div>
              ) : sortedCategories.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune donnée
                </p>
              ) : <>
                {visibleCategories.map(([cat, cts]) => (
                  <div key={cat} className="px-4 py-3 flex items-center gap-3 min-h-[52px]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">{cat}</span>
                        <span className="text-[var(--fs-xs)] font-mono text-[var(--text)] shrink-0">{formatCents(cts)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--warning)]/70 transition-all"
                          style={{ width: `${(cts / maxCategory) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {restCategories.length > 0 && (
                  <div className="px-4 py-3 flex items-center justify-between min-h-[44px]">
                    <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                      + {restCategories.length} autre{restCategories.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-[var(--fs-xs)] font-mono text-[var(--text-muted)]">
                      · {formatCents(restCategoriesCts)}
                    </span>
                  </div>
                )}
              </>}
            </div>
          </section>

        </div>
      </div>
    </Shell>
  )
}
