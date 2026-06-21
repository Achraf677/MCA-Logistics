import { useState, useEffect, useCallback } from 'react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getTvaData } from './tva.queries'
import { computeTva, type TvaResult } from './tva.logic'

function fmt(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const QUARTERS = [
  { label: 'T1 (Jan–Mar)', from: '-01-01', to: '-03-31' },
  { label: 'T2 (Avr–Jun)', from: '-04-01', to: '-06-30' },
  { label: 'T3 (Jul–Sep)', from: '-07-01', to: '-09-30' },
  { label: 'T4 (Oct–Déc)', from: '-10-01', to: '-12-31' },
]

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MONTH_RANGES = MONTHS.map((_, i) => {
  const m = String(i + 1).padStart(2, '0')
  const lastDay = new Date(2000, i + 1, 0).getDate()
  return { from: `-${m}-01`, to: `-${m}-${lastDay}` }
})

export function Tva() {
  const year = new Date().getFullYear()
  const curQ = Math.floor(new Date().getMonth() / 3)

  const [mode, setMode]       = useState<'trimestre' | 'mois'>('trimestre')
  const [quarter, setQuarter] = useState(curQ)
  const [month, setMonth]     = useState(new Date().getMonth())
  const [result, setResult]   = useState<TvaResult | null>(null)
  const [loading, setLoading] = useState(true)

  const period = mode === 'trimestre' ? QUARTERS[quarter] : MONTH_RANGES[month]
  const dateFrom = `${year}${period.from}`
  const dateTo   = `${year}${period.to}`

  const load = useCallback(async () => {
    setLoading(true)
    const raw = await getTvaData(dateFrom, dateTo)
    setResult(computeTva(raw))
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const periodLabel = mode === 'trimestre'
    ? `${QUARTERS[quarter].label} ${year}`
    : `${MONTHS[month]} ${year}`

  return (
    <Shell pageTitle="TVA">
      <div className="max-w-2xl space-y-6">

        {/* Sélecteur période */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-0 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]">
            {(['trimestre', 'mois'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-1.5 text-[var(--fs-sm)] transition-colors capitalize
                  ${mode === m ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                {m === 'trimestre' ? 'Trimestre' : 'Mois'}
              </button>
            ))}
          </div>

          {mode === 'trimestre' ? (
            <select value={quarter} onChange={e => setQuarter(Number(e.target.value))}
              className={selCls}>
              {QUARTERS.map((q, i) => <option key={i} value={i}>{q.label}</option>)}
            </select>
          ) : (
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className={selCls}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}
          <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{year}</span>
        </div>

        {/* KPIs */}
        {loading ? (
          <div className="grid grid-cols-2 gap-5 [&>*]:min-w-0">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-[72px]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 [&>*]:min-w-0">
            <KpiCard label="TVA collectée" value={fmt(result!.tvaCollecteeCts)} accent />
            <KpiCard label="TVA déductible charges" value={fmt(result!.tvaDeductibleCharges)} />
            <KpiCard label="TVA déductible carburant" value={fmt(result!.tvaDeductibleCarburant)} />
            <KpiCard
              label="Solde à déclarer"
              value={fmt(result!.soldeCts)}
              accent={result!.soldeCts > 0}
            />
          </div>
        )}

        {/* Détail */}
        <div className="glass rounded-[var(--r-xl)] overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
            <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Déclaration TVA — {periodLabel}
            </span>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              <Row label="TVA collectée sur ventes" value={result!.tvaCollecteeCts} positive />
              <div className="px-4 py-2 text-[var(--fs-xs)] text-[var(--text-muted)] bg-[var(--bg-elevated)]/50 uppercase tracking-wide font-medium">
                TVA déductible
              </div>
              <Row label="→ Charges générales" value={result!.tvaDeductibleCharges} negative />
              <Row label="→ Carburant" value={result!.tvaDeductibleCarburant} negative />
              <div className="px-4 py-3 flex items-center justify-between bg-[var(--bg-elevated)]">
                <span className="font-semibold text-[var(--text)]">TVA nette à déclarer</span>
                <span className={`font-mono font-bold text-lg
                  ${result!.soldeCts > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                  {fmt(result!.soldeCts)}
                </span>
              </div>
            </div>
          )}
        </div>

        <p className="text-[var(--fs-xs)] text-[var(--text-disabled)]">
          * TVA calculée sur les livraisons au statut "Facturée" ou "Payée".
          Vérifiez auprès de votre comptable avant toute déclaration.
        </p>
      </div>
    </Shell>
  )
}

function Row({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">{label}</span>
      <span className={`font-mono text-[var(--fs-sm)] font-medium
        ${positive ? 'text-[var(--success)]' : negative ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
        {positive ? '+' : negative ? '−' : ''} {(value / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
      </span>
    </div>
  )
}

const selCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
