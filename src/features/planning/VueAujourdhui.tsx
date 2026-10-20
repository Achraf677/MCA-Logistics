import { useMemo, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock, PackageCheck, Route as RouteIcon, UserX,
} from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { EmptyState } from '../../shared/ui/EmptyState'
import { grouperParChauffeur, kpisJour, niveauCharge, sansTerminees } from './planning.logic'
import type { MarqueurEcheance } from './mois.logic'
import type { ChauffeurPlanning, CibleDeplacement, CoursePlanning, TourneeColisJour } from './planning.types'

const COULEUR_CHARGE = {
  libre: 'var(--text-disabled)', ok: 'var(--success)', plein: 'var(--warning)', surcharge: 'var(--danger)',
} as const

const estPC = () => { try { return window.matchMedia('(min-width: 1024px)').matches } catch { return true } }

/** Tuile de chiffre du jour (les exceptions sont dans le bandeau « À traiter » et les blocs rouges). */
function Tuile({ n, libelle }: { n: number; libelle: string }) {
  return (
    <div className="shrink-0 min-w-[5.5rem] flex-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5">
      <p className="text-xl font-bold tabular-nums leading-tight text-[var(--text)]">{n}</p>
      <p className="text-xs text-[var(--text-muted)] truncate">{libelle}</p>
    </div>
  )
}

function Bloc({ titre, icone, alerte = false, children }: { titre: string; icone: ReactNode; alerte?: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-[var(--r-lg)] border p-2.5 flex flex-col gap-1.5 min-w-0 ${alerte ? 'border-[var(--danger)]/40' : 'border-[var(--border)]'}`}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">{icone}{titre}</h3>
      <div className="flex flex-col gap-1 max-h-[8.5rem] overflow-auto">{children}</div>
    </section>
  )
}

const LIB_TOURNEE = { a_faire: 'À faire', en_cours: 'En cours', cloturee: 'Terminée' } as const

/**
 * Vue « Jour » : l'exception d'abord (retards, échéances, tournées de colis), puis une ligne par
 * chauffeur avec sa charge et ses courses. Sert aussi de liste du jour sur mobile.
 */
export function VueAujourdhui({
  jour, aujourdhui, courses, enRetard, equipe, seuil, afficherTerminees, colis, echeances, avecKpis = true,
  carte, cible, classeCible, peutEcrire, onRemettreAujourdhui,
}: {
  jour: string
  aujourdhui: string
  /** Courses du jour (déjà filtrées par le bandeau « À traiter »). */
  courses: CoursePlanning[]
  enRetard: CoursePlanning[]
  equipe: ChauffeurPlanning[]
  seuil: number
  afficherTerminees: boolean
  colis: TourneeColisJour[] | null
  echeances: MarqueurEcheance[]
  avecKpis?: boolean
  carte: (c: CoursePlanning, opts?: { avecChauffeur?: boolean; dense?: boolean }) => ReactNode
  cible: (cle: string, c: CibleDeplacement) => { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void }
  classeCible: (cle: string) => string
  peutEcrire: boolean
  onRemettreAujourdhui: (ids: string[]) => void
}) {
  const { courses: visibles, masquees } = useMemo(() => sansTerminees(courses, afficherTerminees), [courses, afficherTerminees])
  const k = useMemo(() => kpisJour(courses, enRetard), [courses, enRetard])
  const lignes = useMemo(() => grouperParChauffeur(visibles, [jour], equipe), [visibles, jour, equipe])
  // Mobile : on ne déroule d'abord que « Non affecté » ; sur PC tout est ouvert.
  const [fermes, setFermes] = useState<Set<string>>(() => estPC()
    ? new Set()
    : new Set(equipe.filter(m => m.role === 'chauffeur').map(m => m.id)))
  const bascule = (cle: string) => setFermes(prev => { const n = new Set(prev); if (n.has(cle)) n.delete(cle); else n.add(cle); return n })

  const idsRetard = enRetard.map(c => c.id)
  const aucune = lignes.every(l => l.total === 0) && !colis?.length

  return (
    <div className="flex flex-col gap-3 min-h-0 lg:flex-1">
      {avecKpis && (
        <div className="flex gap-2 overflow-x-auto shrink-0 -mx-1 px-1 pb-0.5">
          <Tuile n={k.total} libelle="courses" />
          <Tuile n={k.afaire} libelle="à faire" />
          <Tuile n={k.encours} libelle="en cours" />
          <Tuile n={k.livrees} libelle="livrées (à facturer)" />
          <Tuile n={k.terminees} libelle="terminées" />
        </div>
      )}

      {(enRetard.length > 0 || echeances.length > 0 || (colis?.length ?? 0) > 0) && (
        <div className="grid gap-3 shrink-0 lg:grid-cols-3">
          {enRetard.length > 0 && (
            <Bloc titre={`En retard (${enRetard.length})`} icone={<Clock size={13} />} alerte>
              {enRetard.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="text-[var(--danger)] shrink-0 tabular-nums">{c.date.slice(8, 10)}/{c.date.slice(5, 7)}</span>
                  <span className="truncate text-[var(--text)]">{c.clients?.name ?? '—'}</span>
                  <span className="truncate text-[var(--text-muted)] ml-auto">{c.team_members?.full_name ?? 'sans chauffeur'}</span>
                </div>
              ))}
              {enRetard.length > 5 && <span className="text-xs text-[var(--text-muted)]">+ {enRetard.length - 5} autres</span>}
              {peutEcrire && jour === aujourdhui && (
                <Button variant="secondary" size="compact" onClick={() => onRemettreAujourdhui(idsRetard)} className="self-start mt-1">
                  Tout remettre à aujourd'hui
                </Button>
              )}
            </Bloc>
          )}
          {echeances.length > 0 && (
            <Bloc titre={`Échéances (${echeances.length})`} icone={<CalendarClock size={13} />}>
              {echeances.slice(0, 8).map(m => (
                <div key={m.cle} className="flex items-center gap-2 text-xs min-w-0">
                  <span className={`shrink-0 tabular-nums ${m.statut === 'overdue' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>
                    {m.date.slice(8, 10)}/{m.date.slice(5, 7)}
                  </span>
                  <span className="truncate text-[var(--text)]">{m.libelle}</span>
                  <span className="truncate text-[var(--text-muted)] ml-auto">{m.sujet}</span>
                </div>
              ))}
            </Bloc>
          )}
          {(colis?.length ?? 0) > 0 && (
            <Bloc titre="Tournées de colis" icone={<PackageCheck size={13} />}>
              {colis!.map(t => {
                const pct = t.arrets > 0 ? Math.round((t.arretsTraites / t.arrets) * 100) : 0
                return (
                  <div key={t.id} className="flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-medium text-[var(--text)]">{t.nom}</span>
                      <span className="ml-auto shrink-0 text-[var(--text-muted)]">{LIB_TOURNEE[t.statut]}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <span>{t.arretsTraites}/{t.arrets} arrêts · {t.colisLivres} livrés</span>
                      {t.colisRetour > 0 && <span className="text-[var(--danger)]">{t.colisRetour} retours</span>}
                      {t.km != null && <span className="ml-auto inline-flex items-center gap-0.5"><RouteIcon size={10} />{Math.round(t.km)} km</span>}
                    </div>
                  </div>
                )
              })}
            </Bloc>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-1 lg:min-h-0 lg:overflow-auto pb-20 lg:pb-0">
        {aucune ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title="Rien de prévu ce jour"
            description="Aucune course ni tournée pour cette journée."
          />
        ) : lignes.map(l => {
          const cle = l.driverId ?? 'aucun'
          const liste = l.cellules[jour]
          const n = liste.length
          const niveau = l.driverId === null ? null : niveauCharge(n, seuil)
          const ferme = fermes.has(cle)
          const ligneCible = cible(`${cle}|${jour}`, { driverId: l.driverId, date: jour })
          // Le chauffeur sans course n'a pas de ligne vide en trop : « Libre » sur une seule ligne.
          return (
            <div key={cle} {...ligneCible}
              className={`rounded-[var(--r-lg)] border min-w-0 ${l.driverId === null ? 'border-[var(--danger)]/40 bg-[var(--danger)]/5' : 'border-[var(--border)]'} ${classeCible(`${cle}|${jour}`)}`}>
              <button type="button" onClick={() => bascule(cle)} aria-expanded={!ferme} disabled={n === 0}
                className="w-full min-h-11 px-3 flex items-center gap-2 text-left">
                {l.driverId === null
                  ? <UserX size={18} className="text-[var(--danger)] shrink-0" />
                  : <DriverAvatar name={l.nom} size={26} />}
                <span className={`text-sm font-semibold truncate ${l.driverId === null && n > 0 ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>{l.nom}</span>
                <span className="text-xs text-[var(--text-muted)] shrink-0">
                  {n === 0 ? 'libre' : `${n} course${n > 1 ? 's' : ''}`}
                </span>
                {niveau && n > 0 && (
                  <span className="flex-1 min-w-[3rem] max-w-[10rem] ml-1" title={`${n} course${n > 1 ? 's' : ''} pour un seuil de ${seuil}`}>
                    <span className="block h-1.5 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
                      <span className="block h-full" style={{ width: `${Math.min(100, (n / Math.max(1, seuil)) * 100)}%`, background: COULEUR_CHARGE[niveau] }} />
                    </span>
                  </span>
                )}
                {niveau === 'surcharge' && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--danger)]"><AlertTriangle size={12} />surcharge</span>}
                {n > 0 && <ChevronDown size={16} className={`ml-auto shrink-0 text-[var(--text-muted)] transition-transform ${ferme ? '-rotate-90' : ''}`} />}
              </button>
              {n > 0 && !ferme && (
                <div className="px-2 pb-2 flex flex-col gap-1.5 lg:flex-row lg:overflow-x-auto">
                  {liste.map(c => (
                    <div key={c.id} className="lg:w-[15rem] lg:shrink-0 min-w-0">
                      <div className="lg:hidden">{carte(c, { dense: true })}</div>
                      <div className="hidden lg:block">{carte(c)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {masquees > 0 && (
          <p className="text-xs text-[var(--text-muted)] px-1">{masquees} course{masquees > 1 ? 's' : ''} terminée{masquees > 1 ? 's' : ''} masquée{masquees > 1 ? 's' : ''} (roue des réglages).</p>
        )}
      </div>
    </div>
  )
}
