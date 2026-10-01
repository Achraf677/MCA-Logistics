import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import type { MouseEvent } from 'react'
import {
  ChevronLeft, ChevronRight, Calendar, CalendarClock, UserX, Zap, Plus, Wrench, IdCard,
} from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Drawer } from '../../shared/ui/Drawer'
// Chargé à la demande : c'est le plus gros bloc du site, utile seulement au
// clic sur une course ou un jour, pas à l'affichage du calendrier lui-même.
const DrawerLivraison = lazy(() =>
  import('../livraisons/DrawerLivraison').then(m => ({ default: m.DrawerLivraison })))
import { getDeliveries } from '../livraisons/livraisons.queries'
import type { DeliveryRow } from '../livraisons/livraisons.types'
import type { ActionKey } from '../../shared/actions/ActionBar'
import { toLocalISO } from '../../shared/lib/dates'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import { getSourcesEcheances } from './calendrier.queries'
import {
  grilleDuMois, coursesParJour, estSurLaRoute, tronquer, construireEcheances, echeancesParJour,
  statutLePlusGrave, infoBulleEcheances, montreCourses, montreEcheances, joursAvecContenu,
} from './calendrier.logic'
import type {
  CourseCase, CoursesDuJour, FiltreCalendrier, MarqueurEcheance,
  VehiculeEcheanceSource, EntretienEcheanceSource, MembreEcheanceSource,
} from './calendrier.logic'

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const FILTRES: { cle: FiltreCalendrier; libelle: string }[] = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'courses', libelle: 'Courses' },
  { cle: 'echeances', libelle: 'Échéances' },
]
/** Lignes visibles dans une case PC avant « +N ». */
const MAX_PAR_CASE = 3

const COULEUR_STATUT: Record<EcheanceStatus, string> = {
  overdue: 'text-[var(--danger)]',
  soon: 'text-[var(--warning)]',
  ok: 'text-[var(--info)]',
  none: 'text-[var(--text-muted)]',
}

interface SourcesEcheances {
  vehicules: VehiculeEcheanceSource[]
  entretiens: EntretienEcheanceSource[]
  membres: MembreEcheanceSource[]
}
const SOURCES_VIDES: SourcesEcheances = { vehicules: [], entretiens: [], membres: [] }

/** « mardi 14 octobre » depuis AAAA-MM-JJ (date locale). */
function jourLong(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function Calendrier() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [rows, setRows]   = useState<DeliveryRow[]>([])
  const [sources, setSources] = useState<SourcesEcheances>(SOURCES_VIDES)
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState<FiltreCalendrier>('tout')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [dateNouvelle, setDateNouvelle] = useState<string | undefined>(undefined)
  const [jourOuvert, setJourOuvert] = useState<string | null>(null)

  const monthStart = toLocalISO(new Date(year, month, 1))
  const monthEnd   = toLocalISO(new Date(year, month + 1, 0))

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, ech] = await Promise.all([
      getDeliveries({ date_from: monthStart, date_to: monthEnd }),
      getSourcesEcheances(),
    ])
    // Relevés de messagerie et forfaits : pas des courses à placer dans le calendrier.
    setRows(((data as unknown as DeliveryRow[]) ?? []).filter(estSurLaRoute))
    setSources(ech)
    setLoading(false)
  }, [monthStart, monthEnd])

  useEffect(() => { load() }, [load])

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  const goToToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  const parId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])
  const courses = useMemo(() => coursesParJour(rows), [rows])
  const marqueurs = useMemo(
    () => construireEcheances(sources, monthStart, monthEnd),
    [sources, monthStart, monthEnd])
  const echeances = useMemo(() => echeancesParJour(marqueurs), [marqueurs])

  const totaux = useMemo(() => {
    let nb = 0, sansChauffeur = 0, urgentes = 0
    for (const j of courses.values()) { nb += j.nb; sansChauffeur += j.nbSansChauffeur; urgentes += j.nbUrgentes }
    return { nb, sansChauffeur, urgentes, echeances: marqueurs.length, depassees: marqueurs.filter(m => m.statut === 'overdue').length }
  }, [courses, marqueurs])

  const voirCourses = montreCourses(filtre)
  const voirEcheances = montreEcheances(filtre)

  const ouvrirCourse = (id: string) => {
    const r = parId.get(id)
    if (!r) return
    setJourOuvert(null)
    setDateNouvelle(undefined)
    setSelected(r)
    setDrawerOpen(true)
  }
  const nouvelleLe = (date?: string) => {
    setJourOuvert(null)
    setSelected(null)
    setDateNouvelle(date)
    setDrawerOpen(true)
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') nouvelleLe(undefined)
  }

  const grid = grilleDuMois(year, month)
  const today = toLocalISO(new Date())
  const joursMobile = joursAvecContenu(year, month, courses, echeances, filtre)
  const rien = voirCourses && voirEcheances
    ? rows.length === 0 && marqueurs.length === 0
    : voirCourses ? rows.length === 0 : marqueurs.length === 0

  /** Clic sur une case : jour vide → nouvelle course à cette date ; sinon le détail du jour. */
  const clicCase = (cle: string, aContenu: boolean) => {
    if (aContenu) setJourOuvert(cle)
    else nouvelleLe(cle)
  }

  return (
    <Shell pageTitle="Calendrier" actions={['nouveau']} onAction={handleAction}>
      <div className="flex flex-col gap-3 md:h-[calc(100dvh-var(--topbar-h)-8.5rem)] md:min-h-[30rem]">
        {/* Navigation + filtres */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="compact" onClick={prevMonth} aria-label="Mois précédent"><ChevronLeft size={16} /></Button>
            <span className="text-sm font-semibold text-[var(--text)] min-w-[9rem] text-center select-none">
              {MOIS[month]} {year}
            </span>
            <Button variant="ghost" size="compact" onClick={nextMonth} aria-label="Mois suivant"><ChevronRight size={16} /></Button>
          </div>
          <Button variant="secondary" size="compact" onClick={goToToday}>Aujourd'hui</Button>

          <div className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden shrink-0" role="group" aria-label="Afficher">
            {FILTRES.map(f => {
              const actif = filtre === f.cle
              return (
                <button key={f.cle} type="button" onClick={() => setFiltre(f.cle)} aria-pressed={actif}
                  className={`h-8 px-2.5 text-xs font-medium border-l first:border-l-0 border-[var(--border)] transition-colors ${
                    actif ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}>
                  {f.libelle}
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            {voirCourses && (
              <span>{totaux.nb} course{totaux.nb !== 1 ? 's' : ''}</span>
            )}
            {voirCourses && totaux.sansChauffeur > 0 && (
              <span className="inline-flex items-center gap-1 text-[var(--warning)]" title="Courses à faire sans chauffeur affecté">
                <UserX size={13} /> {totaux.sansChauffeur} sans chauffeur
              </span>
            )}
            {voirCourses && totaux.urgentes > 0 && (
              <span className="inline-flex items-center gap-1 text-[var(--danger)]">
                <Zap size={13} /> {totaux.urgentes} urgente{totaux.urgentes > 1 ? 's' : ''}
              </span>
            )}
            {voirEcheances && (
              <span className={`inline-flex items-center gap-1 ${totaux.depassees ? 'text-[var(--danger)]' : ''}`}>
                <CalendarClock size={13} /> {totaux.echeances} échéance{totaux.echeances !== 1 ? 's' : ''}
                {totaux.depassees > 0 && ` (${totaux.depassees} dépassée${totaux.depassees > 1 ? 's' : ''})`}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-96 md:flex-1" />
        ) : (
          <>
            {/* ── PC / tablette : grille du mois en hauteur d'écran ── */}
            <div className="hidden md:flex flex-col flex-1 min-h-0 glass rounded-[var(--r-xl)] overflow-hidden">
              <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
                {JOURS.map(d => (
                  <div key={d} className="px-2 py-1.5 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto grid"
                style={{ gridTemplateRows: `repeat(${grid.length}, minmax(5.5rem, 1fr))` }}>
                {grid.map((week, wi) => (
                  <div key={wi} className={`grid grid-cols-7 min-h-0 ${wi > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                    {week.map((day, di) => {
                      if (!day) return (
                        <div key={di} className="bg-[var(--bg-elevated)]/50 border-r border-[var(--border)] last:border-r-0" />
                      )
                      const cle = toLocalISO(day)
                      const jour = voirCourses ? courses.get(cle) : undefined
                      const ech = voirEcheances ? (echeances.get(cle) ?? []) : []
                      const aContenu = (jour?.courses.length ?? 0) > 0 || ech.length > 0
                      return (
                        <CaseJour key={di}
                          cle={cle} numero={day.getDate()}
                          aujourdhui={cle === today} weekend={di >= 5}
                          jour={jour} echeances={ech} filtre={filtre}
                          onCase={() => clicCase(cle, aContenu)}
                          onNouvelle={() => nouvelleLe(cle)}
                          onCourse={ouvrirCourse}
                          onDetail={() => setJourOuvert(cle)} />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Mobile : liste des jours qui ont quelque chose ── */}
            <div className="md:hidden flex flex-col gap-2">
              {joursMobile.map(cle => (
                <JourMobile key={cle} cle={cle} aujourdhui={cle === today}
                  jour={voirCourses ? courses.get(cle) : undefined}
                  echeances={voirEcheances ? (echeances.get(cle) ?? []) : []}
                  onCourse={ouvrirCourse} onNouvelle={() => nouvelleLe(cle)} />
              ))}
            </div>

            {rien && (
              <div className="md:hidden">
                <EmptyState
                  icon={<Calendar size={48} />}
                  title={filtre === 'echeances' ? 'Aucune échéance ce mois' : 'Aucune livraison ce mois'}
                  description={filtre === 'echeances'
                    ? 'Aucune échéance véhicule ou équipe ce mois-ci.'
                    : 'Aucune livraison n\'est enregistrée pour ce mois.'}
                  action={{ label: '+ Nouvelle livraison', onClick: () => nouvelleLe(undefined) }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Détail d'un jour (+N, marqueur d'échéance, case pleine) */}
      <Drawer open={!!jourOuvert} onClose={() => setJourOuvert(null)}
        title={jourOuvert ? jourLong(jourOuvert) : ''}>
        {jourOuvert && (
          <DetailJour
            jour={voirCourses ? courses.get(jourOuvert) : undefined}
            echeances={voirEcheances ? (echeances.get(jourOuvert) ?? []) : []}
            onCourse={ouvrirCourse}
            onNouvelle={() => nouvelleLe(jourOuvert)} />
        )}
      </Drawer>

      <Suspense fallback={null}>
        <DrawerLivraison
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          delivery={selected}
          dateInitiale={dateNouvelle}
          onSaved={load}
        />
      </Suspense>
    </Shell>
  )
}

// ─── Case du jour (PC) ──────────────────────────────────────────────────────

function CaseJour({ cle, numero, aujourdhui, weekend, jour, echeances, filtre, onCase, onNouvelle, onCourse, onDetail }: {
  cle: string
  numero: number
  aujourdhui: boolean
  weekend: boolean
  jour: CoursesDuJour | undefined
  echeances: MarqueurEcheance[]
  filtre: FiltreCalendrier
  onCase: () => void
  onNouvelle: () => void
  onCourse: (id: string) => void
  onDetail: () => void
}) {
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn() }
  const { visibles, reste } = tronquer(jour?.courses ?? [], MAX_PAR_CASE)
  const echTronquees = tronquer(echeances, MAX_PAR_CASE)
  const gravite = statutLePlusGrave(echeances)
  return (
    <div role="button" tabIndex={0} onClick={onCase}
      onKeyDown={e => { if (e.key === 'Enter') onCase() }}
      aria-label={`${jourLong(cle)}${jour?.nb ? ` — ${jour.nb} course${jour.nb > 1 ? 's' : ''}` : ''}`}
      className={`group relative min-h-0 border-r border-[var(--border)] last:border-r-0 flex flex-col cursor-pointer
        hover:bg-[var(--brand)]/5 transition-colors
        ${weekend ? 'bg-[var(--bg-elevated)]/30' : ''}
        ${aujourdhui ? 'ring-inset ring-2 ring-[var(--brand)]' : ''}`}>
      {/* En-tête : pastilles à gauche, numéro à droite */}
      <div className="flex items-center gap-1 px-1.5 pt-1 pb-0.5 shrink-0">
        {jour && jour.nb > 0 && (
          <span className="min-w-[1.15rem] h-[1.15rem] px-1 inline-flex items-center justify-center rounded-full bg-[var(--brand)]/15 text-[var(--brand)] text-[0.68rem] font-semibold"
            title={`${jour.nb} course${jour.nb > 1 ? 's' : ''}`}>
            {jour.nb}
          </span>
        )}
        {jour && jour.nbSansChauffeur > 0 && (
          <span className="inline-flex items-center text-[var(--warning)]" title={`${jour.nbSansChauffeur} sans chauffeur`}>
            <UserX size={12} />
          </span>
        )}
        {jour && jour.nbUrgentes > 0 && (
          <span className="inline-flex items-center text-[var(--danger)]" title={`${jour.nbUrgentes} urgente${jour.nbUrgentes > 1 ? 's' : ''}`}>
            <Zap size={12} />
          </span>
        )}
        {filtre === 'tout' && echeances.length > 0 && (
          <button type="button" onClick={stop(onDetail)} title={infoBulleEcheances(echeances)}
            aria-label={`${echeances.length} échéance${echeances.length > 1 ? 's' : ''}`}
            className={`inline-flex items-center gap-0.5 text-[0.68rem] font-semibold ${COULEUR_STATUT[gravite]} hover:opacity-80`}>
            <CalendarClock size={12} />{echeances.length > 1 ? echeances.length : ''}
          </button>
        )}
        <button type="button" onClick={stop(onNouvelle)} title="Nouvelle livraison ce jour" aria-label="Nouvelle livraison ce jour"
          className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--text-muted)] hover:text-[var(--brand)] transition-opacity">
          <Plus size={13} />
        </button>
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium leading-none
          ${aujourdhui ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)]'}`}>
          {numero}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-1 pb-1 flex-1 min-h-0 overflow-hidden">
        {filtre !== 'echeances' && visibles.map(c => (
          <button key={c.id} type="button" onClick={stop(() => onCourse(c.id))} title={libelleCourse(c)}
            className={`w-full text-left px-1.5 py-px rounded-[var(--r-sm)] border-l-2 transition-colors truncate text-[0.68rem] leading-snug
              ${c.urgent ? 'border-[var(--danger)]' : c.sansChauffeur ? 'border-[var(--warning)]' : 'border-transparent'}
              ${c.annulee ? 'line-through text-[var(--text-muted)] bg-transparent' : 'bg-[var(--brand)]/10 hover:bg-[var(--brand)]/20 text-[var(--text)]'}`}>
            <span className="font-medium">{c.client}</span>
            {c.ville && <span className="text-[var(--text-muted)]"> · {c.ville}</span>}
          </button>
        ))}
        {filtre === 'echeances' && echTronquees.visibles.map(m => (
          <button key={m.cle} type="button" onClick={stop(onDetail)} title={`${m.libelle} — ${m.sujet}`}
            className="w-full text-left px-1.5 py-px rounded-[var(--r-sm)] hover:bg-[var(--bg-elevated)] truncate text-[0.68rem] leading-snug">
            <span className={`font-medium ${COULEUR_STATUT[m.statut]}`}>{m.libelle}</span>
            <span className="text-[var(--text-muted)]"> · {m.sujet}</span>
          </button>
        ))}
        {(filtre === 'echeances' ? echTronquees.reste : reste) > 0 && (
          <button type="button" onClick={stop(onDetail)}
            className="text-left text-[0.68rem] text-[var(--text-muted)] hover:text-[var(--text)] px-1.5">
            +{filtre === 'echeances' ? echTronquees.reste : reste}
          </button>
        )}
      </div>
    </div>
  )
}

function libelleCourse(c: CourseCase): string {
  const etats = [
    c.urgent ? 'urgente' : '',
    c.sansChauffeur ? 'sans chauffeur' : '',
    c.annulee ? 'annulée' : '',
  ].filter(Boolean)
  return `${c.client}${c.ville ? ` · ${c.ville}` : ''}${etats.length ? ` (${etats.join(', ')})` : ''}`
}

// ─── Lignes communes (détail du jour, mobile) ───────────────────────────────

function LigneCourse({ c, onClick }: { c: CourseCase; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-[var(--r-md)] border-l-2 bg-[var(--bg-elevated)] hover:bg-[var(--brand)]/10 transition-colors
        ${c.urgent ? 'border-[var(--danger)]' : c.sansChauffeur ? 'border-[var(--warning)]' : 'border-transparent'}`}>
      <span className={`flex-1 min-w-0 truncate text-sm ${c.annulee ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>
        <span className="font-medium">{c.client}</span>
        {c.ville && <span className="text-[var(--text-muted)]"> · {c.ville}</span>}
      </span>
      {c.urgent && <span className="inline-flex items-center gap-0.5 text-xs text-[var(--danger)] shrink-0"><Zap size={12} /> Urgent</span>}
      {c.sansChauffeur && <span className="inline-flex items-center gap-0.5 text-xs text-[var(--warning)] shrink-0"><UserX size={12} /> Sans chauffeur</span>}
    </button>
  )
}

const LIBELLE_STATUT: Record<EcheanceStatus, string> = {
  overdue: 'Dépassée', soon: 'Bientôt', ok: 'À venir', none: '',
}

function LigneEcheance({ m }: { m: MarqueurEcheance }) {
  const Icone = m.domaine === 'vehicule' ? Wrench : IdCard
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--r-md)] bg-[var(--bg-elevated)]">
      <Icone size={14} className={`shrink-0 ${COULEUR_STATUT[m.statut]}`} />
      <span className="flex-1 min-w-0 truncate text-sm text-[var(--text)]">
        <span className="font-medium">{m.libelle}</span>
        <span className="text-[var(--text-muted)]"> · {m.sujet}</span>
      </span>
      <span className={`text-xs shrink-0 ${COULEUR_STATUT[m.statut]}`}>{LIBELLE_STATUT[m.statut]}</span>
    </div>
  )
}

// ─── Détail d'un jour (tiroir) ──────────────────────────────────────────────

function DetailJour({ jour, echeances, onCourse, onNouvelle }: {
  jour: CoursesDuJour | undefined
  echeances: MarqueurEcheance[]
  onCourse: (id: string) => void
  onNouvelle: () => void
}) {
  const liste = jour?.courses ?? []
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" size="compact" onClick={onNouvelle}>
        <Plus size={14} /> Nouvelle livraison ce jour
      </Button>
      {liste.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Courses ({jour?.nb ?? 0})
            {jour && jour.nbSansChauffeur > 0 && <span className="text-[var(--warning)] normal-case font-medium"> · {jour.nbSansChauffeur} sans chauffeur</span>}
          </h3>
          {liste.map(c => <LigneCourse key={c.id} c={c} onClick={() => onCourse(c.id)} />)}
        </section>
      )}
      {echeances.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Échéances ({echeances.length})</h3>
          {echeances.map(m => <LigneEcheance key={m.cle} m={m} />)}
        </section>
      )}
      {liste.length === 0 && echeances.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">Rien ce jour.</p>
      )}
    </div>
  )
}

// ─── Jour (mobile) ──────────────────────────────────────────────────────────

function JourMobile({ cle, aujourdhui, jour, echeances, onCourse, onNouvelle }: {
  cle: string
  aujourdhui: boolean
  jour: CoursesDuJour | undefined
  echeances: MarqueurEcheance[]
  onCourse: (id: string) => void
  onNouvelle: () => void
}) {
  return (
    <section className={`glass rounded-[var(--r-xl)] p-2.5 flex flex-col gap-1.5 ${aujourdhui ? 'ring-2 ring-[var(--brand)]' : ''}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)] capitalize">{jourLong(cle)}</h3>
        {jour && jour.nb > 0 && <span className="text-xs text-[var(--text-muted)]">{jour.nb} course{jour.nb > 1 ? 's' : ''}</span>}
        <button type="button" onClick={onNouvelle} aria-label="Nouvelle livraison ce jour" title="Nouvelle livraison ce jour"
          className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:text-[var(--brand)]">
          <Plus size={16} />
        </button>
      </div>
      {(jour?.courses ?? []).map(c => <LigneCourse key={c.id} c={c} onClick={() => onCourse(c.id)} />)}
      {echeances.map(m => <LigneEcheance key={m.cle} m={m} />)}
    </section>
  )
}
