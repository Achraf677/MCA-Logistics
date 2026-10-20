import { useEffect } from 'react'
import { CalendarDays, ExternalLink, UserX, X } from 'lucide-react'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { toLocalISO } from '../../shared/lib/dates'
import type { ChauffeurPlanning, CoursePlanning } from './planning.types'

const dansNJours = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n); return toLocalISO(d)
}

/**
 * Actions rapides sur UNE course : affecter à un chauffeur, changer de jour, ouvrir la fiche.
 * Feuille qui monte du bas sur mobile (zone du pouce), fenêtre centrée sur PC.
 */
export function MenuCourse({ course, affectables, onAffecter, onJour, onOuvrir, onFermer }: {
  course: CoursePlanning
  affectables: ChauffeurPlanning[]
  onAffecter: (driverId: string | null) => void
  onJour: (date: string) => void
  onOuvrir: () => void
  onFermer: () => void
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFermer])

  const ligne = 'min-h-11 w-full px-3 inline-flex items-center gap-2 rounded-[var(--r-md)] border text-sm text-left'
  const aujourdhui = dansNJours(0)
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50" onClick={onFermer} role="presentation">
      <div
        role="dialog" aria-modal="true" aria-label="Actions sur la course"
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[85dvh] overflow-auto rounded-t-[var(--r-xl)] sm:rounded-[var(--r-xl)] border border-[var(--border)]
          bg-[var(--bg-elevated)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[var(--text)] truncate">{course.clients?.name ?? 'Course'}</p>
            <p className="text-xs text-[var(--text-muted)]">{course.date.split('-').reverse().join('/')}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            className="w-11 h-11 inline-flex items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:text-[var(--text)]">
            <X size={18} />
          </button>
        </div>

        <button type="button" onClick={onOuvrir} className={`${ligne} border-[var(--border)] text-[var(--text)]`}>
          <ExternalLink size={16} /> Ouvrir la fiche
        </button>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Affecter à</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {affectables.map(m => (
              <button key={m.id} type="button" onClick={() => onAffecter(m.id)}
                className={`${ligne} ${course.driver_id === m.id ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                <DriverAvatar name={m.full_name} size={22} /> <span className="truncate">{m.full_name}</span>
              </button>
            ))}
            <button type="button" onClick={() => onAffecter(null)}
              className={`${ligne} ${!course.driver_id ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
              <UserX size={16} /> Non affecté
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Jour</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => onJour(aujourdhui)} className={`${ligne} border-[var(--border)] text-[var(--text)]`}>
              <CalendarDays size={16} /> Aujourd'hui
            </button>
            <button type="button" onClick={() => onJour(dansNJours(1))} className={`${ligne} border-[var(--border)] text-[var(--text)]`}>
              <CalendarDays size={16} /> Demain
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Autre jour
            <input type="date" defaultValue={course.date} onChange={e => { if (e.target.value) onJour(e.target.value) }}
              className="min-h-11 flex-1 px-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]" />
          </label>
        </div>
      </div>
    </div>
  )
}
