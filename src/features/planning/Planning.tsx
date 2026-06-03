import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { DrawerLivraison } from '../livraisons/DrawerLivraison'
import { getDeliveriesForWeek } from './planning.queries'
import { STATUS_LABELS, STATUS_COLOR, formatCents } from '../livraisons/livraisons.logic'
import type { DeliveryRow } from '../livraisons/livraisons.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

// ── Utilitaires semaine ──────────────────────────────────────────────────────

function getWeekDays(anchor: Date): Date[] {
  const d = new Date(anchor)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(d)
    nd.setDate(d.getDate() + i)
    return nd
  })
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const FR_DAYS_LONG  = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FR_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const FR_MONTHS     = ['jan.','fév.','mar.','avr.','mai','jun.','jul.','aoû.','sep.','oct.','nov.','déc.']

function weekLabel(days: Date[]): string {
  const s = days[0], e = days[6]
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()} — ${e.getDate()} ${FR_MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  return `${s.getDate()} ${FR_MONTHS[s.getMonth()]} — ${e.getDate()} ${FR_MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

// ── Composant ────────────────────────────────────────────────────────────────

export function Planning() {
  const [anchor, setAnchor]     = useState(new Date())
  const [rows, setRows]         = useState<DeliveryRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)

  const weekDays = getWeekDays(anchor)
  const dateFrom = toISO(weekDays[0])
  const dateTo   = toISO(weekDays[6])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getDeliveriesForWeek(dateFrom, dateTo)
    setRows(data ?? [])
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const prevWeek  = () => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d) }
  const nextWeek  = () => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d) }
  const goToToday = () => setAnchor(new Date())

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
  }

  const byDay = Object.fromEntries(weekDays.map(d => [toISO(d), [] as DeliveryRow[]]))
  rows.forEach(r => { if (byDay[r.date]) byDay[r.date].push(r) })

  const today = toISO(new Date())
  const total = rows.length

  return (
    <Shell pageTitle="Planning" actions={['nouveau']} onAction={handleAction}>
      {/* Navigation semaine */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="compact" onClick={prevWeek} aria-label="Semaine précédente">
            <ChevronLeft size={16} />
          </Button>
          <span className="text-[var(--fs-body)] font-medium text-[var(--text)] min-w-[200px] text-center select-none">
            {weekLabel(weekDays)}
          </span>
          <Button variant="ghost" size="compact" onClick={nextWeek} aria-label="Semaine suivante">
            <ChevronRight size={16} />
          </Button>
        </div>
        <Button variant="secondary" size="compact" onClick={goToToday}>
          Aujourd'hui
        </Button>
        <span className="ml-auto text-[var(--fs-xs)] text-[var(--text-muted)]">
          {total} livraison{total !== 1 ? 's' : ''} cette semaine
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <>
          {/* Desktop : grille 7 colonnes */}
          <div className="hidden sm:grid grid-cols-7 gap-2">
            {weekDays.map((day, i) => {
              const key = toISO(day)
              const deliveries = byDay[key] ?? []
              const isToday = key === today
              return (
                <div
                  key={key}
                  className={`flex flex-col rounded-[var(--r-lg)] border overflow-hidden
                    ${isToday ? 'border-[var(--brand)]' : 'border-[var(--border)]'}`}
                >
                  <div className={`px-2 py-2 text-center border-b shrink-0
                    ${isToday
                      ? 'bg-[var(--brand)] border-[var(--brand)]'
                      : 'bg-[var(--bg-elevated)] border-[var(--border)]'}`}
                  >
                    <div className={`text-[10px] font-semibold uppercase tracking-wide
                      ${isToday ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                      {FR_DAYS_SHORT[i]}
                    </div>
                    <div className={`text-[var(--fs-body)] font-bold leading-tight
                      ${isToday ? 'text-white' : 'text-[var(--text)]'}`}>
                      {day.getDate()}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 p-1.5 min-h-[120px]">
                    {deliveries.map(d => (
                      <button
                        key={d.id}
                        onClick={() => { setSelected(d); setDrawerOpen(true) }}
                        className="w-full text-left px-2 py-1.5 rounded-[var(--r-sm)]
                          bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]
                          border border-[var(--border)] transition-colors"
                      >
                        <Badge color={STATUS_COLOR[d.statut]}>
                          {STATUS_LABELS[d.statut]}
                        </Badge>
                        <div className="text-[var(--fs-xs)] font-medium text-[var(--text)] truncate mt-0.5">
                          {d.clients?.name ?? '—'}
                        </div>
                        {d.team_members?.full_name && (
                          <div className="text-[10px] text-[var(--text-muted)] truncate">
                            {d.team_members.full_name}
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                          {formatCents(d.montant_ht_cts)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile : liste par jour */}
          <div className="sm:hidden flex flex-col gap-3">
            {weekDays.map((day, i) => {
              const key = toISO(day)
              const deliveries = byDay[key] ?? []
              const isToday = key === today
              return (
                <div key={key} className={`rounded-[var(--r-lg)] border overflow-hidden
                  ${isToday ? 'border-[var(--brand)]' : 'border-[var(--border)]'}`}>
                  <div className={`flex items-center justify-between px-4 py-2 border-b
                    ${isToday
                      ? 'bg-[var(--brand)] border-[var(--brand)]'
                      : 'bg-[var(--bg-elevated)] border-[var(--border)]'}`}
                  >
                    <span className={`font-semibold text-[var(--fs-sm)]
                      ${isToday ? 'text-white' : 'text-[var(--text)]'}`}>
                      {FR_DAYS_LONG[i]} {day.getDate()} {FR_MONTHS[day.getMonth()]}
                    </span>
                    {deliveries.length > 0 && (
                      <span className={`text-[var(--fs-xs)] ${isToday ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                        {deliveries.length} course{deliveries.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {deliveries.length === 0 ? (
                    <div className="px-4 py-3 text-[var(--fs-xs)] text-[var(--text-disabled)]">
                      Aucune livraison
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {deliveries.map(d => (
                        <button
                          key={d.id}
                          onClick={() => { setSelected(d); setDrawerOpen(true) }}
                          className="w-full text-left px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[var(--text)] text-[var(--fs-sm)]">
                              {d.clients?.name ?? '—'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[var(--fs-xs)] text-[var(--text)]">
                                {formatCents(d.montant_ht_cts)}
                              </span>
                              <Badge color={STATUS_COLOR[d.statut]}>{STATUS_LABELS[d.statut]}</Badge>
                            </div>
                          </div>
                          {d.team_members?.full_name && (
                            <div className="text-[var(--fs-xs)] text-[var(--text-muted)] mt-0.5">
                              {d.team_members.full_name}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {total === 0 && (
            <div className="mt-4">
              <EmptyState
                icon={<CalendarDays size={48} />}
                title="Semaine sans livraison"
                description="Aucune livraison planifiée pour cette semaine."
                action={{ label: '+ Nouvelle livraison', onClick: () => { setSelected(null); setDrawerOpen(true) } }}
              />
            </div>
          )}
        </>
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
