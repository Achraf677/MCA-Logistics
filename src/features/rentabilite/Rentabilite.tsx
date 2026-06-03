import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getRentabiliteData } from './rentabilite.queries'

const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const FR_MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

function fmt(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
}

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return Math.round((a / b) * 100) + ' %'
}

interface MonthRow {
  month: number
  caHt: number
  charges: number
  carburant: number
  entretiens: number
  resultat: number
}

export function Rentabilite() {
  const [year, setYear]   = useState(new Date().getFullYear())
  const [data, setData]   = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const raw = await getRentabiliteData(year)

    const rows: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
      const m = i
      const caHt      = raw.deliveries.filter(d => new Date(d.date as string).getMonth() === m).reduce((s, d) => s + (d.montant_ht_cts as number), 0)
      const charges   = raw.charges.filter(d => new Date(d.date as string).getMonth() === m).reduce((s, d) => s + (d.montant_ht_cts as number), 0)
      const carburant = raw.fuel.filter(d => new Date(d.date as string).getMonth() === m).reduce((s, d) => s + (d.total_cts as number), 0)
      const entretiens = raw.maintenances.filter(d => new Date(d.date as string).getMonth() === m).reduce((s, d) => s + ((d.cost_cts as number) ?? 0), 0)
      return { month: m, caHt, charges, carburant, entretiens, resultat: caHt - charges - carburant - entretiens }
    })

    setData(rows)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const totals = data.reduce(
    (acc, r) => ({
      caHt: acc.caHt + r.caHt,
      charges: acc.charges + r.charges,
      carburant: acc.carburant + r.carburant,
      entretiens: acc.entretiens + r.entretiens,
      resultat: acc.resultat + r.resultat,
    }),
    { caHt: 0, charges: 0, carburant: 0, entretiens: 0, resultat: 0 }
  )

  const maxAbsResult = Math.max(...data.map(r => Math.abs(r.resultat)), 1)
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : -1

  return (
    <Shell pageTitle="Rentabilité">
      <div className="space-y-6">

        {/* Sélecteur année */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="compact" onClick={() => setYear(y => y - 1)}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-[var(--fs-body)] font-semibold text-[var(--text)] w-16 text-center select-none">
            {year}
          </span>
          <Button variant="ghost" size="compact" onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()}>
            <ChevronRight size={16} />
          </Button>
        </div>

        {/* KPIs annuels */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-[72px]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="CA HT" value={fmt(totals.caHt)} accent />
            <KpiCard label="Total charges" value={fmt(totals.charges + totals.carburant + totals.entretiens)} />
            <KpiCard label="Résultat brut" value={fmt(totals.resultat)} accent={totals.resultat > 0} />
            <KpiCard label="Taux de marge" value={pct(totals.resultat, totals.caHt)} />
          </div>
        )}

        {/* Graphe résultats */}
        <div className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-5">
          <p className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-4">
            Résultat mensuel
          </p>
          {loading ? <Skeleton className="h-28" /> : (
            <div className="flex items-end gap-1.5 h-28">
              {data.map(r => {
                const positive = r.resultat >= 0
                const barPct = maxAbsResult > 0 ? Math.max(Math.abs(r.resultat) / maxAbsResult * 100, r.resultat !== 0 ? 4 : 0) : 0
                const isCurrent = r.month === currentMonth
                return (
                  <div key={r.month} className="flex flex-col items-center gap-1 flex-1">
                    {positive ? (
                      <>
                        <span className="text-[9px] text-[var(--text-disabled)] font-mono">
                          {r.resultat > 0 ? Math.round(r.resultat / 100) : ''}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div className={`w-full rounded-t-[3px] ${isCurrent ? 'bg-[var(--success)]' : 'bg-[var(--success)]/40'}`}
                            style={{ height: barPct > 0 ? `${barPct}%` : '2px' }}
                            title={`${FR_MONTHS_SHORT[r.month]} : ${fmt(r.resultat)}`} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-full flex-1 flex items-start">
                          <div className={`w-full rounded-b-[3px] ${isCurrent ? 'bg-[var(--danger)]' : 'bg-[var(--danger)]/40'}`}
                            style={{ height: barPct > 0 ? `${barPct}%` : '2px' }}
                            title={`${FR_MONTHS_SHORT[r.month]} : ${fmt(r.resultat)}`} />
                        </div>
                        <span className="text-[9px] text-[var(--danger)] font-mono">
                          {r.resultat < 0 ? Math.round(r.resultat / 100) : ''}
                        </span>
                      </>
                    )}
                    <span className={`text-[9px] leading-none ${isCurrent ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                      {FR_MONTHS_SHORT[r.month]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tableau mensuel */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-[var(--fs-sm)]">
            <thead>
              <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-right">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--fs-xs)] uppercase tracking-wide">Mois</th>
                {['CA HT','Charges','Carburant','Entretiens','Résultat'].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0,1,2].map(i => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      {[0,1,2,3,4,5].map(j => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4" /></td>
                      ))}
                    </tr>
                  ))
                : data.map((r, i) => {
                  const isCurrentMonth = r.month === currentMonth
                  const hasData = r.caHt > 0 || r.charges > 0 || r.carburant > 0 || r.entretiens > 0
                  return (
                    <tr key={r.month}
                      className={`border-t border-[var(--border)] transition-colors
                        ${isCurrentMonth ? 'bg-[var(--brand-soft)]' : i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/30'}
                        ${!hasData ? 'opacity-40' : ''}`}>
                      <td className={`px-4 py-2.5 font-medium ${isCurrentMonth ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
                        {FR_MONTHS[r.month]}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--text)]">{r.caHt > 0 ? fmt(r.caHt) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--text-muted)]">{r.charges > 0 ? fmt(r.charges) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--text-muted)]">{r.carburant > 0 ? fmt(r.carburant) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--text-muted)]">{r.entretiens > 0 ? fmt(r.entretiens) : '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold
                        ${r.resultat > 0 ? 'text-[var(--success)]' : r.resultat < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
                        {hasData ? fmt(r.resultat) : '—'}
                      </td>
                    </tr>
                  )
                })}
              {/* Total */}
              {!loading && (
                <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-elevated)] font-semibold">
                  <td className="px-4 py-3 text-[var(--text)]">Total {year}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text)]">{fmt(totals.caHt)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{fmt(totals.charges)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{fmt(totals.carburant)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{fmt(totals.entretiens)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-lg
                    ${totals.resultat > 0 ? 'text-[var(--success)]' : totals.resultat < 0 ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                    {fmt(totals.resultat)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}
