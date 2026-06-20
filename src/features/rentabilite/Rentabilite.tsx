import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Euro, TrendingDown, Wallet, Percent } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getRentabiliteData } from './rentabilite.queries'
import { monthlyRows, annualTotals, margeRatio, type MonthRow } from './rentabilite.logic'

const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const FR_MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

function fmt(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
}

function fmtMarge(ratio: number | null): string {
  if (ratio === null) return '—'
  return Math.round(ratio * 100) + ' %'
}

export function Rentabilite() {
  const [year, setYear]   = useState(new Date().getFullYear())
  const [data, setData]   = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const raw = await getRentabiliteData(year)
    setData(monthlyRows(raw))
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const totals = annualTotals(data)

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
            <KpiCard label="CA HT"         value={fmt(totals.caHt)} tone="success" icon={<Euro size={18} />} />
            <KpiCard label="Total charges"  value={fmt(totals.charges + totals.carburant + totals.entretiens)} tone="warning" icon={<TrendingDown size={18} />} />
            <KpiCard label="Résultat brut"  value={fmt(totals.resultat)} tone={totals.resultat >= 0 ? 'success' : 'danger'} icon={<Wallet size={18} />} />
            <KpiCard label="Taux de marge"  value={fmtMarge(margeRatio(totals))} tone="violet" icon={<Percent size={18} />} />
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
                const isCurrent = r.mois === currentMonth
                return (
                  <div key={r.mois} className="flex flex-col items-center gap-1 flex-1">
                    {positive ? (
                      <>
                        <span className="text-[9px] text-[var(--text-disabled)] font-mono">
                          {r.resultat > 0 ? Math.round(r.resultat / 100) : ''}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div className={`w-full rounded-t-[3px] ${isCurrent ? 'bg-[var(--success)]' : 'bg-[var(--success)]/40'}`}
                            style={{ height: barPct > 0 ? `${barPct}%` : '2px' }}
                            title={`${FR_MONTHS_SHORT[r.mois]} : ${fmt(r.resultat)}`} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-full flex-1 flex items-start">
                          <div className={`w-full rounded-b-[3px] ${isCurrent ? 'bg-[var(--danger)]' : 'bg-[var(--danger)]/40'}`}
                            style={{ height: barPct > 0 ? `${barPct}%` : '2px' }}
                            title={`${FR_MONTHS_SHORT[r.mois]} : ${fmt(r.resultat)}`} />
                        </div>
                        <span className="text-[9px] text-[var(--danger)] font-mono">
                          {r.resultat < 0 ? Math.round(r.resultat / 100) : ''}
                        </span>
                      </>
                    )}
                    <span className={`text-[9px] leading-none ${isCurrent ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                      {FR_MONTHS_SHORT[r.mois]}
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
                  const isCurrentMonth = r.mois === currentMonth
                  const hasData = r.caHt > 0 || r.charges > 0 || r.carburant > 0 || r.entretiens > 0
                  return (
                    <tr key={r.mois}
                      className={`border-t border-[var(--border)] transition-colors
                        ${isCurrentMonth ? 'bg-[var(--brand-soft)]' : i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/30'}
                        ${!hasData ? 'opacity-40' : ''}`}>
                      <td className={`px-4 py-2.5 font-medium ${isCurrentMonth ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
                        {FR_MONTHS[r.mois]}
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
