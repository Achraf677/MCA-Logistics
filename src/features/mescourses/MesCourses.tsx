import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Navigation2, Check, Phone, Package, Camera, ShieldCheck, Paperclip, FileText, Image as ImageIcon, MapPin, Flag, PackageOpen, ArrowUp, ArrowDown, ChevronDown, Route, Clock, ExternalLink, Truck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { deposerTicket } from '../../shared/lib/receiptsInbox.queries'
import { getDownloadUrl } from '../../shared/lib/documents.queries'
import { enregistrerPod } from '../../shared/lib/pod.queries'
import { canTransition } from '../../shared/lib/livraisonStatuts'
import {
  getMesCourses, avancerCourse, getDocumentsDesCourses, marquerCharge,
  enregistrerOrdreCourses, getTourneesDuChauffeur, changerStatutTournee, getDepot,
} from './mescourses.queries'
// Memes regles que les tournees : ecrites une fois, testees une fois.
import { deplacerArret, planDeChargement } from '../../shared/lib/ordreArrets'
import { canStartTour, canFinishTour } from '../../shared/lib/tourneeStatuts'
import { googleMapsAdresseUrl, googleMapsStopUrl, googleMapsRouteUrl } from '../../shared/lib/navigation'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { etapeCourante, adresseDeNavigation, libelleAction, libelleEtat } from './etapes.logic'
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

  const groupes = grouperParJour(courses)
  const { reste, total } = resteAFaire(courses)

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
   * Impose l'ordre des courses de la journee.
   *
   * L'ordre ne vaut QUE dans une journee : deplacer une course ne doit pas la
   * faire changer de jour. On reordonne donc le groupe du jour, puis on
   * enregistre ce seul groupe.
   */
  const deplacerCourse = async (jour: string, id: string, sens: 'haut' | 'bas') => {
    const duJour = courses.filter(c => c.date === jour).map(c => c.id)
    const nouveau = deplacerArret(duJour, id, sens)
    // Renvoie la liste inchangee quand le mouvement est impossible : inutile
    // d'ecrire en base pour rien.
    if (nouveau.every((v, i) => v === duJour[i])) return
    setBusyId(id)
    const { error } = await enregistrerOrdreCourses(nouveau)
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
          {groupes.map(([jour, duJour]) => (
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

              {duJour.map((c, i) => (
                <CarteCourse
                  key={c.id}
                  course={c}
                  busy={busyId === c.id}
                  documents={documents.get(c.id) ?? []}
                  onDemarrer={() => demarrer(c)}
                  onCharger={expediteur => charger(c, expediteur)}
                  premier={i === 0}
                  dernier={i === duJour.length - 1}
                  onDeplacer={sens => deplacerCourse(jour, c.id, sens)}
                  onLivrer={destinataire => livrer(c, destinataire)}
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
          <Truck size={15} className="text-[var(--brand)] shrink-0" />
          <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">
            {arretsDeLaTournee.find(c => c.vehicles)?.vehicles?.label ?? 'Ma tournée'}
          </span>
          <Badge color={tourneeVisible.status === 'en_cours' ? 'warning' : tourneeVisible.status === 'terminee' ? 'success' : 'info'}>
            {LIBELLES_TOURNEE[tourneeVisible.status]}
          </Badge>
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
            <ExternalLink size={15} /> Itinéraire complet
          </a>
        )}

        {/* Le pilotage de la tournee n'apparait que si la base l'autorisera :
            meme condition que la policy `tours_update_perm`. */}
        {tourneeVisible && peutPiloter && canStartTour(tourneeVisible.status, arretsDeLaTournee.length) && (
          <Button variant="primary" className="min-h-[44px]" disabled={busy}
            onClick={() => changerStatut('en_cours')}>
            {busy ? '…' : 'Démarrer la tournée'}
          </Button>
        )}
        {tourneeVisible && peutPiloter && canFinishTour(tourneeVisible.status) && (
          <Button variant="primary" className="min-h-[44px]" disabled={busy}
            onClick={() => changerStatut('terminee')}>
            {busy ? '…' : 'Terminer la tournée'}
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
              <ol className="flex flex-col gap-1.5">
                {planDeChargement(aLivrer).map(({ item, rangChargement, rangLivraison }) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full
                      bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-xs)] font-bold text-[var(--text)]">
                      {rangChargement}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[var(--fs-sm)] text-[var(--text)] break-words">
                        {item.clients?.name ?? '—'}
                      </span>
                      {item.pickup_address && (
                        <span className="block text-[var(--fs-xs)] text-[var(--text-muted)] break-words">
                          à charger : {item.pickup_address}
                        </span>
                      )}
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

const LIBELLES_TOURNEE: Record<TourneeChauffeur['status'], string> = {
  brouillon: 'À préparer', optimisee: 'Prête', en_cours: 'En cours', terminee: 'Terminée',
}

function formatDuree(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

function CarteCourse({
  course: c, busy, documents, onDemarrer, onCharger, onLivrer,
  premier, dernier, onDeplacer,
}: {
  course: CourseChauffeur
  busy: boolean
  documents: DocumentCourse[]
  onDemarrer: () => void
  onCharger: (expediteur: string | null) => void
  onLivrer: (destinataire: string | null) => void
  premier: boolean
  dernier: boolean
  onDeplacer: (sens: 'haut' | 'bas') => void
}) {
  const etape = etapeCourante(c)
  const adresse = adresseDeNavigation(c)
  const action = libelleAction(c)
  const enCours = etape !== 'terminee'

  // Le panneau de preuve ne s'ouvre qu'au moment du geste : afficher photo,
  // nom et signature en permanence noierait la liste.
  const [panneauOuvert, setPanneauOuvert] = useState(false)

  // Lien de navigation : coordonnees quand on les a (plus precis), adresse
  // ecrite sinon. Seule l'adresse de LIVRAISON est geocodee dans `deliveries` ;
  // un point de retrait n'a que son texte.
  const versLivraison = etape === 'vers_livraison' || etape === 'terminee'
  const geo = versLivraison && c.delivery_lat != null && c.delivery_lng != null
  const lienNav = geo
    ? googleMapsStopUrl(c.delivery_lat as number, c.delivery_lng as number)
    : adresse
      ? googleMapsAdresseUrl(adresse)
      : null

  return (
    <article className={`rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3 ${
      enCours ? '' : 'opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[var(--text)] break-words">{c.clients?.name ?? '—'}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Ordre de la journee. Masque sur une course close : la reordonner
              ne changerait plus rien a la route qui reste a faire. */}
          {enCours && !(premier && dernier) && (
            <>
              <button onClick={() => onDeplacer('haut')} disabled={busy || premier}
                aria-label="Monter cette course"
                className="p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
                  hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
                  disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ArrowUp size={15} />
              </button>
              <button onClick={() => onDeplacer('bas')} disabled={busy || dernier}
                aria-label="Descendre cette course"
                className="p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
                  hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
                  disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ArrowDown size={15} />
              </button>
            </>
          )}
          <Badge color={etape === 'terminee' ? 'success' : etape === 'vers_livraison' ? 'info' : 'warning'}>
            {libelleEtat(c)}
          </Badge>
        </div>
      </div>

      {/* LES DEUX ADRESSES, toujours visibles. Elles manquaient : la carte
          n'affichait que la description, donc une course dont le libelle ne
          mentionnait pas la ville ne disait pas ou aller. L'etape en cours est
          mise en avant, l'autre reste lisible pour se reperer. */}
      <div className="flex flex-col gap-1.5">
        <LigneAdresse icone={<MapPin size={13} />} label="Retrait"
          valeur={c.pickup_address} actif={etape === 'vers_chargement'} />
        {/* La livraison est TOUJOURS affichée, même absente : une adresse
            manquante doit se voir. Masquée, le chauffeur ne pouvait pas
            distinguer « rien à faire là-bas » de « personne n'a saisi
            l'adresse » — et il ne s'en apercevait qu'une fois sur la route. */}
        <LigneAdresse icone={<Flag size={13} />} label="Livraison"
          valeur={c.delivery_address} actif={versLivraison} obligatoire />
      </div>

      {(c.description || c.weight_kg != null || c.vehicles) && (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)] break-words">
          {[
            c.description,
            c.weight_kg != null ? `${c.weight_kg} kg` : null,
            c.vehicles ? `${c.vehicles.label} (${c.vehicles.plate})` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {documents.length > 0 && <PiecesJointes documents={documents} />}

      <div className="flex items-center gap-2 flex-wrap">
        {lienNav && enCours && (
          <a href={lienNav} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors">
            <Navigation2 size={15} /> Naviguer
            <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">
              {etape === 'vers_chargement' ? '· retrait' : '· livraison'}
            </span>
          </a>
        )}

        {c.clients?.phone && (
          <a href={`tel:${c.clients.phone}`}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors">
            <Phone size={15} /> Appeler
          </a>
        )}

        {/* « Demarrer » agit tout de suite ; « Charger » et « Livrer » ouvrent
            le panneau de preuve, parce qu'ils s'accompagnent d'une photo,
            d'un nom et d'une signature. */}
        {action && !panneauOuvert && (
          <Button variant="primary" className="min-h-[44px] ml-auto" disabled={busy}
            onClick={() => (etape === 'a_demarrer' ? onDemarrer() : setPanneauOuvert(true))}>
            {busy ? '…' : (
              <span className="inline-flex items-center gap-1.5">
                {etape === 'vers_chargement' ? <PackageOpen size={15} />
                  : etape === 'vers_livraison' ? <Check size={15} /> : null}
                {action}
              </span>
            )}
          </Button>
        )}

        {etape === 'terminee' && c.pod_captured_at && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--success)]">
            <ShieldCheck size={14} /> Preuve enregistrée
          </span>
        )}
      </div>

      {/* La condition sur l'etape n'est pas redondante : apres validation, le
          parent recharge mais ne remonte PAS cette carte (meme `key`), donc
          `panneauOuvert` resterait a true sous une course deja close. */}
      {panneauOuvert && etape === 'vers_chargement' && (
        <EtapeTerrain
          courseId={c.id} role="expediteur"
          nomConnu={c.expediteur_nom}
          dejaSignee={!!c.lv_signatures?.expediteur}
          busy={busy}
          onValider={nom => { setPanneauOuvert(false); onCharger(nom) }}
          onAnnuler={() => setPanneauOuvert(false)}
        />
      )}

      {panneauOuvert && etape === 'vers_livraison' && (
        <EtapeTerrain
          courseId={c.id} role="destinataire"
          nomConnu={c.destinataire_nom ?? c.pod_recipient_name}
          dejaSignee={!!c.lv_signatures?.destinataire}
          busy={busy}
          onValider={nom => { setPanneauOuvert(false); onLivrer(nom) }}
          onAnnuler={() => setPanneauOuvert(false)}
        />
      )}
    </article>
  )
}

/**
 * Une adresse de la course.
 *
 * `actif` met en avant l'etape en cours sans masquer l'autre : le chauffeur
 * doit voir d'un coup d'oeil ou il va MAINTENANT, tout en gardant la
 * destination suivante sous les yeux pour se reperer.
 */
function LigneAdresse({ icone, label, valeur, actif, obligatoire = false }: {
  icone: ReactNode; label: string; valeur: string | null; actif: boolean
  /**
   * L'adresse est-elle attendue quoi qu'il arrive ?
   *
   * Un RETRAIT absent est normal — la course part du dépôt, marchandise déjà
   * chargée — donc on ne dit rien. Une LIVRAISON absente est une anomalie : on
   * le dit, en rouge, plutôt que de faire disparaître la ligne.
   */
  obligatoire?: boolean
}) {
  const vide = !valeur?.trim()
  if (vide && !obligatoire) return null

  if (vide) {
    return (
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-[var(--danger)]">{icone}</span>
        <span className="min-w-0">
          <span className="block text-[var(--fs-xs)] text-[var(--text-disabled)] leading-tight">{label}</span>
          <span className="block text-[var(--fs-sm)] font-medium text-[var(--danger)]">
            Adresse manquante — à compléter au bureau
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 ${actif ? '' : 'opacity-55'}`}>
      <span className={`mt-0.5 shrink-0 ${actif ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`}>
        {icone}
      </span>
      <span className="min-w-0">
        <span className="block text-[var(--fs-xs)] text-[var(--text-disabled)] leading-tight">{label}</span>
        <span className="block text-[var(--fs-sm)] text-[var(--text)] break-words">{valeur!.trim()}</span>
      </span>
    </div>
  )
}

/**
 * Dépôt d'un ticket photographié (péage, plein, pièce détachée…).
 *
 * `capture="environment"` ouvre directement l'appareil photo arrière sur
 * téléphone, au lieu du sélecteur de fichiers : c'est le geste attendu au bord
 * de la route. Sur ordinateur, l'attribut est ignoré et on retombe sur le
 * sélecteur habituel.
 */
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
