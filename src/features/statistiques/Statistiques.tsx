import { useState, useEffect, useCallback } from 'react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getStatistiquesData } from './statistiques.queries'
import { CATEGORY_LABELS } from '../charges/charges.logic'
import type { ChargeCategory } from '../charges/charges.types'

function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

const FR_MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

interface StatData {
  deliveries: Record<string, unknown>[]
  charges: Record<string, unknown>[]
  fuel: Record<string, unknown>[]
  maintenances: Record<string, unknown>[]
  year: number
}

export function Statistiques() {
  const [data, setData] = useState<StatData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await getStatistiquesData()
    setData(d as StatData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Agrégations
  const caMensuel = Array.from({ length: 12 }, (_, month) => {
    const cts = (data?.deliveries ?? [])
      .filter(d => new Date(d.date as string).getMonth() === month)
      .reduce((s, d) => s + (d.montant_ht_cts as number), 0)
    return { month, cts }
  })
  const maxCa = Math.max(...caMensuel.map(m => m.cts), 1)

  const caTotal = (data?.deliveries ?? []).reduce((s, d) => s + (d.montant_ht_cts as number), 0)
  const chargesTotal = (data?.charges ?? []).reduce((s, d) => s + (d.montant_ht_cts as number), 0)
  const fuelTotal = (data?.fuel ?? []).reduce((s, d) => s + (d.total_cts as number), 0)
  const maintenanceTotal = (data?.maintenances ?? []).reduce((s, d) => s + ((d.cost_cts as number) ?? 0), 0)

  // Top clients
  const clientMap: Record<string, { name: string; cts: number }> = {}
  for (const d of (data?.deliveries ?? [])) {
    const cid = d.client_id as string
    const cname = (d.clients as { name: string } | null)?.name ?? '—'
    if (!clientMap[cid]) clientMap[cid] = { name: cname, cts: 0 }
    clientMap[cid].cts += d.montant_ht_cts as number
  }
  const topClients = Object.values(clientMap).sort((a, b) => b.cts - a.cts).slice(0, 5)
  const maxClient = topClients[0]?.cts ?? 1

  // Charges par catégorie
  const chargesByCategory: Record<string, number> = {}
  for (const d of (data?.charges ?? [])) {
    const cat = (d.category as string) ?? 'autre'
    chargesByCategory[cat] = (chargesByCategory[cat] ?? 0) + (d.montant_ht_cts as number)
  }
  const sortedCategories = Object.entries(chargesByCategory).sort((a, b) => b[1] - a[1])
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
              <KpiCard label="CA HT" value={formatCents(caTotal)} accent />
              <KpiCard label="Charges HT" value={formatCents(chargesTotal)} />
              <KpiCard label="Carburant" value={formatCents(fuelTotal)} />
              <KpiCard label="Entretiens" value={formatCents(maintenanceTotal)} />
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
                {caMensuel.map(({ month, cts }) => {
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
              ) : topClients.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune donnée
                </p>
              ) : topClients.map((c, i) => (
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
              <KpiCard label="CA HT" value={formatCents(caTotal)} accent />
              <KpiCard label="Total charges HT" value={formatCents(chargesTotal + fuelTotal + maintenanceTotal)} />
              <KpiCard
                label="Marge brute"
                value={formatCents(caTotal - chargesTotal - fuelTotal - maintenanceTotal)}
                accent={caTotal > chargesTotal + fuelTotal + maintenanceTotal}
              />
            </div>
          </section>
        )}
      </div>
    </Shell>
  )
}
