import { useMemo } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { UserX } from 'lucide-react'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { COULEUR_FAMILLE, familleCourse, grouperParChauffeur, estDeplacable, niveauCharge, sansTerminees } from './planning.logic'
import type { ChauffeurPlanning, CibleDeplacement, CoursePlanning } from './planning.types'

const FOND_CHARGE = {
  libre: '', ok: '', plein: 'bg-[var(--warning)]/10', surcharge: 'bg-[var(--danger)]/15',
} as const

const MAX_POINTS = 10

/** Un point = une course, de la couleur de sa famille ; anneau rouge = urgente, ou échec terrain. */
function Point({ c, peutEcrire, onOuvrir, onDragStart, onDragEnd }: {
  c: CoursePlanning
  peutEcrire: boolean
  onOuvrir: (c: CoursePlanning) => void
  onDragStart: (e: DragEvent, c: CoursePlanning) => void
  onDragEnd: () => void
}) {
  const famille = familleCourse(c.statut)
  const alerte = c.urgent || !!c.probleme_le
  return (
    <button
      type="button"
      draggable={peutEcrire && estDeplacable(c.statut)}
      onDragStart={e => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onOuvrir(c) }}
      title={`${c.clients?.name ?? '—'}${c.urgent ? ' · urgent' : ''}`}
      aria-label={`Course ${c.clients?.name ?? ''}`}
      className={`w-3.5 h-3.5 rounded-full shrink-0 ${familleCourse(c.statut) === 'terminee' ? 'opacity-50' : ''}`}
      style={{ background: COULEUR_FAMILLE[famille], boxShadow: alerte ? '0 0 0 2px var(--danger)' : undefined }}
    />
  )
}

/**
 * Vue « Semaine » PC : une ligne par chauffeur, un jour par colonne. Chaque case dit combien de courses
 * (et si c'est trop) ; un clic ouvre le jour. Les points se glissent d'une case à l'autre.
 */
export function VueSemaine({
  jours, aujourdhui, courses, equipe, seuil, afficherTerminees, peutEcrire, enTeteJour,
  cible, classeCible, onOuvrir, onOuvrirJour, onDragStart, onDragEnd,
}: {
  jours: string[]
  aujourdhui: string
  courses: CoursePlanning[]
  equipe: ChauffeurPlanning[]
  seuil: number
  afficherTerminees: boolean
  peutEcrire: boolean
  enTeteJour: (i: number, nb: number) => ReactNode
  cible: (cle: string, c: CibleDeplacement) => { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void }
  classeCible: (cle: string) => string
  onOuvrir: (c: CoursePlanning) => void
  onOuvrirJour: (jour: string) => void
  onDragStart: (e: DragEvent, c: CoursePlanning) => void
  onDragEnd: () => void
}) {
  const { courses: visibles } = useMemo(() => sansTerminees(courses, afficherTerminees), [courses, afficherTerminees])
  const lignes = useMemo(() => grouperParChauffeur(visibles, jours, equipe), [visibles, jours, equipe])
  const parJour = useMemo(() => jours.map(j => visibles.filter(c => c.date === j).length), [visibles, jours])
  // Les chauffeurs sans course de la semaine tiennent sur une ligne mince plutôt que d'être masqués.
  return (
    <div className="hidden sm:block lg:flex-1 min-h-0 overflow-auto rounded-[var(--r-lg)] border border-[var(--border)]">
      <div className="grid grid-cols-[9rem_repeat(7,minmax(5.5rem,1fr))_4.5rem] min-w-max lg:min-w-0">
        <div className="sticky top-0 left-0 z-20 bg-[var(--bg-elevated)] border-b border-r border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)]">
          Chauffeur
        </div>
        {jours.map((j, i) => <div key={j} className="sticky top-0 z-10">{enTeteJour(i, parJour[i])}</div>)}
        <div className="sticky top-0 z-10 bg-[var(--bg-elevated)] border-b border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)] text-center">Total</div>

        {lignes.map(l => {
          const cle = l.driverId ?? 'aucun'
          const sansAffectation = l.driverId === null
          return [
            <div key={`${cle}-nom`}
              className={`sticky left-0 z-[5] border-b border-r border-[var(--border)] px-2 py-1.5 bg-[var(--bg-elevated)] flex items-center gap-2 min-w-0
                ${sansAffectation && l.total > 0 ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
              {sansAffectation ? <UserX size={16} className="shrink-0" /> : <DriverAvatar name={l.nom} size={22} />}
              <span className="text-xs font-semibold truncate" title={l.nom}>{l.nom}</span>
            </div>,
            ...jours.map(j => {
              const liste = l.cellules[j]
              const n = liste.length
              const niveau = sansAffectation ? (n > 0 ? 'surcharge' : 'libre') : niveauCharge(n, seuil)
              const ck = `${cle}|${j}`
              return (
                <div
                  key={ck}
                  {...cible(ck, { driverId: l.driverId, date: j })}
                  onClick={() => onOuvrirJour(j)}
                  title={n > 0 ? `${n} course${n > 1 ? 's' : ''} — ouvrir le jour` : undefined}
                  className={`relative border-b border-r border-[var(--border)] px-1.5 py-1 min-h-[2.75rem] cursor-pointer
                    flex flex-col justify-center gap-0.5 hover:bg-[var(--bg-card-hover)]
                    ${j === aujourdhui ? 'bg-[var(--brand-soft)]/40' : ''} ${FOND_CHARGE[niveau]} ${classeCible(ck)}`}
                >
                  {n > 0 && (
                    <>
                      <span className={`text-xs font-bold tabular-nums leading-none ${niveau === 'surcharge' ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>{n}</span>
                      <span className="flex flex-wrap gap-0.5">
                        {liste.slice(0, MAX_POINTS).map(c => (
                          <Point key={c.id} c={c} peutEcrire={peutEcrire} onOuvrir={onOuvrir} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                        ))}
                        {n > MAX_POINTS && <span className="text-[0.65rem] text-[var(--text-muted)] leading-none self-center">+{n - MAX_POINTS}</span>}
                      </span>
                    </>
                  )}
                </div>
              )
            }),
            <div key={`${cle}-tot`}
              className={`border-b border-[var(--border)] px-1 py-1 flex items-center justify-center text-xs tabular-nums
                ${l.total === 0 ? 'text-[var(--text-disabled)]' : sansAffectation ? 'text-[var(--danger)] font-bold' : 'text-[var(--text)] font-semibold'}`}>
              {l.total === 0 ? 'libre' : l.total}
            </div>,
          ]
        })}
      </div>
    </div>
  )
}
