import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, UserX, Truck, MapPinOff, Clock,
  AlertTriangle, Package, Zap, CircleCheck, X, CalendarRange, CalendarClock,
} from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
// Chargé à la demande : c'est le plus gros bloc du site, utile seulement au
// clic sur une course, pas à l'affichage du planning lui-même.
const DrawerLivraison = lazy(() =>
  import('../livraisons/DrawerLivraison').then(m => ({ default: m.DrawerLivraison })))
import {
  getDeliveriesForWeek, getCoursesEnRetard, getEquipePlanning, getVehiculesPlanning, deplacerCourses,
  getSourcesEcheances,
} from './planning.queries'
import { VueMois } from './VueMois'
import { construireEcheances, echeancesParJour, statutLePlusGrave, infoBulleEcheances } from './mois.logic'
import type { MarqueurEcheance } from './mois.logic'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import {
  joursDeLaSemaine, grouperParChauffeur, grouperParJour, compteursATraiter, correspondAuFiltre,
  creneauCarte, estDeplacable, estOuverte, aDeplacer, appliquerDeplacement, alertesDeplacement,
} from './planning.logic'
import type {
  CoursePlanning, ChauffeurPlanning, VehiculePlanning, FiltreATraiter, CibleDeplacement,
} from './planning.types'
import { STATUS_LABELS, STATUS_COLORS, formatCents, trajet } from '../livraisons/livraisons.logic'
import { effectiveHtCts } from '../../shared/lib/money'
import type { ActionKey } from '../../shared/actions/ActionBar'
import { toLocalISO } from '../../shared/lib/dates'

// ── Libellés ─────────────────────────────────────────────────────────────────

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

const dateFr = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/')

/** Couleur d'un statut (mêmes familles que les badges de la liste). */
const COULEUR_STATUT: Record<string, string> = {
  muted: 'var(--text-muted)', info: 'var(--info)', warning: 'var(--warning)',
  success: 'var(--success)', danger: 'var(--danger)', purple: 'var(--accent-violet)',
}

const FILTRES: { cle: FiltreATraiter; libelle: string; icone: ReactNode }[] = [
  { cle: 'sans_chauffeur', libelle: 'sans chauffeur',    icone: <UserX size={14} /> },
  { cle: 'sans_vehicule',  libelle: 'sans véhicule',     icone: <Truck size={14} /> },
  { cle: 'non_localisee',  libelle: 'non localisées',    icone: <MapPinOff size={14} /> },
  { cle: 'retard',         libelle: 'en retard',         icone: <Clock size={14} /> },
  { cle: 'echecs',         libelle: 'échecs à relivrer', icone: <AlertTriangle size={14} /> },
]

type Vue = 'ressource' | 'jour' | 'mois'
const VUES: Vue[] = ['ressource', 'jour', 'mois']
const CLE_VUE = 'planning.vue'
const MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
/** `?vue=mois` (ancien lien Calendrier) l'emporte sur la vue mémorisée. */
function vueInitiale(): Vue {
  const lue = (v: string | null) => (VUES as (string | null)[]).includes(v) ? v as Vue : null
  try {
    return lue(new URLSearchParams(location.search).get('vue')) ?? lue(localStorage.getItem(CLE_VUE)) ?? 'ressource'
  } catch { return 'ressource' }
}

type SourcesEcheances = Awaited<ReturnType<typeof getSourcesEcheances>>

const COULEUR_ECHEANCE: Record<EcheanceStatus, string> = {
  overdue: 'text-[var(--danger)]', soon: 'text-[var(--warning)]', ok: 'text-[var(--info)]', none: 'text-[var(--text-muted)]',
}

/** Pastille « échéances du jour » (CT, assurance, permis…) dans l'en-tête d'un jour. */
function PastilleEcheances({ liste }: { liste: MarqueurEcheance[] }) {
  if (!liste.length) return null
  return (
    <span title={infoBulleEcheances(liste)} style={{ alignSelf: 'center' }} aria-label={`${liste.length} échéance${liste.length > 1 ? 's' : ''}`}
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${COULEUR_ECHEANCE[statutLePlusGrave(liste)]}`}>
      <CalendarClock size={12} />{liste.length > 1 ? liste.length : ''}
    </span>
  )
}

interface Confirmation { ids: string[]; aDetacher: string[]; cible: CibleDeplacement; alertes: string[] }

// ── Carte d'une course ───────────────────────────────────────────────────────

function CarteCourse({
  c, avecChauffeur = false, selectionnee, onSelection, onOuvrir, onDragStart, onDragEnd, dense = false,
}: {
  c: CoursePlanning
  avecChauffeur?: boolean
  selectionnee: boolean
  onSelection: (id: string) => void
  onOuvrir: (c: CoursePlanning) => void
  onDragStart: (e: DragEvent, c: CoursePlanning) => void
  onDragEnd: () => void
  /** Mobile : pas de glisser-déposer, carte en pleine largeur. */
  dense?: boolean
}) {
  const t = trajet(c.pickup_address, c.delivery_address)
  const creneau = creneauCarte(c)
  const deplacable = estDeplacable(c.statut)
  const echec = !!c.probleme_le && estOuverte(c.statut)
  const couleur = COULEUR_STATUT[STATUS_COLORS[c.statut] ?? 'muted']
  const titre = [
    c.clients?.name ?? '—', t.complet, creneau ? `Livraison ${creneau}` : null,
    `HT ${formatCents(effectiveHtCts(c))}`,
    !deplacable ? 'Course figée (facturée, payée ou annulée) : non déplaçable' : null,
  ].filter(Boolean).join('\n')

  return (
    <div
      role="button"
      tabIndex={0}
      title={titre}
      draggable={deplacable && !dense}
      onDragStart={e => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      onClick={() => onOuvrir(c)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(c) } }}
      className={`w-full text-left rounded-[var(--r-sm)] border bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]
        transition-colors cursor-pointer ${dense ? 'px-3 py-2' : 'px-1.5 py-1'}
        ${deplacable && !dense ? 'active:cursor-grabbing' : ''}
        ${selectionnee ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : echec ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}
      style={{ borderLeftWidth: '0.2rem', borderLeftColor: couleur }}
    >
      <div className="flex items-center gap-1 min-w-0">
        {deplacable && (
          <input
            type="checkbox"
            checked={selectionnee}
            onClick={e => e.stopPropagation()}
            onChange={() => onSelection(c.id)}
            aria-label={`Sélectionner la course ${c.clients?.name ?? ''}`}
            className="accent-[var(--brand)] w-3.5 h-3.5 shrink-0 cursor-pointer"
          />
        )}
        <span className="text-xs font-semibold text-[var(--text)] truncate flex-1 min-w-0">
          {c.clients?.name ?? '—'}
        </span>
        {c.urgent && (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--danger)] shrink-0" title="Urgent">
            <Zap size={11} />{dense && 'Urgent'}
          </span>
        )}
        {echec && <AlertTriangle size={11} className="text-[var(--danger)] shrink-0" aria-label="Échec terrain" />}
      </div>
      <div className="text-xs text-[var(--text-muted)] truncate">{t.court}</div>
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] min-w-0">
        {creneau && <span className="inline-flex items-center gap-0.5 shrink-0"><Clock size={10} />{creneau}</span>}
        {c.nb_colis != null && c.nb_colis > 0 && (
          <span className="inline-flex items-center gap-0.5 shrink-0"><Package size={10} />{c.nb_colis}</span>
        )}
        <span className="ml-auto truncate font-medium" style={{ color: couleur }}>{STATUS_LABELS[c.statut] ?? c.statut}</span>
      </div>
      {avecChauffeur && (
        <div className="text-xs text-[var(--text-muted)] truncate">
          {c.team_members?.full_name ?? <span className="text-[var(--warning)]">Sans chauffeur</span>}
        </div>
      )}
    </div>
  )
}

// ── Composant ────────────────────────────────────────────────────────────────

export function Planning() {
  const { toast } = useToast()
  const [anchor, setAnchor]       = useState(new Date())
  const [rows, setRows]           = useState<CoursePlanning[]>([])
  const [enRetard, setEnRetard]   = useState<CoursePlanning[]>([])
  const [equipe, setEquipe]       = useState<ChauffeurPlanning[]>([])
  const [vehicules, setVehicules] = useState<VehiculePlanning[]>([])
  const [loading, setLoading]     = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]   = useState<CoursePlanning | null>(null)
  const [vue, setVue]             = useState<Vue>(vueInitiale)
  const [filtre, setFiltre]       = useState<FiltreATraiter | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [glisse, setGlisse]       = useState<string | null>(null)
  const [survol, setSurvol]       = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [sources, setSources]     = useState<SourcesEcheances | null>(null)

  const weekDays = useMemo(() => joursDeLaSemaine(anchor), [anchor])
  const jours    = useMemo(() => weekDays.map(toLocalISO), [weekDays])
  const dateFrom = jours[0]
  const dateTo   = jours[6]
  const today    = toLocalISO(new Date())

  const enMois = vue === 'mois'

  // Échéances flotte / équipe : lues une fois, affichées sur les en-têtes de jour.
  useEffect(() => { void getSourcesEcheances().then(setSources) }, [])
  const echeancesSemaine = useMemo(
    () => sources ? echeancesParJour(construireEcheances(sources, dateFrom, dateTo)) : new Map<string, MarqueurEcheance[]>(),
    [sources, dateFrom, dateTo])

  const load = useCallback(async () => {
    // Vue Mois : elle lit ses propres données.
    if (enMois) return
    setLoading(true)
    const [semaine, retard, eq, veh] = await Promise.all([
      getDeliveriesForWeek(dateFrom, dateTo),
      getCoursesEnRetard(toLocalISO(new Date())),
      getEquipePlanning(),
      getVehiculesPlanning(),
    ])
    if (semaine.error) toast(`Planning illisible : ${semaine.error.message}`, 'error')
    setRows(semaine.data ?? [])
    setEnRetard(retard.data ?? [])
    setEquipe(eq.data ?? [])
    setVehicules(veh.data ?? [])
    setLoading(false)
  }, [dateFrom, dateTo, toast, enMois])

  useEffect(() => { load() }, [load])

  const changerVue = (v: Vue) => {
    setVue(v)
    try { localStorage.setItem(CLE_VUE, v) } catch { /* stockage indisponible : sans effet */ }
  }

  // Changer de semaine vide la sélection (ses cartes ne sont plus visibles).
  const allerA = (d: Date) => { setAnchor(d); setSelection(new Set()) }
  // Semaine en vues chauffeur / jour ; mois en vue Mois (même date pivot).
  const decaler = (sens: 1 | -1) => {
    const d = new Date(anchor)
    if (enMois) { d.setDate(1); d.setMonth(d.getMonth() + sens) } else d.setDate(d.getDate() + 7 * sens)
    allerA(d)
  }
  const prevWeek  = () => decaler(-1)
  const nextWeek  = () => decaler(1)
  const goToToday = () => allerA(new Date())

  const ouvrir = (c: CoursePlanning | null) => { setSelected(c); setDrawerOpen(true) }
  const handleAction = (key: ActionKey) => { if (key === 'nouveau') ouvrir(null) }

  // ── Données affichées ──
  const compteurs = useMemo(() => compteursATraiter(rows, enRetard, today), [rows, enRetard, today])
  const visibles  = useMemo(
    () => filtre ? rows.filter(c => correspondAuFiltre(c, filtre, today)) : rows,
    [rows, filtre, today])
  const lignes    = useMemo(() => grouperParChauffeur(visibles, jours, equipe), [visibles, jours, equipe])
  const parJour   = useMemo(() => grouperParJour(visibles, jours), [visibles, jours])
  // Retards antérieurs à la semaine : affichés à part, à glisser vers un jour.
  const retardsAvant = useMemo(() => enRetard.filter(c => c.date < dateFrom), [enRetard, dateFrom])
  const total = rows.length
  const rienATraiter = Object.values(compteurs).every(n => n === 0)

  // Personnes affectables : chauffeurs, puis le reste de l'équipe.
  const affectables = useMemo(() => [
    ...equipe.filter(m => m.role === 'chauffeur'),
    ...equipe.filter(m => m.role !== 'chauffeur'),
  ], [equipe])

  // ── Sélection ──
  const basculer = (id: string) => setSelection(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // ── Déplacement (glisser-déposer ou action groupée) ──
  const toutes = useCallback(() => {
    const vus = new Map<string, CoursePlanning>()
    for (const c of [...rows, ...enRetard]) vus.set(c.id, c)
    return [...vus.values()]
  }, [rows, enRetard])

  const executer = async ({ ids, aDetacher, cible }: Confirmation) => {
    const avant = { rows, enRetard }
    const nom = cible.driverId ? equipe.find(m => m.id === cible.driverId)?.full_name ?? null : null
    const maj = appliquerDeplacement(toutes(), ids, cible, nom)
    setRows(maj.filter(c => jours.includes(c.date)))
    setEnRetard(maj.filter(c => c.date < today && estOuverte(c.statut)))
    setSelection(new Set())

    const ecriture: { driver_id?: string | null; date?: string } = {}
    if (cible.driverId !== undefined) ecriture.driver_id = cible.driverId
    if (cible.date !== undefined) ecriture.date = cible.date
    const { error } = await deplacerCourses(ids, ecriture, aDetacher)
    if (error) {
      setRows(avant.rows); setEnRetard(avant.enRetard)
      toast(`Déplacement non enregistré : ${error.message}`, 'error')
      // Une partie a pu être écrite : on relit la base pour afficher le vrai état.
      void load()
      return
    }
    const n = ids.length
    toast(`${n} course${n > 1 ? 's' : ''} déplacée${n > 1 ? 's' : ''}`
      + (aDetacher.length ? ` (${aDetacher.length} retirée${aDetacher.length > 1 ? 's' : ''} de sa tournée)` : ''))
  }

  const demanderDeplacement = (idsDemandes: string[], cible: CibleDeplacement) => {
    const concernees = toutes().filter(c => idsDemandes.includes(c.id))
    const { ids, aDetacher } = aDeplacer(concernees, cible)
    if (ids.length === 0) {
      if (concernees.some(c => !estDeplacable(c.statut))) {
        toast('Course facturée, payée ou annulée : non déplaçable', 'error')
      }
      return
    }
    const bougees = concernees.filter(c => ids.includes(c.id))
    const alertes = alertesDeplacement(bougees, cible, equipe, vehicules)
    const demande = { ids, aDetacher, cible, alertes }
    if (alertes.length) setConfirmation(demande)
    else void executer(demande)
  }

  const debutGlisser = (e: DragEvent, c: CoursePlanning) => {
    if (!estDeplacable(c.statut)) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', c.id)
    setGlisse(c.id)
  }
  const finGlisser = () => { setGlisse(null); setSurvol(null) }

  /** Props d'une cellule cible (chauffeur × jour, ou jour seul). */
  const cible = (cle: string, c: CibleDeplacement) => ({
    onDragOver: (e: DragEvent) => {
      if (!glisse) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (survol !== cle) setSurvol(cle)
    },
    onDragLeave: () => { if (survol === cle) setSurvol(null) },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain') || glisse
      finGlisser()
      if (!id) return
      // Une carte sélectionnée emmène toute la sélection avec elle.
      demanderDeplacement(selection.has(id) ? [...selection] : [id], c)
    },
  })
  const classeCible = (cle: string) => survol === cle ? 'bg-[var(--brand-soft)] outline outline-1 outline-[var(--brand)]' : ''

  const carte = (c: CoursePlanning, opts: { avecChauffeur?: boolean; dense?: boolean } = {}) => (
    <CarteCourse
      key={c.id}
      c={c}
      avecChauffeur={opts.avecChauffeur}
      dense={opts.dense}
      selectionnee={selection.has(c.id)}
      onSelection={basculer}
      onOuvrir={ouvrir}
      onDragStart={debutGlisser}
      onDragEnd={finGlisser}
    />
  )

  const enTeteJour = (day: Date, i: number, nb: number) => {
    const key = jours[i]
    const isToday = key === today
    return (
      <div className={`flex items-baseline justify-center gap-1 px-2 py-1.5 border-b
        ${isToday ? 'bg-[var(--brand-soft)] border-[var(--brand)]' : 'bg-[var(--bg-elevated)] border-[var(--border)]'}`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>
          {FR_DAYS_SHORT[i]}
        </span>
        <span className={`text-sm font-bold ${isToday ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{day.getDate()}</span>
        {nb > 0 && <span className="text-xs text-[var(--text-muted)]">· {nb}</span>}
        <PastilleEcheances liste={echeancesSemaine.get(key) ?? []} />
      </div>
    )
  }

  return (
    <Shell pageTitle="Planning" actions={['nouveau']} onAction={handleAction}>
      {/* PC : occupe exactement la hauteur visible (écran − barre du haut −
          sous-onglets − marges) ; la grille défile à l'intérieur. */}
      <div className="flex flex-col gap-3 min-w-0 lg:h-[calc(100dvh-var(--topbar-h)-6.75rem)]">

        {/* Navigation semaine + bascule de vue */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="compact" onClick={prevWeek} aria-label={enMois ? 'Mois précédent' : 'Semaine précédente'}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-medium text-[var(--text)] min-w-[11rem] text-center select-none">
              {enMois ? `${MOIS_LONG[anchor.getMonth()]} ${anchor.getFullYear()}` : weekLabel(weekDays)}
            </span>
            <Button variant="ghost" size="compact" onClick={nextWeek} aria-label={enMois ? 'Mois suivant' : 'Semaine suivante'}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <Button variant="secondary" size="compact" onClick={goToToday}>Aujourd'hui</Button>
          <div className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden" role="group" aria-label="Affichage">
            {/* Mobile : « Par chauffeur » et « Par jour » donnent la même liste → un seul bouton « Semaine ». */}
            {([
              ['ressource', 'Par chauffeur', Users, 'hidden sm:inline-flex'],
              ['jour', 'Par jour', CalendarDays, 'hidden sm:inline-flex'],
              ['jour', 'Semaine', CalendarDays, 'inline-flex sm:hidden'],
              ['mois', 'Mois', CalendarRange, 'inline-flex'],
            ] as const).map(([v, lib, Icone, affichage]) => {
              const actif = v === 'jour' && affichage.startsWith('inline') ? !enMois : vue === v
              return (
                <button
                  key={lib}
                  type="button"
                  onClick={() => changerVue(v)}
                  aria-pressed={actif}
                  className={`${affichage} items-center gap-1 px-2 h-7 text-xs transition-colors
                    ${actif ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                >
                  <Icone size={13} />{lib}
                </button>
              )
            })}
          </div>
          {!enMois && (
            <span className="ml-auto text-xs text-[var(--text-muted)]">
              {total} course{total !== 1 ? 's' : ''} cette semaine
            </span>
          )}
        </div>

        {enMois && <VueMois annee={anchor.getFullYear()} mois={anchor.getMonth()} />}

        {/* Bandeau « À traiter » */}
        {!loading && !enMois && (
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-xs font-semibold text-[var(--text-muted)] mr-1">À traiter</span>
            {rienATraiter ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
                <CircleCheck size={14} /> Rien à traiter
              </span>
            ) : FILTRES.map(f => {
              const n = compteurs[f.cle]
              const actif = filtre === f.cle
              if (n === 0 && !actif) return null
              return (
                <button
                  key={f.cle}
                  type="button"
                  onClick={() => setFiltre(actif ? null : f.cle)}
                  aria-pressed={actif}
                  title={f.cle === 'retard' ? 'Planifiées avant aujourd\'hui et toujours ouvertes (toutes dates)' : 'Courses ouvertes de la semaine'}
                  className={`inline-flex items-center gap-1 px-2 h-7 rounded-[var(--r-pill)] border text-xs transition-colors
                    ${actif
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      : f.cle === 'echecs' || f.cle === 'retard'
                        ? 'border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--bg-card-hover)]'
                        : 'border-[var(--warning)]/40 text-[var(--warning)] hover:bg-[var(--bg-card-hover)]'}`}
                >
                  {f.icone}<span className="font-semibold">{n}</span> {f.libelle}
                </button>
              )
            })}
            {filtre && (
              <Button variant="ghost" size="compact" onClick={() => setFiltre(null)}>
                <X size={13} /> Tout afficher
              </Button>
            )}
          </div>
        )}

        {/* Courses en retard d'avant la semaine : à glisser vers un jour */}
        {!loading && !enMois && filtre === 'retard' && retardsAvant.length > 0 && (
          <div className="shrink-0 rounded-[var(--r-lg)] border border-[var(--danger)]/40 p-2 flex flex-col gap-1.5 max-h-[30vh] overflow-auto">
            <span className="text-xs text-[var(--text-muted)]">
              En retard avant cette semaine — glisser une carte vers un chauffeur / un jour pour la replanifier
            </span>
            <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {retardsAvant.map(c => (
                <div key={c.id} className="flex flex-col gap-0.5">
                  <span className="text-xs text-[var(--danger)]">{dateFr(c.date)}</span>
                  {carte(c, { avecChauffeur: true })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Barre d'action groupée */}
        {!enMois && selection.size > 0 && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 rounded-[var(--r-lg)] border border-[var(--brand)] bg-[var(--bg-card)]">
            <span className="text-sm font-medium text-[var(--text)]">
              {selection.size} sélectionnée{selection.size > 1 ? 's' : ''}
            </span>
            <label className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              Affecter à
              <select
                value=""
                onChange={e => {
                  const v = e.target.value
                  if (v) demanderDeplacement([...selection], { driverId: v === '-' ? null : v })
                }}
                className="h-7 px-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)]"
              >
                <option value="">chauffeur…</option>
                <option value="-">Non affecté</option>
                {affectables.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              Déplacer au
              <select
                value=""
                onChange={e => { if (e.target.value) demanderDeplacement([...selection], { date: e.target.value }) }}
                className="h-7 px-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)]"
              >
                <option value="">jour…</option>
                {weekDays.map((d, i) => (
                  <option key={jours[i]} value={jours[i]}>{FR_DAYS_LONG[i]} {d.getDate()} {FR_MONTHS[d.getMonth()]}</option>
                ))}
              </select>
            </label>
            <Button variant="ghost" size="compact" className="ml-auto" onClick={() => setSelection(new Set())}>
              <X size={13} /> Désélectionner
            </Button>
          </div>
        )}

        {enMois ? null : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {weekDays.map((_, i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : (
          <>
            {/* PC — vue par chauffeur : lignes = chauffeurs, colonnes = jours */}
            {vue === 'ressource' && (
              <div className="hidden sm:block flex-1 min-h-0 overflow-auto rounded-[var(--r-lg)] border border-[var(--border)]">
                <div className="grid grid-cols-[8.5rem_repeat(7,minmax(8rem,1fr))] min-w-max lg:min-w-0">
                  {/* En-tête */}
                  <div className="sticky top-0 left-0 z-20 bg-[var(--bg-elevated)] border-b border-r border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)]">
                    Chauffeur
                  </div>
                  {weekDays.map((day, i) => (
                    <div key={jours[i]} className="sticky top-0 z-10">
                      {enTeteJour(day, i, parJour[jours[i]]?.length ?? 0)}
                    </div>
                  ))}

                  {/* Lignes */}
                  {lignes.map(l => {
                    const ligneCle = l.driverId ?? 'aucun'
                    return [
                      <div
                        key={`${ligneCle}-nom`}
                        className={`sticky left-0 z-[5] border-b border-r border-[var(--border)] px-2 py-1.5 bg-[var(--bg-elevated)] flex flex-col
                          ${l.driverId === null ? 'text-[var(--warning)]' : 'text-[var(--text)]'}`}
                      >
                        <span className="text-xs font-semibold truncate" title={l.nom}>{l.nom}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {l.total ? `${l.total} course${l.total > 1 ? 's' : ''}` : 'libre'}
                        </span>
                      </div>,
                      ...jours.map(j => {
                        const cle = `${ligneCle}|${j}`
                        const cellule = l.cellules[j]
                        return (
                          <div
                            key={cle}
                            {...cible(cle, { driverId: l.driverId, date: j })}
                            className={`relative border-b border-r border-[var(--border)] p-1 min-h-[4.5rem] flex flex-col gap-1
                              ${j === today ? 'bg-[var(--brand-soft)]/40' : ''} ${classeCible(cle)}`}
                          >
                            {cellule.map(c => carte(c))}
                          </div>
                        )
                      }),
                    ]
                  })}
                </div>
              </div>
            )}

            {/* PC — vue par jour : 7 colonnes */}
            {vue === 'jour' && (
              <div className="hidden sm:grid grid-cols-7 gap-2 flex-1 min-h-0">
                {weekDays.map((day, i) => {
                  const key = jours[i]
                  const courses = parJour[key] ?? []
                  return (
                    <div
                      key={key}
                      {...cible(key, { date: key })}
                      className={`flex flex-col min-h-0 rounded-[var(--r-lg)] border overflow-hidden
                        ${key === today ? 'border-[var(--brand)]' : 'border-[var(--border)]'} ${classeCible(key)}`}
                    >
                      {enTeteJour(day, i, courses.length)}
                      <div className="flex flex-col gap-1 p-1.5 min-h-[7rem] flex-1 overflow-auto">
                        {courses.map(c => carte(c, { avecChauffeur: true }))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Mobile : liste par jour */}
            <div className="sm:hidden flex flex-col gap-3">
              {weekDays.map((day, i) => {
                const key = jours[i]
                const courses = parJour[key] ?? []
                const isToday = key === today
                return (
                  <div key={key} className={`rounded-[var(--r-lg)] border overflow-hidden
                    ${isToday ? 'border-[var(--brand)]' : 'border-[var(--border)]'}`}>
                    <div className={`flex items-center justify-between px-4 py-2 border-b
                      ${isToday ? 'bg-[var(--brand-soft)] border-[var(--brand)]' : 'bg-[var(--bg-elevated)] border-[var(--border)]'}`}
                    >
                      <span className={`font-semibold text-sm ${isToday ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
                        {FR_DAYS_LONG[i]} {day.getDate()} {FR_MONTHS[day.getMonth()]}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <PastilleEcheances liste={echeancesSemaine.get(key) ?? []} />
                        {courses.length > 0 && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {courses.length} course{courses.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                    </div>
                    {courses.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-[var(--text-disabled)]">Aucune course</div>
                    ) : (
                      <div className="flex flex-col gap-1.5 p-2">
                        {courses.map(c => carte(c, { avecChauffeur: true, dense: true }))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {total === 0 && !filtre && (
              <div className="sm:hidden">
                <EmptyState
                  icon={<CalendarDays size={48} />}
                  title="Semaine sans course"
                  description="Aucune course planifiée pour cette semaine."
                  action={{ label: '+ Nouvelle livraison', onClick: () => ouvrir(null) }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmation}
        title="Document échu"
        message={`${confirmation?.alertes.join(' · ') ?? ''}. Affecter quand même ?`}
        confirmLabel="Affecter quand même"
        onConfirm={() => { const c = confirmation; setConfirmation(null); if (c) void executer(c) }}
        onCancel={() => setConfirmation(null)}
      />

      <Suspense fallback={null}>
        <DrawerLivraison
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          delivery={selected}
          onSaved={load}
        />
      </Suspense>
    </Shell>
  )
}
