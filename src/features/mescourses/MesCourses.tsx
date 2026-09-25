import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Navigation2, Phone, PackageOpen, Package, Camera, ShieldCheck, Paperclip, FileText, Image as ImageIcon, Flag, ArrowUp, ArrowDown, ChevronDown, Route, Clock, ExternalLink, Truck, MessageSquare } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { InstallAppButton } from '../../shared/ui/InstallAppButton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { deposerTicket } from '../../shared/lib/receiptsInbox.queries'
import { getDownloadUrl } from '../../shared/lib/documents.queries'
import { enregistrerPod } from '../../shared/lib/pod.queries'
import { canTransition } from '../../shared/lib/livraisonStatuts'
import {
  getMesCourses, avancerCourse, getDocumentsDesCourses, marquerCharge,
  enregistrerOrdreArretsJour, getTourneesDuChauffeur, changerStatutTournee, getDepot,
} from './mescourses.queries'
// Memes regles que les tournees : ecrites une fois, testees une fois.
import { planDeChargement } from '../../shared/lib/ordreArrets'
import { poidsTotal, libellePoids } from '../../shared/lib/poids'
import {
  arretsDuJour, deplacerArretJour, positionsAEcrire, type ArretJour,
} from '../../shared/lib/arretsJour'
import { canStartTour, canFinishTour } from '../../shared/lib/tourneeStatuts'
import {
  googleMapsRouteUrl, lienNavigation, APPS_NAVIGATION, type AppNavigation,
} from '../../shared/lib/navigation'
import { lireAppNavigation, ecrireAppNavigation } from '../../shared/lib/prefChauffeur'
import { MESSAGES_TYPES, lienSms, lienTel } from '../../shared/lib/messageClient'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { etapeCourante, libelleEtat } from './etapes.logic'
import { EtapeTerrain } from './EtapeTerrain'
import {
  bornesPeriode, decalerPeriode, libellePeriode,
  grouperParJour, resteAFaire,
  type ModePeriode,
} from './mescourses.logic'
import type { CourseChauffeur, DocumentCourse, TourneeChauffeur } from './mescourses.types'

const MODES: Array<{ key: ModePeriode; label: string }> = [
  { key: 'jour',    label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois',    label: 'Mois' },
]

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/**
 * Écran chauffeur — « Mes courses ».
 *
 * Volontairement pauvre : une période, une liste d'arrêts, deux gestes par
 * arrêt (naviguer, marquer livré). Aucun montant n'est chargé (voir
 * mescourses.types.ts). Le filtrage par chauffeur est assuré par la policy RLS
 * `deliveries_select_own`, pas par cet écran.
 *
 * Pensé pour un téléphone tenu d'une main : cibles tactiles hautes, une colonne.
 */
export function MesCourses() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  // `tours_update_perm` exige président ou `planning.tournees:update`. On lit
  // ici la MÊME condition que la base : proposer un bouton que la RLS
  // refusera ensuite serait pire que ne pas l'afficher.
  const { can } = usePermissions()
  const peutPiloterTournee = can('planning.tournees', 'update')
  const [mode, setMode]     = useState<ModePeriode>('jour')
  const [ancre, setAncre]   = useState(aujourdhui)
  const [courses, setCourses] = useState<CourseChauffeur[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur]   = useState<string | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)
  // Documents regroupés par course. Chargés à part des courses : ils ne
  // conditionnent pas l'affichage de la liste, qui doit s'afficher tout de
  // suite même si le réseau traîne sur les pièces jointes.
  const [documents, setDocuments] = useState<Map<string, DocumentCourse[]>>(new Map())
  // Tournées de la période, indexées par date. La RLS `tours_select_own` ne
  // rend à un chauffeur que les siennes.
  const [tournees, setTournees] = useState<TourneeChauffeur[]>([])
  const [depot, setDepot] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  /**
   * Application de navigation, lue une fois au montage depuis le telephone.
   *
   * `useState(initialiseur)` et pas un effet : la valeur est disponible des le
   * premier rendu, donc les liens ne changent jamais sous le doigt du
   * chauffeur juste apres l'affichage.
   */
  const [appNav, setAppNav] = useState<AppNavigation>(lireAppNavigation)

  const changerAppNav = (app: AppNavigation) => {
    setAppNav(app)
    ecrireAppNavigation(app)
  }

  const { debut, fin } = bornesPeriode(ancre, mode)

  const rechargerListe = useCallback(async () => {
    setLoading(true); setErreur(null)
    const { data, error } = await getMesCourses(debut, fin)
    if (error) { setErreur(error.message); setCourses([]) }
    else setCourses(data ?? [])
    setLoading(false)
  }, [debut, fin])

  useEffect(() => { rechargerListe() }, [rechargerListe])

  // Les tournées se chargent à part : elles ne conditionnent pas l'affichage
  // des courses, qui doit apparaître même si cette requête traîne ou échoue.
  const rechargerTournees = useCallback(async () => {
    const { data } = await getTourneesDuChauffeur(debut, fin)
    setTournees(data ?? [])
  }, [debut, fin])

  useEffect(() => { rechargerTournees() }, [rechargerTournees])

  useEffect(() => {
    if (!companyId) return
    let annule = false
    getDepot(companyId).then(({ data }) => {
      if (!annule && data) setDepot({ lat: data.depot_lat, lng: data.depot_lng })
    })
    return () => { annule = true }
  }, [companyId])

  useEffect(() => {
    if (courses.length === 0) { setDocuments(new Map()); return }
    let annule = false
    getDocumentsDesCourses(courses.map(c => c.id)).then(({ data }) => {
      if (annule) return
      const par = new Map<string, DocumentCourse[]>()
      for (const d of (data ?? []) as DocumentCourse[]) {
        const liste = par.get(d.entity_id) ?? []
        liste.push(d)
        par.set(d.entity_id, liste)
      }
      setDocuments(par)
    })
    return () => { annule = true }
  }, [courses])

  // useMemo : sans lui, ce tri/filtrage de TOUTES les courses est refait à
  // chaque rendu — y compris quand seul `busyId` change, donc à chaque clic
  // sur « Démarrer »/« Charger »/« Livrer » d'UNE SEULE course.
  const groupes = useMemo(() => grouperParJour(courses), [courses])
  const { reste, total } = useMemo(() => resteAFaire(courses), [courses])

  // Découpage retrait/livraison par jour, calculé une seule fois avec `groupes`
  // plutôt qu'appelé en plein JSX à chaque rendu (ça tournait à chaque clic
  // « Démarrer »/« Charger »/« Livrer », pour TOUS les jours affichés).
  const groupesAvecArrets = useMemo(
    () => groupes.map(([jour, duJour]) => ({ jour, duJour, arrets: arretsDuJour(duJour) })),
    [groupes],
  )

  /**
   * Un chauffeur ne peut qu'AVANCER une course : démarrer, puis livrer. La
   * machine à états reste la référence unique (`canTransition`) — on ne
   * réimplémente pas les règles ici.
   */
  const demarrer = async (c: CourseChauffeur) => {
    if (!canTransition(c.statut, 'en_cours')) {
      toast(`Passage ${c.statut} → en_cours impossible`, 'error'); return
    }
    setBusyId(c.id)
    const { error } = await avancerCourse(c.id, 'en_cours')
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Course démarrée')
    await rechargerListe()
  }

  /**
   * Impose l'ordre des ARRETS de la journee.
   *
   * L'ordre ne vaut QUE dans une journee : deplacer un arret ne doit jamais le
   * faire changer de jour. On reordonne donc la seule sequence du jour, puis on
   * ecrit les positions de ses courses.
   *
   * Une course peut recevoir une position, l'autre, ou les deux — son retrait
   * et sa livraison vivent dans la meme sequence mais pas forcement cote a
   * cote, et c'est tout l'interet.
   */
  const deplacerArretDuJour = async (jour: string, cle: string, sens: 'haut' | 'bas') => {
    const sequence = arretsDuJour(courses.filter(c => c.date === jour))
    const apres = deplacerArretJour(sequence, cle, sens)
    // Reference inchangee = mouvement impossible : inutile d'ecrire pour rien.
    if (apres === sequence) return
    setBusyId(cle.split(':')[0])
    const { error } = await enregistrerOrdreArretsJour(positionsAEcrire(apres))
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    await rechargerListe()
  }

  /**
   * Marque le chargement au point de retrait.
   *
   * Ne touche PAS au statut : la course reste « en cours ». Le chargement dit
   * seulement vers quelle adresse « Naviguer » doit pointer désormais.
   */
  const charger = async (c: CourseChauffeur, expediteur: string | null) => {
    setBusyId(c.id)
    const { error } = await marquerCharge(c.id, expediteur)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(expediteur ? 'Chargé, preuve enregistrée' : 'Chargé')
    await rechargerListe()
  }

  /**
   * Clôture d'une course, avec ou sans preuve.
   *
   * L'ORDRE COMPTE : on écrit la preuve AVANT de passer en `livree`. Si
   * l'enregistrement de la preuve échoue, la course reste `en_cours` et le
   * chauffeur peut réessayer. L'inverse — livrer d'abord, enregistrer
   * ensuite — laisserait des courses livrées sans preuve alors que le
   * chauffeur croit avoir tout fait.
   *
   * `recipient` à `null` = livraison sans preuve, volontairement autorisée :
   * un chauffeur n'a pas toujours quelqu'un pour signer ni du réseau. Ces
   * courses ressortent ensuite dans l'alerte « livraison sans justificatif »,
   * qui existe exactement pour ça.
   */
  const livrer = async (c: CourseChauffeur, recipient: string | null) => {
    if (!canTransition(c.statut, 'livree')) {
      toast(`Passage ${c.statut} → livree impossible`, 'error'); return
    }
    setBusyId(c.id)
    if (recipient) {
      const { error } = await enregistrerPod(c.id, recipient)
      if (error) { setBusyId(null); toast(error.message, 'error'); return }
    }
    const { error } = await avancerCourse(c.id, 'livree')
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(recipient ? 'Livrée, preuve enregistrée' : 'Course livrée')
    await rechargerListe()
  }

  return (
    <Shell pageTitle="Mes courses">
      <InstallAppButton />

      {/* Sélecteur de période — collé en haut, toujours atteignable au pouce */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 min-h-[40px] rounded-[var(--r-md)] text-[var(--fs-sm)] font-medium transition-colors ${
                mode === m.key
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAncre(a => decalerPeriode(a, mode, -1))}
            aria-label="Période précédente"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex-1 text-center">
            <span className="block text-[var(--fs-sm)] font-medium text-[var(--text)] first-letter:uppercase">
              {libellePeriode(ancre, mode)}
            </span>
            {!loading && (
              <span className="block text-[var(--fs-xs)] text-[var(--text-muted)]">
                {total === 0
                  ? 'aucune course'
                  : `${reste} restante${reste > 1 ? 's' : ''} sur ${total}`}
              </span>
            )}
          </div>

          <button
            onClick={() => setAncre(a => decalerPeriode(a, mode, 1))}
            aria-label="Période suivante"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {ancre !== aujourdhui() && (
          <button
            onClick={() => setAncre(aujourdhui())}
            className="self-center text-[var(--fs-xs)] text-[var(--brand)] underline min-h-[32px]"
          >
            Revenir à aujourd'hui
          </button>
        )}
      </div>

      {/* Choix de l'application de navigation. Garde sur CE telephone : c'est
          une commodite liee a l'appareil (« ici, j'ai Waze »), pas une donnee
          de l'entreprise. */}
      <div className="flex items-center gap-2 mb-4">
        <Navigation2 size={14} className="text-[var(--text-muted)] shrink-0" />
        <div className="flex items-center gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] flex-1">
          {APPS_NAVIGATION.map(a => (
            <button key={a.cle} onClick={() => changerAppNav(a.cle)}
              className={`flex-1 min-h-[36px] rounded-[var(--r-md)] text-[var(--fs-xs)] font-medium transition-colors ${
                appNav === a.cle
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {a.libelle}
            </button>
          ))}
        </div>
      </div>

      <ScannerTicket />

      {erreur && (
        <p className="mb-4 text-[var(--fs-sm)] text-[var(--danger)]">{erreur}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title="Aucune course sur cette période"
          description="Change de période avec les flèches, ou reviens à aujourd'hui."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groupesAvecArrets.map(({ jour, duJour, arrets }) => (
            <section key={jour} className="flex flex-col gap-2">
              {/* En-tête de jour : inutile en mode « jour », le titre le dit déjà */}
              {mode !== 'jour' && (
                <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide first-letter:uppercase">
                  {libellePeriode(jour, 'jour')}
                </h2>
              )}

              <BandeauJour
                courses={duJour}
                tournee={tournees.find(t => t.date === jour) ?? null}
                depot={depot}
                peutPiloter={peutPiloterTournee}
                onTourneeChangee={rechargerTournees}
              />

              {/* UN ARRÊT PAR CARTE, et non une course.
                  Une course compte deux points sur la route — on va chercher,
                  puis on livre — et ces deux points ne se suivent pas
                  forcément : on peut charger chez A, charger chez B, puis
                  livrer A. Tant que la liste montrait des COURSES, cette
                  journée-là était inexprimable. */}
              {arrets.map((a, i, tous) => (
                <CarteArret
                  key={a.cle}
                  arret={a}
                  busy={busyId === a.courseId}
                  documents={documents.get(a.courseId) ?? []}
                  onDemarrer={() => demarrer(a.course)}
                  onCharger={expediteur => charger(a.course, expediteur)}
                  onLivrer={destinataire => livrer(a.course, destinataire)}
                  premier={i === 0}
                  dernier={i === tous.length - 1}
                  onDeplacer={sens => deplacerArretDuJour(jour, a.cle, sens)}
                  appNav={appNav}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </Shell>
  )
}

/**
 * Ce qui se decide AVANT de tourner la cle : dans quel ordre remplir le camion,
 * et — quand le bureau a compose une tournee — l'itineraire complet et le
 * demarrage de la tournee.
 *
 * C'est la partie de l'ecran « Tournees » qui sert reellement au volant,
 * ramenee ici. Le reste (repartition entre vehicules, carte d'ensemble,
 * optimisation) reste au bureau : ce sont des gestes de preparation, sur grand
 * ecran, pas des gestes de chauffeur.
 */
function BandeauJour({ courses, tournee, depot, peutPiloter, onTourneeChangee }: {
  courses: CourseChauffeur[]
  tournee: TourneeChauffeur | null
  depot: { lat: number | null; lng: number | null }
  peutPiloter: boolean
  onTourneeChangee: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const [planOuvert, setPlanOuvert] = useState(false)
  const [busy, setBusy] = useState(false)

  // Le plan ne concerne que ce qui reste a livrer : replanifier le chargement
  // autour de colis deja deposes n'aurait aucun sens.
  const aLivrer = courses.filter(c => etapeCourante(c) !== 'terminee')

  // Arrets de CETTE tournee, pas de la journee entiere. La nuance compte : un
  // president voit ici les courses de tout le monde (policy `deliveries_select_own`,
  // documentee dans mescourses.queries.ts), et un itineraire qui melangerait les
  // camions ne menerait nulle part.
  const arretsDeLaTournee = tournee ? courses.filter(c => c.tour_id === tournee.id) : []

  const depotGeocode = depot.lat != null && depot.lng != null
  const arretsGeocodes = arretsDeLaTournee
    .filter(c => c.delivery_lat != null && c.delivery_lng != null)
    .map((c, i) => ({ stop_order: c.stop_order ?? i + 1, lat: c.delivery_lat as number, lng: c.delivery_lng as number }))

  // Une tournee dont aucun arret n'est visible ici n'a rien a dire au
  // chauffeur : on la traite comme absente plutot que d'afficher un entete vide.
  const tourneeVisible = tournee && arretsDeLaTournee.length > 0 ? tournee : null

  // « 3 sur 8 » plutot qu'une etiquette : c'est le seul chiffre qui interesse
  // quelqu'un qui roule.
  const restantes = arretsDeLaTournee.filter(c => etapeCourante(c) !== 'terminee').length

  const lienItineraire = arretsGeocodes.length > 0
    ? googleMapsRouteUrl(
        depotGeocode ? { lat: depot.lat as number, lng: depot.lng as number } : null,
        arretsGeocodes,
        { eviterPeages: tournee?.eviter_peages ?? false },
      )
    : null

  const changerStatut = async (statut: 'en_cours' | 'terminee') => {
    if (!tournee) return
    setBusy(true)
    const { error } = await changerStatutTournee(tournee.id, statut)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(statut === 'en_cours' ? 'Tournée démarrée' : 'Tournée terminée')
    await onTourneeChangee()
  }

  // Rien d'utile a montrer : pas de tournee exploitable, et moins de deux
  // colis a ranger.
  if (arretsDeLaTournee.length === 0 && aLivrer.length < 2) return null

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
      {tourneeVisible && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 border-b border-[var(--border)]">
          {/* Ce qui reste : ce qu'on ne peut pas deviner en roulant. Le nom du
              camion a saute (le chauffeur est dedans) et la pastille de statut
              aussi — les boutons « Démarrer » / « Terminer » disent deja ou en
              est la tournee, et mieux qu'une etiquette. */}
          <Truck size={15} className="text-[var(--brand)] shrink-0" />
          <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">
            {restantes} sur {arretsDeLaTournee.length}
          </span>
          {tourneeVisible.total_km != null && (
            <span className="inline-flex items-center gap-1 text-[var(--fs-xs)] text-[var(--text-muted)]">
              <Route size={12} /> {Number(tourneeVisible.total_km).toFixed(1)} km
            </span>
          )}
          {tourneeVisible.total_duration_min != null && (
            <span className="inline-flex items-center gap-1 text-[var(--fs-xs)] text-[var(--text-muted)]">
              <Clock size={12} /> {formatDuree(tourneeVisible.total_duration_min)}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {lienItineraire && (
          <a href={lienItineraire} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors no-underline">
            <ExternalLink size={16} /> Itinéraire
          </a>
        )}

        {/* Le pilotage de la tournee n'apparait que si la base l'autorisera :
            meme condition que la policy `tours_update_perm`. */}
        {tourneeVisible && peutPiloter && canStartTour(tourneeVisible.status, arretsDeLaTournee.length) && (
          <Button variant="primary" className="min-h-[44px]" disabled={busy}
            onClick={() => changerStatut('en_cours')}>
            {busy ? '…' : 'Démarrer'}
          </Button>
        )}
        {tourneeVisible && peutPiloter && canFinishTour(tourneeVisible.status) && (
          <Button variant="primary" className="min-h-[44px]" disabled={busy}
            onClick={() => changerStatut('terminee')}>
            {busy ? '…' : 'Terminer'}
          </Button>
        )}
      </div>

      {/* PLAN DE CHARGEMENT — l'inverse de l'ordre de livraison. */}
      {aLivrer.length > 1 && (
        <>
          <button type="button" onClick={() => setPlanOuvert(o => !o)} aria-expanded={planOuvert}
            className="w-full flex items-center gap-2 px-3 min-h-[44px] text-left border-t border-[var(--border)]">
            <PackageOpen size={15} className="text-[var(--brand)] shrink-0" />
            <span className="text-[var(--fs-sm)] font-medium text-[var(--text)] flex-1">
              Plan de chargement
            </span>
            <ChevronDown size={16}
              className={`text-[var(--text-muted)] shrink-0 transition-transform ${planOuvert ? 'rotate-180' : ''}`} />
          </button>
          {planOuvert && (
            <div className="px-3 pb-3">
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mb-2">
                Le camion se vide par une seule porte : ce qu'on charge en premier finit au fond.
                Le premier client livré se charge donc en dernier, contre la porte.
              </p>
              {/* Le poids total, la ou on decide si tout rentre. Les courses
                  non pesees sont annoncees separement : les compter pour zero
                  transformerait un minimum en total, et c'est exactement ce qui
                  fait passer un 3,5 t en surcharge. */}
              {libellePoids(poidsTotal(aLivrer)) && (
                <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] mb-2">
                  Charge : {libellePoids(poidsTotal(aLivrer))}
                </p>
              )}
              <ol className="flex flex-col gap-1.5">
                {planDeChargement(aLivrer).map(({ item, rangChargement, rangLivraison }) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full
                      bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-xs)] font-bold text-[var(--text)]">
                      {rangChargement}
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* CE QU'ON CHARGE, avant qui le recoit : devant la porte
                          du camion, la question est « c'est quoi et ca pese
                          combien », pas « c'est pour qui ». */}
                      <span className="block text-[var(--fs-sm)] text-[var(--text)] break-words">
                        {item.description?.trim() || 'Sans description'}
                        {item.weight_kg != null && (
                          <span className="ml-1.5 font-mono text-[var(--fs-xs)] text-[var(--brand)]">
                            {item.weight_kg} kg
                          </span>
                        )}
                      </span>
                      <span className="block text-[var(--fs-xs)] text-[var(--text-muted)] break-words">
                        {item.clients?.name ?? '—'}
                        {item.pickup_address && ` · à prendre : ${item.pickup_address}`}
                      </span>
                    </span>
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)] shrink-0 pt-1">
                      livré n° {rangLivraison}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatDuree(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

/**
 * UN ARRÊT : une adresse, une chose à y faire.
 *
 * Et non plus une course. Une course compte deux points sur la route — on va
 * chercher, puis on livre — et ces deux points ne se suivent pas forcément :
 * on peut charger chez A, charger chez B, puis livrer A. Une carte par arrêt
 * rend cette journée-là lisible et ordonnable ; une carte par course ne le
 * permettait pas.
 */
function CarteArret({
  arret, busy, documents, onDemarrer, onCharger, onLivrer,
  premier, dernier, onDeplacer, appNav,
}: {
  arret: ArretJour<CourseChauffeur>
  busy: boolean
  documents: DocumentCourse[]
  onDemarrer: () => void
  onCharger: (expediteur: string | null) => void
  onLivrer: (destinataire: string | null) => void
  premier: boolean
  dernier: boolean
  onDeplacer: (sens: 'haut' | 'bas') => void
  /** Application de navigation choisie par le chauffeur. */
  appNav: AppNavigation
}) {
  const c = arret.course
  const estRetrait = arret.type === 'retrait'
  const etape = etapeCourante(c)

  const [panneauOuvert, setPanneauOuvert] = useState(false)
  const [messagesOuverts, setMessagesOuverts] = useState(false)

  /**
   * LE BON NUMÉRO AU BON MOMENT.
   *
   * Au retrait, on appelle celui qui REMET ; à la livraison, celui qui REÇOIT.
   * Le téléphone du client facturé ne sert qu'en dernier recours : sur un
   * déménagement de particulier, le donneur d'ordre n'est souvent ni l'un ni
   * l'autre, et le chauffeur appelait jusqu'ici le mauvais interlocuteur pour
   * demander un code d'immeuble.
   */
  const tel = (estRetrait ? c.expediteur_tel : c.destinataire_tel) ?? c.clients?.phone ?? null
  const telEstCeluiDuClient = !(estRetrait ? c.expediteur_tel : c.destinataire_tel)
  const lienAppel = lienTel(tel)
  const peutEcrire = !!lienSms(tel, 'x')

  // Coordonnées seulement pour l'adresse de LIVRAISON : `deliveries` ne géocode
  // qu'elle. Un point de retrait n'a que son texte.
  const lienNav = lienNavigation(
    appNav,
    !estRetrait && c.delivery_lat != null && c.delivery_lng != null
      ? { lat: c.delivery_lat, lng: c.delivery_lng }
      : { adresse: arret.adresse },
  )

  /**
   * Le geste à faire ICI, et nulle part ailleurs.
   *
   * L'arrêt de retrait ne propose « Charger » que si la course est partie ;
   * sinon il propose « Démarrer », parce qu'on ne charge pas une course qu'on
   * n'a pas commencée. L'arrêt de livraison ne propose « Livrer » que lorsque
   * c'est bien l'étape en cours.
   */
  const action: 'demarrer' | 'charger' | 'livrer' | null =
    arret.fait ? null
      : estRetrait
        ? (etape === 'a_demarrer' ? 'demarrer' : etape === 'vers_chargement' ? 'charger' : null)
        : (etape === 'a_demarrer' ? 'demarrer' : etape === 'vers_livraison' ? 'livrer' : null)

  const LIBELLE: Record<'demarrer' | 'charger' | 'livrer', string> = {
    demarrer: 'Démarrer', charger: 'Charger', livrer: 'Livrer',
  }

  return (
    <article className={`rounded-[var(--r-lg)] border p-4 flex flex-col gap-3 ${
      arret.fait
        ? 'border-[var(--border)] opacity-55'
        : 'border-[var(--border)]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1.5 text-[var(--fs-xs)] font-semibold uppercase tracking-wide ${
            estRetrait ? 'text-[var(--warning)]' : 'text-[var(--brand)]'
          }`}>
            {estRetrait ? <PackageOpen size={13} /> : <Flag size={13} />}
            {estRetrait ? 'Retrait' : 'Livraison'}
          </span>
          <p className="font-medium text-[var(--text)] break-words">{c.clients?.name ?? '—'}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* L'ordre se change tant qu'il reste quelque chose à faire ici. */}
          {!arret.fait && !(premier && dernier) && (
            <>
              <button onClick={() => onDeplacer('haut')} disabled={busy || premier}
                aria-label="Monter cet arrêt" className={flecheCls}>
                <ArrowUp size={15} />
              </button>
              <button onClick={() => onDeplacer('bas')} disabled={busy || dernier}
                aria-label="Descendre cet arrêt" className={flecheCls}>
                <ArrowDown size={15} />
              </button>
            </>
          )}
          <Badge color={arret.fait ? 'success' : estRetrait ? 'warning' : 'info'}>
            {arret.fait ? 'Fait' : libelleEtat(c)}
          </Badge>
        </div>
      </div>

      {/* L'ADRESSE DE CET ARRÊT, en grand : c'est la seule information dont on
          a besoin devant le pare-brise. */}
      {arret.adresse ? (
        <p className="text-[var(--fs-sm)] text-[var(--text)] break-words">{arret.adresse}</p>
      ) : (
        <p className="text-[var(--fs-sm)] font-medium text-[var(--danger)]">
          Adresse manquante — à compléter au bureau
        </p>
      )}

      {(c.description || c.weight_kg != null) && (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)] break-words">
          {[
            c.description,
            c.weight_kg != null ? `${c.weight_kg} kg` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {documents.length > 0 && !arret.fait && <PiecesJointes documents={documents} />}

      <div className="flex items-center gap-2 flex-wrap">
        {lienNav && !arret.fait && (
          <a href={lienNav} target="_blank" rel="noopener noreferrer" className={boutonCls}>
            <Navigation2 size={16} /> Aller
          </a>
        )}

        {lienAppel && !arret.fait && (
          <a href={lienAppel} className={boutonCls}>
            <Phone size={16} /> Appeler
          </a>
        )}

        {peutEcrire && !arret.fait && (
          <button type="button" onClick={() => setMessagesOuverts(o => !o)} className={boutonCls}>
            <MessageSquare size={16} /> Écrire
          </button>
        )}

        {action && !panneauOuvert && (
          <Button variant="primary" className="min-h-[44px] ml-auto" disabled={busy}
            onClick={() => (action === 'demarrer' ? onDemarrer() : setPanneauOuvert(true))}>
            {busy ? '…' : LIBELLE[action]}
          </Button>
        )}

        {arret.fait && !estRetrait && c.pod_captured_at && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--success)]">
            <ShieldCheck size={14} /> Preuve
          </span>
        )}
      </div>

      {/* Dire QUI on appelle quand ce n'est pas le contact de cet arrêt :
          composer le numéro du donneur d'ordre en croyant joindre le
          destinataire fait perdre un appel et parfois la livraison. */}
      {(lienAppel || peutEcrire) && !arret.fait && telEstCeluiDuClient && (
        <p className="text-[var(--fs-xs)] text-[var(--text-disabled)]">
          Numéro du client facturé — pas de contact {estRetrait ? 'expéditeur' : 'destinataire'} renseigné.
        </p>
      )}

      {messagesOuverts && peutEcrire && (
        <div className="flex flex-wrap gap-2">
          {MESSAGES_TYPES.map(m => {
            const lien = lienSms(tel, m.texte(c.clients?.name ?? null))
            if (!lien) return null
            return (
              <a key={m.cle} href={lien} onClick={() => setMessagesOuverts(false)}
                className="inline-flex items-center min-h-[40px] px-3 rounded-[var(--r-md)]
                  border border-[var(--border-soft)] bg-[var(--bg-card)]
                  text-[var(--fs-sm)] text-[var(--text)] no-underline
                  hover:border-[var(--brand)] transition-colors">
                {m.libelle}
              </a>
            )
          })}
        </div>
      )}

      {/* La condition sur l'étape n'est pas redondante : après validation, le
          parent recharge mais ne remonte PAS cette carte (même `key`), donc
          `panneauOuvert` resterait à true sous un arrêt déjà fait. */}
      {panneauOuvert && estRetrait && etape === 'vers_chargement' && (
        <EtapeTerrain
          courseId={c.id} role="expediteur"
          nomConnu={c.expediteur_nom}
          dejaSignee={!!c.lv_signatures?.expediteur}
          demanderTransporteur
          transporteurDejaSigne={!!c.lv_signatures?.transporteur}
          busy={busy}
          onValider={nom => { setPanneauOuvert(false); onCharger(nom) }}
          onAnnuler={() => setPanneauOuvert(false)}
        />
      )}

      {panneauOuvert && !estRetrait && etape === 'vers_livraison' && (
        <EtapeTerrain
          courseId={c.id} role="destinataire"
          nomConnu={c.destinataire_nom ?? c.pod_recipient_name}
          dejaSignee={!!c.lv_signatures?.destinataire}
          // Le transporteur signe a la PRISE EN CHARGE. Sans etape de
          // chargement (marchandise deja dans le camion), c'est ici — sinon
          // la lettre de voiture resterait sans sa signature.
          demanderTransporteur={!c.pickup_address?.trim()}
          transporteurDejaSigne={!!c.lv_signatures?.transporteur}
          busy={busy}
          onValider={nom => { setPanneauOuvert(false); onLivrer(nom) }}
          onAnnuler={() => setPanneauOuvert(false)}
        />
      )}
    </article>
  )
}

const flecheCls = `p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
  hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
  disabled:opacity-30 disabled:cursor-not-allowed transition-colors`

const boutonCls = `inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
  border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)] no-underline
  hover:border-[var(--brand)] transition-colors`

function ScannerTicket() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [ouvert, setOuvert] = useState(false)

  const choisir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de reprendre le même fichier après une erreur
    if (!file || !companyId) return

    setEnvoi(true)
    const { error } = await deposerTicket(file, companyId, note)
    setEnvoi(false)
    if (error) { toast(error.message, 'error'); return }

    setNote('')
    setOuvert(false)
    toast('Ticket envoyé — il apparaît côté gestion')
  }

  return (
    <div className="mb-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={choisir}
      />

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 text-[var(--fs-sm)]
            text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
        >
          <Camera size={16} /> Scanner un ticket
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="De quoi s'agit-il ? (péage A35, plein Movano…)"
            className="w-full min-h-[44px] px-3 rounded-[var(--r-md)] bg-[var(--bg)]
              border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)]
              focus:outline-none focus:border-[var(--brand)]"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1 min-h-[44px]"
              onClick={() => inputRef.current?.click()}
              disabled={envoi}
            >
              {envoi ? 'Envoi…' : 'Prendre la photo'}
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => { setOuvert(false); setNote('') }}
              disabled={envoi}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Pièces jointes d'une course, ouvrables depuis le téléphone.
 *
 * Ce que le chauffeur avait demandé : retrouver sur le terrain les documents
 * déposés depuis le bureau — bon de commande, étiquette, consignes du client —
 * plus les photos de preuve déjà prises. Ils existaient en base et n'étaient
 * visibles que dans le grand tiroir de gestion.
 *
 * L'URL est signée AU MOMENT DU CLIC, pas au chargement de la liste : une URL
 * signée expire au bout d'une heure, et en signer vingt d'avance pour n'en
 * ouvrir aucune serait à la fois lent et inutile.
 */
function PiecesJointes({ documents }: { documents: DocumentCourse[] }) {
  const { toast } = useToast()
  const [ouverture, setOuverture] = useState<string | null>(null)

  const ouvrir = async (d: DocumentCourse) => {
    setOuverture(d.id)
    const url = await getDownloadUrl(d as never)
    setOuverture(null)
    if (!url) {
      toast("Ce fichier est introuvable — il n'a peut-être pas encore été rapatrié.", 'error')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
        <Paperclip size={13} />
        {documents.length > 1 ? `${documents.length} documents` : '1 document'}
      </span>

      <div className="flex flex-col gap-1">
        {documents.map(d => {
          const estImage = (d.mime_type ?? '').startsWith('image/')
          return (
            <button
              key={d.id}
              onClick={() => ouvrir(d)}
              disabled={ouverture === d.id}
              className="flex items-center gap-2 min-h-[44px] px-3 rounded-[var(--r-md)] text-left
                border border-[var(--border)] bg-[var(--bg-deep)]
                hover:border-[var(--brand)] transition-colors disabled:opacity-50"
            >
              <span className="text-[var(--text-disabled)] shrink-0">
                {estImage ? <ImageIcon size={15} /> : <FileText size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--fs-sm)] text-[var(--text)] truncate">{d.file_name}</span>
                {d.category && (
                  <span className="block text-[var(--fs-xs)] text-[var(--text-disabled)]">{d.category}</span>
                )}
              </span>
              {ouverture === d.id && (
                <span className="text-[var(--fs-xs)] text-[var(--text-muted)] shrink-0">Ouverture…</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
