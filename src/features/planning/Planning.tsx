import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, CalendarClock, Settings2, UserX, Truck,
  MapPinOff, Clock, AlertTriangle, CircleCheck, X, RefreshCw, Rows3,
} from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone, PanneauReglages } from '../../shared/ui/BoutonIcone'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
// Chargé à la demande : c'est le plus gros bloc du site, utile seulement au
// clic sur une course, pas à l'affichage du planning lui-même.
const DrawerLivraison = lazy(() =>
  import('../livraisons/DrawerLivraison').then(m => ({ default: m.DrawerLivraison })))
import {
  getDeliveriesForWeek, getCoursesEnRetard, getEquipePlanning, getVehiculesPlanning, deplacerCourses,
  getSourcesEcheances, getTourneesColisJour,
} from './planning.queries'
import { VueMois } from './VueMois'
import { VueAujourdhui } from './VueAujourdhui'
import { VueSemaine } from './VueSemaine'
import { CarteCourse } from './CarteCourse'
import { MenuCourse } from './MenuCourse'
import { construireEcheances, echeancesParJour, statutLePlusGrave, infoBulleEcheances } from './mois.logic'
import type { MarqueurEcheance } from './mois.logic'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import {
  joursDeLaSemaine, dateLocale, compteursATraiter, correspondAuFiltre, estDeplacable, estOuverte, aDeplacer,
  appliquerDeplacement, alertesDeplacement, decalerAncre, retardsHorsSemaine, familleCourse,
  SEUIL_CHARGE_DEFAUT,
} from './planning.logic'
import type {
  CoursePlanning, ChauffeurPlanning, VehiculePlanning, FiltreATraiter, CibleDeplacement, TourneeColisJour,
} from './planning.types'
import type { ActionKey } from '../../shared/actions/ActionBar'
import { toLocalISO } from '../../shared/lib/dates'

// ── Libellés ─────────────────────────────────────────────────────────────────

const FR_DAYS_LONG  = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FR_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const FR_MONTHS     = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'jun.', 'jul.', 'aoû.', 'sep.', 'oct.', 'nov.', 'déc.']
const MOIS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function libelleSemaine(days: Date[]): string {
  const s = days[0], e = days[6]
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} — ${e.getDate()} ${FR_MONTHS[s.getMonth()]} ${s.getFullYear()}`
    : `${s.getDate()} ${FR_MONTHS[s.getMonth()]} — ${e.getDate()} ${FR_MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

function libelleJour(d: Date): string {
  const i = (d.getDay() + 6) % 7
  return `${FR_DAYS_LONG[i]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

const dateFr = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/')

const FILTRES: { cle: FiltreATraiter; libelle: string; icone: ReactNode }[] = [
  { cle: 'sans_chauffeur', libelle: 'sans chauffeur',    icone: <UserX size={14} /> },
  { cle: 'sans_vehicule',  libelle: 'sans véhicule',     icone: <Truck size={14} /> },
  { cle: 'non_localisee',  libelle: 'non localisées',    icone: <MapPinOff size={14} /> },
  { cle: 'retard',         libelle: 'en retard',         icone: <Clock size={14} /> },
  { cle: 'echecs',         libelle: 'échecs à relivrer', icone: <AlertTriangle size={14} /> },
]

type Vue = 'jour' | 'semaine' | 'mois'
const VUES: Vue[] = ['jour', 'semaine', 'mois']
const CLE_VUE = 'planning.vue2'
const CLE_TERMINEES = 'planning.terminees'
const CLE_SEUIL = 'planning.seuil'

function lire(cle: string): string | null {
  try { return localStorage.getItem(cle) } catch { return null }
}
function ecrire(cle: string, v: string) {
  try { localStorage.setItem(cle, v) } catch { /* stockage indisponible : sans effet */ }
}

/** `?vue=mois` (ancien lien Calendrier) l'emporte sur la vue mémorisée ; ouverture sur « Jour » sinon. */
function vueInitiale(): Vue {
  const lue = (v: string | null) => (VUES as (string | null)[]).includes(v) ? v as Vue : null
  try { return lue(new URLSearchParams(location.search).get('vue')) ?? lue(lire(CLE_VUE)) ?? 'jour' } catch { return 'jour' }
}

type SourcesEcheances = Awaited<ReturnType<typeof getSourcesEcheances>>

const COULEUR_ECHEANCE: Record<EcheanceStatus, string> = {
  overdue: 'text-[var(--danger)]', soon: 'text-[var(--warning)]', ok: 'text-[var(--info)]', none: 'text-[var(--text-muted)]',
}

/** Pastille « échéances du jour » (CT, assurance, permis…) dans l'en-tête d'un jour. */
function PastilleEcheances({ liste }: { liste: MarqueurEcheance[] }) {
  if (!liste.length) return null
  return (
    <span title={infoBulleEcheances(liste)} aria-label={`${liste.length} échéance${liste.length > 1 ? 's' : ''}`}
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${COULEUR_ECHEANCE[statutLePlusGrave(liste)]}`}>
      <CalendarClock size={12} />{liste.length > 1 ? liste.length : ''}
    </span>
  )
}

interface Confirmation { ids: string[]; aDetacher: string[]; cible: CibleDeplacement; alertes: string[] }

// ── Composant ────────────────────────────────────────────────────────────────

export function Planning() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutEcrire = can('planning.planning', 'update')
  const today = toLocalISO(new Date())

  const [jourChoisi, setJourChoisi] = useState(today)
  const [rows, setRows]           = useState<CoursePlanning[]>([])
  const [enRetard, setEnRetard]   = useState<CoursePlanning[]>([])
  const [equipe, setEquipe]       = useState<ChauffeurPlanning[]>([])
  const [vehicules, setVehicules] = useState<VehiculePlanning[]>([])
  const [loading, setLoading]     = useState(true)
  const [erreur, setErreur]       = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]   = useState<CoursePlanning | null>(null)
  const [menu, setMenu]           = useState<CoursePlanning | null>(null)
  const [vue, setVue]             = useState<Vue>(vueInitiale)
  const [filtre, setFiltre]       = useState<FiltreATraiter | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [glisse, setGlisse]       = useState<string | null>(null)
  const [survol, setSurvol]       = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [sources, setSources]     = useState<SourcesEcheances | null>(null)
  const [colis, setColis]         = useState<TourneeColisJour[] | null>(null)
  const [reglages, setReglages]   = useState(false)
  const [afficherTerminees, setAfficherTerminees] = useState(() => lire(CLE_TERMINEES) === '1')
  const [seuil, setSeuil]         = useState(() => {
    const n = Number(lire(CLE_SEUIL)); return Number.isFinite(n) && n >= 1 ? Math.round(n) : SEUIL_CHARGE_DEFAUT
  })

  const ancre    = useMemo(() => dateLocale(jourChoisi), [jourChoisi])
  const weekDays = useMemo(() => joursDeLaSemaine(ancre), [ancre])
  const jours    = useMemo(() => weekDays.map(toLocalISO), [weekDays])
  const dateFrom = jours[0]
  const dateTo   = jours[6]
  const enMois   = vue === 'mois'

  // ── Chargement (une réponse arrivée en retard n'écrase jamais une plus récente) ──
  const demande = useRef(0)
  const load = useCallback(async () => {
    if (enMois) return
    const id = ++demande.current
    setLoading(true)
    const [semaine, retard, eq, veh] = await Promise.all([
      getDeliveriesForWeek(dateFrom, dateTo),
      getCoursesEnRetard(toLocalISO(new Date())),
      getEquipePlanning(),
      getVehiculesPlanning(),
    ])
    if (id !== demande.current) return
    const erreurs = [semaine.error, retard.error, eq.error, veh.error].filter(Boolean).map(e => e!.message)
    setErreur(erreurs.length ? erreurs[0] : null)
    setRows(semaine.error ? [] : semaine.data ?? [])
    if (!retard.error) setEnRetard(retard.data ?? [])
    if (!eq.error) setEquipe(eq.data ?? [])
    if (!veh.error) setVehicules(veh.data ?? [])
    setLoading(false)
  }, [dateFrom, dateTo, enMois])
  useEffect(() => { void load() }, [load])

  // Échéances (véhicules, permis…) : lues une fois, partagées avec la vue Mois.
  useEffect(() => { void getSourcesEcheances().then(setSources) }, [])

  // Tournées de colis du jour affiché (lecture seule ; vide si le droit manque).
  useEffect(() => {
    if (enMois) return
    let annule = false
    void getTourneesColisJour(jourChoisi).then(r => { if (!annule) setColis(r.error ? null : r.data) })
    return () => { annule = true }
  }, [jourChoisi, enMois])

  // Changer de jour, de vue ou de filtre vide la sélection (ses cartes ne sont plus toutes visibles).
  useEffect(() => { setSelection(new Set()) }, [jourChoisi, vue, filtre])

  const echeancesSemaine = useMemo(
    () => sources ? echeancesParJour(construireEcheances(sources, dateFrom, dateTo)) : new Map<string, MarqueurEcheance[]>(),
    [sources, dateFrom, dateTo])
  // Échéances à regarder : déjà dépassées, ou dans les 14 jours.
  const echeancesProches = useMemo(() => {
    if (!sources) return []
    const d = new Date(); d.setDate(d.getDate() + 14)
    const lim = new Date(); lim.setDate(lim.getDate() - 365)
    return construireEcheances(sources, toLocalISO(lim), toLocalISO(d))
      .filter(m => m.statut === 'overdue' || m.statut === 'soon')
  }, [sources])

  const changerVue = (v: Vue) => { setVue(v); ecrire(CLE_VUE, v) }
  const decaler = (sens: 1 | -1) => setJourChoisi(toLocalISO(decalerAncre(ancre, vue, sens)))
  const goToToday = () => setJourChoisi(today)
  const ouvrir = useCallback((c: CoursePlanning | null) => { setSelected(c); setDrawerOpen(true) }, [])
  const handleAction = (key: ActionKey) => { if (key === 'nouveau') ouvrir(null) }

  // ── Données affichées ──
  const rowsVue  = useMemo(() => vue === 'jour' ? rows.filter(c => c.date === jourChoisi) : rows, [rows, vue, jourChoisi])
  const compteurs = useMemo(() => compteursATraiter(rowsVue, enRetard, today), [rowsVue, enRetard, today])
  const visibles = useMemo(
    () => filtre ? rowsVue.filter(c => correspondAuFiltre(c, filtre, today)) : rowsVue,
    [rowsVue, filtre, today])
  const retardsAvant = useMemo(() => retardsHorsSemaine(enRetard, dateFrom, dateTo), [enRetard, dateFrom, dateTo])
  const rienATraiter = Object.values(compteurs).every(n => n === 0)
  const nbTerminees = useMemo(() => rowsVue.filter(c => familleCourse(c.statut) === 'terminee').length, [rowsVue])

  const affectables = useMemo(() => [
    ...equipe.filter(m => m.role === 'chauffeur'),
    ...equipe.filter(m => m.role !== 'chauffeur'),
  ], [equipe])

  // La course ouverte reste à jour quand la liste est relue (un glisser pendant que la fiche est ouverte).
  const selectedVive = useMemo(
    () => selected ? [...rows, ...enRetard].find(c => c.id === selected.id) ?? selected : null,
    [selected, rows, enRetard])

  // ── Sélection ──
  const basculer = useCallback((id: string) => setSelection(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  }), [])

  // ── Déplacement (glisser-déposer, menu ou action groupée) ──
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
    const { error, ecrites } = await deplacerCourses(ids, ecriture, aDetacher)
    if (error) {
      setRows(avant.rows); setEnRetard(avant.enRetard)
      toast(`Déplacement non enregistré : ${error.message}`, 'error')
      void load()
      return
    }
    if (ecrites !== ids.length) {
      // Une course est devenue facturée entre-temps, ou le droit manque : on affiche le vrai état.
      toast(`${ecrites} course${ecrites > 1 ? 's' : ''} déplacée${ecrites > 1 ? 's' : ''} sur ${ids.length} (les autres sont figées ou refusées)`, 'error')
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
      if (concernees.some(c => !estDeplacable(c.statut))) toast('Course facturée, payée ou annulée : non déplaçable', 'error')
      return
    }
    const bougees = concernees.filter(c => ids.includes(c.id))
    const alertes = alertesDeplacement(bougees, cible, equipe, vehicules)
    const demande = { ids, aDetacher, cible, alertes }
    if (alertes.length) setConfirmation(demande)
    else void executer(demande)
  }

  const debutGlisser = useCallback((e: DragEvent, c: CoursePlanning) => {
    if (!estDeplacable(c.statut) || !peutEcrire) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', c.id)
    // Différé : changer le rendu pendant le démarrage du glisser peut l'annuler sous Chrome.
    setTimeout(() => setGlisse(c.id), 0)
  }, [peutEcrire])
  const finGlisser = useCallback(() => { setGlisse(null); setSurvol(null) }, [])

  /** Props d'une cellule cible (chauffeur × jour, ou jour seul). */
  const cible = (cle: string, c: CibleDeplacement) => ({
    onDragOver: (e: DragEvent) => {
      if (!glisse || !peutEcrire) return
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
      peutEcrire={peutEcrire}
      selectionnee={selection.has(c.id)}
      selectionActive={selection.size > 0}
      onSelection={basculer}
      onOuvrir={ouvrir}
      onMenu={setMenu}
      onDragStart={debutGlisser}
      onDragEnd={finGlisser}
    />
  )

  const enTeteJour = (i: number, nb: number) => {
    const key = jours[i]
    const isToday = key === today
    const choisi = key === jourChoisi
    return (
      <div className={`flex items-baseline justify-center gap-1 px-2 py-1.5 border-b
        ${isToday ? 'bg-[var(--brand-soft)] border-[var(--brand)]' : 'bg-[var(--bg-elevated)] border-[var(--border)]'}
        ${choisi && !isToday ? 'ring-1 ring-inset ring-[var(--border-strong)]' : ''}`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>{FR_DAYS_SHORT[i]}</span>
        <span className={`text-sm font-bold ${isToday ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{weekDays[i].getDate()}</span>
        {nb > 0 && <span className="text-xs text-[var(--text-muted)]">· {nb}</span>}
        <PastilleEcheances liste={echeancesSemaine.get(key) ?? []} />
      </div>
    )
  }

  const idsSelection = [...selection]
  const libelleNav = vue === 'mois' ? `${MOIS_LONG[ancre.getMonth()]} ${ancre.getFullYear()}`
    : vue === 'semaine' ? libelleSemaine(weekDays) : libelleJour(ancre)

  return (
    <Shell pageTitle="Planning" actions={peutEcrire ? ['nouveau'] : []} onAction={handleAction}>
      {/* PC : l'écran tient sur la hauteur visible ; seules les listes défilent à l'intérieur. */}
      <div className="flex flex-col gap-3 min-w-0 lg:h-[calc(100dvh-var(--topbar-h)-6.75rem)]">

        {/* Navigation + vues */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <BoutonIcone icone={ChevronLeft} libelle={vue === 'mois' ? 'Mois précédent' : vue === 'semaine' ? 'Semaine précédente' : 'Jour précédent'} onClick={() => decaler(-1)} />
            <span className="text-sm font-semibold text-[var(--text)] min-w-[10.5rem] text-center select-none first-letter:uppercase">{libelleNav}</span>
            <BoutonIcone icone={ChevronRight} libelle={vue === 'mois' ? 'Mois suivant' : vue === 'semaine' ? 'Semaine suivante' : 'Jour suivant'} onClick={() => decaler(1)} />
          </div>
          <Button variant="secondary" size="compact" onClick={goToToday}>Aujourd'hui</Button>
          <div className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden" role="group" aria-label="Affichage">
            {([
              ['jour', 'Jour', Rows3],
              ['semaine', 'Semaine', CalendarDays],
              ['mois', 'Mois', CalendarRange],
            ] as const).map(([v, lib, Icone]) => (
              <button
                key={v}
                type="button"
                onClick={() => changerVue(v)}
                aria-pressed={vue === v}
                className={`inline-flex items-center gap-1 px-3 h-10 sm:h-8 text-sm sm:text-xs transition-colors
                  ${vue === v ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
              >
                <Icone size={14} />{lib}
              </button>
            ))}
          </div>
          {!enMois && (
            <div className="ml-auto flex items-center gap-2">
              {nbTerminees > 0 && !afficherTerminees && (
                <span className="text-xs text-[var(--text-muted)] hidden sm:inline">{nbTerminees} terminée{nbTerminees > 1 ? 's' : ''} masquée{nbTerminees > 1 ? 's' : ''}</span>
              )}
              <BoutonIcone icone={Settings2} libelle="Réglages du planning" actif={reglages} onClick={() => setReglages(o => !o)} />
            </div>
          )}
        </div>

        {reglages && !enMois && (
          <PanneauReglages titre="Réglages du planning">
            <label className="flex items-center gap-2 text-sm text-[var(--text)] min-h-10">
              <input type="checkbox" checked={afficherTerminees} className="accent-[var(--brand)] w-4 h-4"
                onChange={e => { setAfficherTerminees(e.target.checked); ecrire(CLE_TERMINEES, e.target.checked ? '1' : '0') }} />
              Afficher les courses terminées (facturées, payées)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text)] min-h-10">
              Surcharge à partir de
              <input type="number" min={1} max={50} value={seuil}
                onChange={e => { const n = Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1))); setSeuil(n); ecrire(CLE_SEUIL, String(n)) }}
                className="w-16 h-9 px-2 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] text-center" />
              courses par chauffeur et par jour
            </label>
          </PanneauReglages>
        )}

        {(erreur ?? (sources?.incomplet ? 'Échéances (véhicules, permis) incomplètes : une lecture a échoué.' : null)) && !enMois && (
          <div role="alert" className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-sm text-[var(--danger)]">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1 min-w-0">{erreur ?? 'Échéances (véhicules, permis) incomplètes : une lecture a échoué.'}</span>
            <Button variant="secondary" size="compact" onClick={() => void load()}><RefreshCw size={13} /> Réessayer</Button>
          </div>
        )}

        {enMois && <VueMois annee={ancre.getFullYear()} mois={ancre.getMonth()} sources={sources} />}

        {/* Bandeau « À traiter » : filtres des courses affichées */}
        {!loading && !enMois && (
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-xs font-semibold text-[var(--text-muted)] mr-1">À traiter</span>
            {rienATraiter ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]"><CircleCheck size={14} /> Tout est affecté</span>
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
                  title={f.cle === 'retard' ? 'Planifiées avant aujourd\'hui et toujours ouvertes (120 derniers jours)' : vue === 'jour' ? 'Courses ouvertes du jour' : 'Courses ouvertes de la semaine'}
                  className={`inline-flex items-center gap-1 px-2.5 h-9 sm:h-7 rounded-[var(--r-pill)] border text-xs transition-colors
                    ${actif
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      : f.cle === 'echecs' || f.cle === 'retard' || f.cle === 'sans_chauffeur'
                        ? 'border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--bg-card-hover)]'
                        : 'border-[var(--warning)]/40 text-[var(--warning)] hover:bg-[var(--bg-card-hover)]'}`}
                >
                  {f.icone}<span className="font-semibold">{n}</span> {f.libelle}
                </button>
              )
            })}
            {filtre && (
              <Button variant="ghost" size="compact" onClick={() => setFiltre(null)}><X size={13} /> Tout afficher</Button>
            )}
          </div>
        )}

        {/* Retards hors de la période affichée : à replanifier */}
        {!loading && !enMois && filtre === 'retard' && retardsAvant.length > 0 && (
          <div className="shrink-0 rounded-[var(--r-lg)] border border-[var(--danger)]/40 p-2 flex flex-col gap-1.5 max-h-[30vh] overflow-auto">
            <span className="text-xs text-[var(--text-muted)]">En retard hors de cette période : « Actions » sur une carte pour la replanifier</span>
            <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
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
        {!enMois && idsSelection.length > 0 && peutEcrire && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 rounded-[var(--r-lg)] border border-[var(--brand)] bg-[var(--bg-card)]">
            <span className="text-sm font-medium text-[var(--text)]">{idsSelection.length} sélectionnée{idsSelection.length > 1 ? 's' : ''}</span>
            <label className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              Affecter à
              <select
                value=""
                onChange={e => { const v = e.target.value; if (v) demanderDeplacement(idsSelection, { driverId: v === '-' ? null : v }) }}
                className="h-10 sm:h-8 px-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)]"
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
                onChange={e => { if (e.target.value) demanderDeplacement(idsSelection, { date: e.target.value }) }}
                className="h-10 sm:h-8 px-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)]"
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
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 flex-1" />)}</div>
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : (
          <>
            {vue === 'jour' && (
              <VueAujourdhui
                jour={jourChoisi} aujourdhui={today} courses={visibles} enRetard={enRetard} equipe={equipe}
                seuil={seuil} afficherTerminees={afficherTerminees} colis={colis} echeances={echeancesProches}
                carte={carte} cible={cible} classeCible={classeCible} peutEcrire={peutEcrire}
                onRemettreAujourdhui={ids => demanderDeplacement(ids, { date: today })}
              />
            )}

            {vue === 'semaine' && (
              <>
                {/* PC / tablette : grille chauffeurs × jours */}
                <VueSemaine
                  jours={jours} aujourdhui={today} courses={visibles} equipe={equipe} seuil={seuil}
                  afficherTerminees={afficherTerminees} peutEcrire={peutEcrire} enTeteJour={enTeteJour}
                  cible={cible} classeCible={classeCible} onOuvrir={ouvrir}
                  onOuvrirJour={j => { setJourChoisi(j); changerVue('jour') }}
                  onDragStart={debutGlisser} onDragEnd={finGlisser}
                />
                {/* Mobile : bande des 7 jours puis la liste du jour touché */}
                <div className="sm:hidden flex flex-col gap-3">
                  <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Jours de la semaine">
                    {weekDays.map((d, i) => {
                      const key = jours[i]
                      const duJour = visibles.filter(c => c.date === key)
                      const sansChauffeur = duJour.some(c => !c.driver_id && estOuverte(c.statut))
                      const actif = key === jourChoisi
                      return (
                        <button key={key} type="button" role="tab" aria-selected={actif} onClick={() => setJourChoisi(key)}
                          className={`min-h-14 rounded-[var(--r-md)] border flex flex-col items-center justify-center gap-0.5
                            ${actif ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]' : key === today ? 'border-[var(--brand)]/50 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                          <span className="text-[0.65rem] uppercase text-[var(--text-muted)]">{FR_DAYS_SHORT[i]}</span>
                          <span className="text-sm font-bold leading-none">{d.getDate()}</span>
                          <span className={`text-[0.65rem] leading-none ${sansChauffeur ? 'text-[var(--danger)] font-bold' : 'text-[var(--text-muted)]'}`}>{duJour.length || '·'}</span>
                        </button>
                      )
                    })}
                  </div>
                  <VueAujourdhui
                    jour={jourChoisi} aujourdhui={today} courses={visibles.filter(c => c.date === jourChoisi)} enRetard={[]} equipe={equipe}
                    seuil={seuil} afficherTerminees={afficherTerminees} colis={colis} echeances={[]} avecKpis={false}
                    carte={carte} cible={cible} classeCible={classeCible} peutEcrire={peutEcrire}
                    onRemettreAujourdhui={() => undefined}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {menu && (
        <MenuCourse
          course={menu}
          affectables={affectables}
          onFermer={() => setMenu(null)}
          onOuvrir={() => { const c = menu; setMenu(null); ouvrir(c) }}
          onAffecter={driverId => { const c = menu; setMenu(null); demanderDeplacement([c.id], { driverId }) }}
          onJour={date => { const c = menu; setMenu(null); demanderDeplacement([c.id], { date }) }}
        />
      )}

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
          delivery={selectedVive}
          onSaved={load}
        />
      </Suspense>
    </Shell>
  )
}
