import { useState, useEffect, useCallback } from 'react'
import { Euro, TrendingDown, Fuel, Wrench, Wallet } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getStatistiquesData } from './statistiques.queries'
import { caMensuel, annualTotals, topClients, chargesByCategory, type StatistiquesData } from './statistiques.logic'
import { CATEGORY_LABELS } from '../charges/charges.logic'
import type { ChargeCategory } from '../charges/charges.types'

function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

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

  // Agrégations (logique pure dans statistiques.logic.ts)
  const monthlyCa = caMensuel(data?.deliveries ?? [])
  const maxCa = Math.max(...monthlyCa.map(m => m.cts), 1)

  const { caTotal, chargesTotal, fuelTotal, maintenanceTotal } = annualTotals({
    deliveries: data?.deliveries ?? [],
    charges: data?.charges ?? [],
    fuel: data?.fuel ?? [],
    maintenances: data?.maintenances ?? [],
  })

  const clients = topClients(data?.deliveries ?? [], 5)
  const maxClient = clients[0]?.cts ?? 1

  const sortedCategories = chargesByCategory(data?.charges ?? [])
  const maxCategory = sortedCategories[0]?.[1] ?? 1

  const currentMonth = new Date().getMonth()

  return (
    <Shell pageTitle="Statistiques">
      <div className="space-y-8">

        {/* KPIs annuels */}
        <section>
          <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Année {data?.year ?? new Date().getFullYear()}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loading ? [0,1,2,3].map(i => <Skeleton key={i} className="h-[72px]" />) : <>
              <KpiCard label="CA HT"      value={formatCents(caTotal)} tone="success" icon={<Euro size={18} />} />
              <KpiCard label="Charges HT" value={formatCents(chargesTotal)} tone="warning" icon={<TrendingDown size={18} />} />
              <KpiCard label="Carburant"  value={formatCents(fuelTotal)} tone="warning" icon={<Fuel size={18} />} />
              <KpiCard label="Entretiens" value={formatCents(maintenanceTotal)} tone="warning" icon={<Wrench size={18} />} />
            </>}
          </div>
        </section>

        {/* CA mensuel */}
        <section>
          <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            CA HT mensuel
          </h2>
          <div className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-5">
            {loading ? <Skeleton className="h-40" /> : (
              <div className="flex items-end gap-1.5 h-40">
                {monthlyCa.map(({ month, cts }) => {
                  const height = maxCa > 0 ? Math.max((cts / maxCa) * 100, cts > 0 ? 4 : 0) : 0
                  const isCurrent = month === currentMonth
                  return (
                    <div key={month} className="flex flex-col items-center gap-1.5 flex-1">
                      {cts > 0 && (
                        <span className="text-[9px] text-[var(--text-disabled)] font-mono leading-none">
                          {Math.round(cts / 100)}
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
                      <span className={`text-[9px] leading-none ${isCurrent ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                        {FR_MONTHS_SHORT[month]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top clients */}
          <section>
            <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Top clients (CA HT)
            </h2>
            <div className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              {loading ? (
                <div className="p-4"><Skeleton className="h-32" /></div>
              ) : clients.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune donnée
                </p>
              ) : clients.map((c, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{c.name}</span>
                      <span className="text-[var(--fs-xs)] font-mono text-[var(--text)] shrink-0">{formatCents(c.cts)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--brand)]"
                        style={{ width: `${(c.cts / maxClient) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Charges par catégorie */}
          <section>
            <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Charges par catégorie
            </h2>
            <div className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              {loading ? (
                <div className="p-4"><Skeleton className="h-32" /></div>
              ) : sortedCategories.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune donnée
                </p>
              ) : sortedCategories.map(([cat, cts]) => (
                <div key={cat} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">
                        {CATEGORY_LABELS[cat as ChargeCategory] ?? cat}
                      </span>
                      <span className="text-[var(--fs-xs)] font-mono text-[var(--text)] shrink-0">{formatCents(cts)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--warning)]/70"
                        style={{ width: `${(cts / maxCategory) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Marge brute estimée */}
        {!loading && caTotal > 0 && (
          <section>
            <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Résultat estimé
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="CA HT"           value={formatCents(caTotal)} tone="success" icon={<Euro size={18} />} />
              <KpiCard label="Total charges HT" value={formatCents(chargesTotal + fuelTotal + maintenanceTotal)} tone="warning" icon={<TrendingDown size={18} />} />
              <KpiCard
                label="Marge brute"
                value={formatCents(caTotal - chargesTotal - fuelTotal - maintenanceTotal)}
                tone={caTotal - chargesTotal - fuelTotal - maintenanceTotal >= 0 ? 'success' : 'danger'}
                icon={<Wallet size={18} />}
              />
            </div>
          </section>
        )}
      </div>
    </Shell>
  )
}
