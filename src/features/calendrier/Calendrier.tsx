import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { DrawerLivraison } from '../livraisons/DrawerLivraison'
import { getDeliveries } from '../livraisons/livraisons.queries'
import type { DeliveryRow } from '../livraisons/livraisons.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const FR_DAYS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function toISO(d: Date): string { return d.toISOString().slice(0, 10) }

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1

  const weeks: (Date | null)[][] = []
  let week: (Date | null)[] = Array(startDow).fill(null)

  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d))
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

export function Calendrier() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [rows, setRows]   = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)

  const monthStart = toISO(new Date(year, month, 1))
  const monthEnd   = toISO(new Date(year, month + 1, 0))

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getDeliveries({ date_from: monthStart, date_to: monthEnd })
    setRows((data as unknown as DeliveryRow[]) ?? [])
    setLoading(false)
  }, [monthStart, monthEnd])

  useEffect(() => { load() }, [load])

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  const goToToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
  }

  const byDay: Record<string, DeliveryRow[]> = {}
  rows.forEach(r => { if (!byDay[r.date]) byDay[r.date] = []; byDay[r.date].push(r) })

  const grid = getMonthGrid(year, month)
  const today = toISO(new Date())

  return (
    <Shell pageTitle="Calendrier" actions={['nouveau']} onAction={handleAction}>
      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="compact" onClick={prevMonth}><ChevronLeft size={16} /></Button>
          <span className="text-[var(--fs-body)] font-semibold text-[var(--text)] min-w-[160px] text-center select-none capitalize">
            {FR_MONTHS[month]} {year}
          </span>
          <Button variant="ghost" size="compact" onClick={nextMonth}><ChevronRight size={16} /></Button>
        </div>
        <Button variant="secondary" size="compact" onClick={goToToday}>Aujourd'hui</Button>
        <span className="ml-auto text-[var(--fs-xs)] text-[var(--text-muted)]">
          {rows.length} livraison{rows.length !== 1 ? 's' : ''} ce mois
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
          {/* En-têtes jours */}
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            {FR_DAYS.map(d => (
              <div key={d} className="px-2 py-2 text-center text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Semaines */}
          {grid.map((week, wi) => (
            <div key={wi} className={`grid grid-cols-7 ${wi > 0 ? 'border-t border-[var(--border)]' : ''}`}>
              {week.map((day, di) => {
                if (!day) return (
                  <div key={di} className="min-h-[90px] bg-[var(--bg-elevated)]/50 border-r border-[var(--border)] last:border-r-0" />
                )
                const key = toISO(day)
                const deliveries = byDay[key] ?? []
                const isToday = key === today
                const isWeekend = di >= 5
                return (
                  <div key={di}
                    className={`min-h-[90px] border-r border-[var(--border)] last:border-r-0 flex flex-col
                      ${isWeekend ? 'bg-[var(--bg-elevated)]/30' : ''}
                      ${isToday ? 'ring-inset ring-2 ring-[var(--brand)]' : ''}`}>
                    {/* Numéro du jour */}
                    <div className={`px-2 pt-1.5 pb-0.5 text-right shrink-0`}>
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[var(--fs-xs)] font-medium leading-none
                        ${isToday ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)]'}`}>
                        {day.getDate()}
                      </span>
                    </div>
                    {/* Livraisons */}
                    <div className="flex flex-col gap-0.5 px-1 pb-1.5 flex-1 overflow-hidden">
                      {deliveries.slice(0, 3).map(d => (
                        <button key={d.id}
                          onClick={() => { setSelected(d); setDrawerOpen(true) }}
                          className="w-full text-left px-1.5 py-0.5 rounded-[3px]
                            bg-[var(--brand)]/10 hover:bg-[var(--brand)]/20 transition-colors truncate">
                          <span className="text-[10px] text-[var(--brand)] font-medium truncate block leading-tight">
                            {d.clients?.name ?? '?'}
                          </span>
                        </button>
                      ))}
                      {deliveries.length > 3 && (
                        <span className="text-[10px] text-[var(--text-muted)] px-1">
                          +{deliveries.length - 3} autre{deliveries.length - 3 > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Liste du jour sélectionné (mobile-friendly) */}
      {!loading && rows.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<Calendar size={48} />}
            title="Aucune livraison ce mois"
            description="Aucune livraison n'est enregistrée pour ce mois."
            action={{ label: '+ Nouvelle livraison', onClick: () => { setSelected(null); setDrawerOpen(true) } }}
          />
        </div>
      )}

      <DrawerLivraison
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        delivery={selected}
        onSaved={load}
      />
    </Shell>
  )
}
