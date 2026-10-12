import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Navigation2, Phone, PackageOpen, Package, Camera, ShieldCheck, Paperclip, FileText, Image as ImageIcon, Flag, ArrowUp, ArrowDown, ChevronDown, Route, Clock, ExternalLink, Truck, MessageSquare, AlertTriangle, Info, User, X, Zap } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone, PanneauReglages } from '../../shared/ui/BoutonIcone'
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
import { toLocalISO } from '../../shared/lib/dates'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  getMesCourses, avancerCourse, getDocumentsDesCourses, marquerCharge,
  enregistrerOrdreArretsJour, getTourneesDuChauffeur, changerStatutTournee, getDepot,
  signalerProbleme, getMaFicheEquipe,
} from './mescourses.queries'
import { PanneauProbleme } from './PanneauProbleme'
import { libelleMotif, aProblemeOuvert } from '../../shared/lib/problemeTerrain'
// Memes regles que les tournees : ecrites une fois, testees une fois.
import { planDeChargement } from '../../shared/lib/ordreArrets'
import { poidsTotal, libellePoids } from '../../shared/lib/poids'
import {
  arretsDuJour, deplacerArretJour, positionsAEcrire, type ArretJour,
} from '../../shared/lib/arretsJour'
import { canStartTour, canFinishTour } from '../../shared/lib/tourneeStatuts'
import {
  itineraireEnLots, lienNavigation, APPS_NAVIGATION, type AppNavigation, type EtapeItineraire,
} from '../../shared/lib/navigation'
import { lireAppNavigation, ecrireAppNavigation } from '../../shared/lib/prefChauffeur'
import { messagesPour, contactArret, lienSms, lienTel } from '../../shared/lib/messageClient'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { etapeCourante, libelleEtat, actionArret, type ActionArret } from './etapes.logic'
import { EtapeTerrain } from './EtapeTerrain'
import {
  bornesPeriode, decalerPeriode, libellePeriode, grouperParJour,
  prochainArret, progression, etatHoraire, filtrerMesCourses,
  type ModePeriode, libelleCreneauArret, libelleProgression, rangDansSequence,
  libelleHeureEstimee, libelleDateCourte, confirmationAutreJour, messageTransitionImpossible,
  traduireErreurEcriture, libelleCategorieDocument, documentsPourChauffeur, vehiculesDuJour,
} from './mescourses.logic'
import type { CourseChauffeur, DocumentCourse, TourneeChauffeur } from './mescourses.types'

// Pas de « Mois » : un chauffeur regarde sa journée, parfois sa semaine.
const MODES: Array<{ key: ModePeriode; label: string }> = [
  { key: 'jour',    label: 'Jour' },
  { key: 'semaine', label: 'Sem.' },
]

/** Heure locale du téléphone, pour l'état « en retard / bientôt ». */
function maintenantLocal() {
  const d = new Date()
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { jour, minutes: d.getHours() * 60 + d.getMinutes() }
}

// Date LOCALE du téléphone : `toISOString()` donnerait la veille avant 2 h.
const aujourdhui = () => toLocalISO(new Date())

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
  const { companyId, profile } = useProfile()
  // Un président / DG / comptable voit TOUTES les courses (RLS). S'il roule
  // aussi, il veut pouvoir ne garder que les siennes.
  const voitTout = !!profile && profile.role !== 'chauffeur'
  const [monId, setMonId] = useState<string | null>(null)
  const [vue, setVue] = useState<'moi' | 'tous'>('tous')
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  // Rafraîchi chaque minute : « en retard » doit apparaître sans recharger.
  const [maintenant, setMaintenant] = useState(maintenantLocal)
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(maintenantLocal()), 60_000)
    return () => window.clearInterval(t)
  }, [])
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

  // Fiche équipe de l'utilisateur, pour TOUS les rôles : le président / DG
  // s'en sert pour filtrer, le chauffeur pour savoir si son compte est relié
  // (sans fiche reliée, la RLS ne lui rend aucune course — et l'écran disait
  // « change de période », ce qui l'envoyait chercher pour rien).
  const [ficheVerifiee, setFicheVerifiee] = useState(false)
  useEffect(() => {
    if (!profile) return
    let annule = false
    getMaFicheEquipe(profile.id).then(({ data, error }) => {
      if (annule) return
      // Une erreur de lecture ne prouve pas l'absence de fiche : on ne dit rien.
      if (error) return
      setFicheVerifiee(true)
      if (!data) return
      setMonId(data.id)
      if (voitTout) setVue('moi')
    })
    return () => { annule = true }
  }, [voitTout, profile])
  const ficheNonReliee = profile?.role === 'chauffeur' && ficheVerifiee && !monId

  // Geste sur une course d'un autre jour : on demande avant (voir confirmationAutreJour).
  const [aConfirmer, setAConfirmer] = useState<{ message: string; suite: () => void } | null>(null)
  const confirmerSiAutreJour = useCallback((date: string, suite: () => void) => {
    const message = confirmationAutreJour(date, aujourdhui())
    if (message) setAConfirmer({ message, suite })
    else suite()
  }, [])

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
      for (const d of documentsPourChauffeur((data ?? []) as DocumentCourse[], profile?.id ?? null)) {
        const liste = par.get(d.entity_id) ?? []
        liste.push(d)
        par.set(d.entity_id, liste)
      }
      setDocuments(par)
    })
    return () => { annule = true }
  }, [courses, profile?.id])

  // useMemo : sans lui, ce tri/filtrage de TOUTES les courses est refait à
  // chaque rendu — y compris quand seul `busyId` change, donc à chaque clic
  // sur « Démarrer »/« Charger »/« Livrer » d'UNE SEULE course.
  const visibles = useMemo(
    () => (voitTout && vue === 'moi' ? filtrerMesCourses(courses, monId) : courses),
    [courses, voitTout, vue, monId],
  )
  const groupes = useMemo(() => grouperParJour(visibles), [visibles])

  // Découpage retrait/livraison par jour, calculé une seule fois avec `groupes`
  // plutôt qu'appelé en plein JSX à chaque rendu (ça tournait à chaque clic
  // « Démarrer »/« Charger »/« Livrer », pour TOUS les jours affichés).
  const groupesAvecArrets = useMemo(
    () => groupes.map(([jour, duJour]) => ({ jour, duJour, arrets: arretsDuJour(duJour) })),
    [groupes],
  )
  const tousArrets = useMemo(() => groupesAvecArrets.flatMap(g => g.arrets), [groupesAvecArrets])
  const prochain = useMemo(() => prochainArret(tousArrets), [tousArrets])
  const { faits, total } = useMemo(() => progression(tousArrets), [tousArrets])
  const afficherChauffeur = voitTout && vue === 'tous'

  /**
   * Un chauffeur ne peut qu'AVANCER une course : démarrer, puis livrer. La
   * machine à états reste la référence unique (`canTransition`) — on ne
   * réimplémente pas les règles ici.
   */
  const demarrer = async (c: CourseChauffeur) => {
    if (!canTransition(c.statut, 'en_cours')) {
      toast(messageTransitionImpossible(c.statut, 'en_cours'), 'error'); return
    }
    setBusyId(c.id)
    const { error } = await avancerCourse(c.id, 'en_cours')
    setBusyId(null)
    if (error) { toast(traduireErreurEcriture(error), 'error'); return }
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
    // L'ordre d'une TOURNÉE appartient à la tournée (bureau, optimisation) :
    // on n'écrit jamais la position d'une course rattachée à une tournée.
    const enTournee = new Set(courses.filter(c => c.tour_id).map(c => c.id))
    const positions = positionsAEcrire(apres).filter(p => !enTournee.has(p.courseId))
    if (positions.length === 0) return
    setBusyId(cle.split(':')[0])
    const { error } = await enregistrerOrdreArretsJour(positions)
    setBusyId(null)
    if (error) { toast(traduireErreurEcriture(error), 'error'); return }
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
    if (error) { toast(traduireErreurEcriture(error), 'error'); return }
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
   * `preuve` = il existe un nom, une photo OU une signature : on horodate alors
   * la preuve (`pod_captured_at`), même sans nom.
   *
   * Aucune preuve = livraison sans preuve, volontairement autorisée :
   * un chauffeur n'a pas toujours quelqu'un pour signer ni du réseau. Ces
   * courses ressortent ensuite dans l'alerte « livraison sans justificatif »,
   * qui existe exactement pour ça.
   */
  const livrer = async (c: CourseChauffeur, recipient: string | null, preuve: boolean) => {
    if (!canTransition(c.statut, 'livree')) {
      toast(messageTransitionImpossible(c.statut, 'livree'), 'error'); return
    }
    setBusyId(c.id)
    if (preuve) {
      const { error } = await enregistrerPod(c.id, recipient)
      if (error) { setBusyId(null); toast(traduireErreurEcriture(error), 'error'); return }
    }
    const { error } = await avancerCourse(c.id, 'livree')
    setBusyId(null)
    if (error) { toast(traduireErreurEcriture(error), 'error'); return }
    toast(preuve ? 'Livrée, preuve enregistrée' : 'Course livrée')
    await rechargerListe()
  }

  /** Échec sur un arrêt : la course reste ouverte, le bureau est alerté. */
  const signaler = async (c: CourseChauffeur, motif: string, note: string | null) => {
    setBusyId(c.id)
    const { error } = await signalerProbleme(c.id, motif, note)
    setBusyId(null)
    if (error) { toast(traduireErreurEcriture(error), 'error'); return }
    toast('Problème signalé au bureau')
    await rechargerListe()
  }

  return (
    <Shell pageTitle="Mes courses">
      <InstallAppButton />

      {/* EN-TÊTE COMPACT : une seule ligne avant le premier arrêt. Le choix de
          l'appli GPS se règle une fois — il vit dans les réglages repliés. */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <BoutonIcone icone={ChevronLeft} libelle="Période précédente" onClick={() => setAncre(a => decalerPeriode(a, mode, -1))} />
          <div className="flex-1 min-w-0 text-center">
            <span className="block text-sm font-medium text-[var(--text)] first-letter:uppercase truncate">
              {mode === 'jour'
                ? (ancre === aujourdhui() ? "Aujourd'hui" : libelleDateCourte(ancre))
                : libellePeriode(ancre, mode)}
            </span>
            {!loading && (
              <span className="block text-xs text-[var(--text-muted)]">
                {libelleProgression(faits, total)}
              </span>
            )}
          </div>
          <BoutonIcone icone={ChevronRight} libelle="Période suivante" onClick={() => setAncre(a => decalerPeriode(a, mode, 1))} />
          <div className="flex items-center p-0.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
            {MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`min-h-9 px-2.5 rounded-[var(--r-sm)] text-xs font-medium transition-colors ${
                  mode === m.key ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                {m.label}
              </button>
            ))}
          </div>
          <BoutonIcone libelle="Réglages" actif={reglagesOuverts} onClick={() => setReglagesOuverts(o => !o)} />
        </div>

        {/* Président / DG qui roule aussi : ses courses à lui, ou toute l'équipe. */}
        {voitTout && monId && (
          <div className="flex items-center gap-1 p-0.5 self-start rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
            {([['moi', 'Mes courses'], ['tous', 'Tous les chauffeurs']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVue(v)}
                className={`min-h-8 px-3 rounded-[var(--r-sm)] text-xs font-medium transition-colors ${
                  vue === v ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                {l}
              </button>
            ))}
          </div>
        )}

        {reglagesOuverts && (
          <PanneauReglages titre={<><Navigation2 size={13} /> Application GPS (gardée sur ce téléphone)</>}>
            <div className="flex items-center gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
              {APPS_NAVIGATION.map(a => (
                <button key={a.cle} onClick={() => changerAppNav(a.cle)}
                  className={`flex-1 min-h-9 rounded-[var(--r-md)] text-xs font-medium transition-colors ${
                    appNav === a.cle ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}>
                  {a.libelle}
                </button>
              ))}
            </div>
          </PanneauReglages>
        )}

        {ancre !== aujourdhui() && (
          <button onClick={() => setAncre(aujourdhui())}
            className="self-center text-xs text-[var(--brand)] underline min-h-7">
            Revenir à aujourd'hui
          </button>
        )}
      </div>

      {/* PROCHAIN ARRÊT : où aller maintenant, sans chercher dans la liste. */}
      {!loading && prochain && (
        <button type="button"
          onClick={() => document.getElementById(`arret-${prochain.cle}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full mb-4 flex items-center gap-3 p-3 rounded-[var(--r-lg)] text-left
            border border-[var(--brand)] bg-[var(--bg-card)]">
          <span className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
              Prochain arrêt · {prochain.type === 'retrait' ? 'Retrait' : 'Livraison'}
              {prochain.course.date !== aujourdhui() && ` · ${libelleDateCourte(prochain.course.date)}`}
            </span>
            <span className="text-sm font-medium text-[var(--text)] truncate">
              {prochain.course.clients?.name ?? '—'}
            </span>
            <span className="text-xs text-[var(--text-muted)] truncate">
              {prochain.adresse || 'Adresse manquante'}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {rangDansSequence(tousArrets, prochain.cle) ?? '—'} / {total}
            </span>
            <span className="w-16 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <span className="block h-full bg-[var(--brand)]" style={{ width: `${total ? (faits / total) * 100 : 0}%` }} />
            </span>
          </span>
        </button>
      )}

      {erreur && (
        <p className="mb-4 text-sm text-[var(--danger)]">{erreur}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : visibles.length === 0 ? (
        ficheNonReliee ? (
          <EmptyState
            icon={<User size={28} />}
            title="Compte pas encore relié"
            description="Ton compte n'est pas encore relié à ta fiche : préviens le bureau."
          />
        ) : <EmptyState
          icon={<Package size={28} />}
          title="Aucune course sur cette période"
          description={voitTout && vue === 'moi'
            ? "Aucune course à ton nom. Passe sur « Tous les chauffeurs » pour voir l'équipe."
            : "Change de période avec les flèches, ou reviens à aujourd'hui."}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groupesAvecArrets.map(({ jour, duJour, arrets }) => (
            <section key={jour} className="flex flex-col gap-2">
              {/* En-tête de jour : inutile en mode « jour », le titre le dit déjà */}
              {mode !== 'jour' && (
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide first-letter:uppercase">
                  {libellePeriode(jour, 'jour')}
                </h2>
              )}

              {/* Véhicule du jour : ce qu'on prend au dépôt (vue « tous » : un par chauffeur, on ne l'affiche pas). */}
              {!afficherChauffeur && vehiculesDuJour(duJour).length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <Truck size={13} className="shrink-0" /> {vehiculesDuJour(duJour).join(' / ')}
                </p>
              )}

              <BandeauJour
                courses={duJour}
                arrets={arrets}
                tournee={tournees.find(t => t.date === jour) ?? null}
                depot={depot}
                appNav={appNav}
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
                  action={actionArret(a, tous)}
                  confirmer={suite => confirmerSiAutreJour(a.course.date, suite)}
                  onDemarrer={() => demarrer(a.course)}
                  onCharger={expediteur => charger(a.course, expediteur)}
                  onLivrer={(destinataire, preuve) => livrer(a.course, destinataire, preuve)}
                  onSignaler={(motif, note) => signaler(a.course, motif, note)}
                  prochain={prochain?.cle === a.cle}
                  afficherChauffeur={afficherChauffeur}
                  maintenant={maintenant}
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

      <ScannerTicket />

      <ConfirmDialog
        open={!!aConfirmer}
        title="Pas aujourd'hui"
        message={aConfirmer?.message ?? ''}
        confirmLabel="Oui, continuer"
        onConfirm={() => { const s = aConfirmer?.suite; setAConfirmer(null); s?.() }}
        onCancel={() => setAConfirmer(null)}
      />
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
function BandeauJour({ courses, arrets, tournee, depot, appNav, peutPiloter, onTourneeChangee }: {
  courses: CourseChauffeur[]
  /** Séquence des arrêts du jour, dans l'ordre de la route. */
  arrets: Array<ArretJour<CourseChauffeur>>
  tournee: TourneeChauffeur | null
  depot: { lat: number | null; lng: number | null }
  appNav: AppNavigation
  peutPiloter: boolean
  onTourneeChangee: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const [planOuvert, setPlanOuvert] = useState(false)
  const [busy, setBusy] = useState(false)

  // Courses de CETTE tournee, pas de la journee entiere. La nuance compte : un
  // president voit ici les courses de tout le monde (policy `deliveries_select_own`,
  // documentee dans mescourses.queries.ts), et un itineraire qui melangerait les
  // camions ne menerait nulle part.
  const coursesDeLaTournee = tournee ? courses.filter(c => c.tour_id === tournee.id) : []
  const arretsDeLaTournee = tournee ? arrets.filter(a => a.course.tour_id === tournee.id) : []

  // Une tournee dont aucun arret n'est visible ici n'a rien a dire au
  // chauffeur. Et sans tournee, pas de bandeau : le plan de chargement n'a de
  // sens que pour une tournee (des express avec retraits ailleurs se chargent
  // au fil des retraits, pas au depot).
  if (!tournee || arretsDeLaTournee.length === 0) return null

  // Meme compteur, meme sens que l'en-tete : « X faits sur N » (arrets).
  const { faits, total } = progression(arretsDeLaTournee)

  // ITINERAIRE : seulement ce qui RESTE, dans l'ordre de la route. Les points
  // geocodes (livraisons) partent en coordonnees ; un retrait n'a que son
  // adresse ecrite, que Google sait resoudre ; un arret sans rien est ignore.
  const restants = arretsDeLaTournee.filter(a => !a.fait)
  const etapes: EtapeItineraire[] = restants.flatMap((a): EtapeItineraire[] => {
    const c = a.course
    if (a.type === 'livraison' && c.delivery_lat != null && c.delivery_lng != null) {
      return [{ lat: c.delivery_lat, lng: c.delivery_lng }]
    }
    return a.adresse ? [{ adresse: a.adresse }] : []
  })
  const ignores = restants.length - etapes.length
  const depotGeocode = depot.lat != null && depot.lng != null
  const liens = itineraireEnLots(etapes, {
    eviterPeages: tournee.eviter_peages ?? false,
    retour: depotGeocode ? { lat: depot.lat as number, lng: depot.lng as number } : null,
  })

  // Le plan ne concerne que ce qui reste a livrer : replanifier le chargement
  // autour de colis deja deposes n'aurait aucun sens.
  const aLivrer = coursesDeLaTournee.filter(c => etapeCourante(c) !== 'terminee')

  const changerStatut = async (statut: 'en_cours' | 'terminee') => {
    setBusy(true)
    const { error } = await changerStatutTournee(tournee.id, statut)
    setBusy(false)
    if (error) { toast(traduireErreurEcriture(error), 'error'); return }
    toast(statut === 'en_cours' ? 'Tournée démarrée' : 'Tournée terminée')
    await onTourneeChangee()
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 border-b border-[var(--border)]">
        <Truck size={15} className="text-[var(--brand)] shrink-0" />
        <span className="text-sm font-medium text-[var(--text)]">
          Tournée · {libelleProgression(faits, total)}
        </span>
        {tournee.total_km != null && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Route size={12} /> {Number(tournee.total_km).toFixed(1)} km
          </span>
        )}
        {tournee.total_duration_min != null && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Clock size={12} /> {formatDuree(tournee.total_duration_min)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {/* Google Maps limite les etapes d'un lien : au-dela, un lien par lot,
            chaque lot repartant de la fin du precedent. */}
        {liens.map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-sm text-[var(--text)]
              hover:border-[var(--brand)] transition-colors no-underline">
            <ExternalLink size={16} /> Itinéraire{liens.length > 1 ? ` ${i + 1}/${liens.length}` : ''}
          </a>
        ))}

        {/* Le pilotage de la tournee n'apparait que si la base l'autorisera :
            meme condition que la policy `tours_update_perm`. */}
        {peutPiloter && canStartTour(tournee.status, coursesDeLaTournee.length) && (
          <Button variant="primary" className="min-h-11" disabled={busy}
            onClick={() => changerStatut('en_cours')}>
            {busy ? '…' : 'Démarrer la tournée'}
          </Button>
        )}
        {peutPiloter && canFinishTour(tournee.status) && (
          <Button variant="primary" className="min-h-11" disabled={busy}
            onClick={() => changerStatut('terminee')}>
            {busy ? '…' : 'Terminer la tournée'}
          </Button>
        )}

        {liens.length > 0 && (appNav !== 'google' || ignores > 0) && (
          <p className="w-full text-xs text-[var(--text-muted)]">
            {appNav !== 'google' && "Itinéraire complet dans Google Maps : Waze et Plans n'acceptent qu'une destination. "}
            {ignores > 0 && `${ignores} arrêt${ignores > 1 ? 's' : ''} sans adresse non inclus.`}
          </p>
        )}
      </div>

      {/* PLAN DE CHARGEMENT — l'inverse de l'ordre de livraison. */}
      {aLivrer.length > 1 && (
        <>
          <button type="button" onClick={() => setPlanOuvert(o => !o)} aria-expanded={planOuvert}
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left border-t border-[var(--border)]">
            <PackageOpen size={15} className="text-[var(--brand)] shrink-0" />
            <span className="text-sm font-medium text-[var(--text)] flex-1">
              Plan de chargement
            </span>
            <ChevronDown size={16}
              className={`text-[var(--text-muted)] shrink-0 transition-transform ${planOuvert ? 'rotate-180' : ''}`} />
          </button>
          {planOuvert && (
            <div className="px-3 pb-3">
              <p className="text-xs text-[var(--text-muted)] mb-2">
                Le camion se vide par une seule porte : ce qu'on charge en premier finit au fond.
                Le premier client livré se charge donc en dernier, contre la porte.
              </p>
              {/* Le poids total, la ou on decide si tout rentre. Les courses
                  non pesees sont annoncees separement : les compter pour zero
                  transformerait un minimum en total, et c'est exactement ce qui
                  fait passer un 3,5 t en surcharge. */}
              {libellePoids(poidsTotal(aLivrer)) && (
                <p className="text-sm font-medium text-[var(--text)] mb-2">
                  Charge : {libellePoids(poidsTotal(aLivrer))}
                </p>
              )}
              <ol className="flex flex-col gap-1.5">
                {planDeChargement(aLivrer).map(({ item, rangChargement, rangLivraison }) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full
                      bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-bold text-[var(--text)]">
                      {rangChargement}
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* CE QU'ON CHARGE, avant qui le recoit : devant la porte
                          du camion, la question est « c'est quoi et ca pese
                          combien », pas « c'est pour qui ». */}
                      <span className="block text-sm text-[var(--text)] break-words">
                        {item.description?.trim() || 'Sans description'}
                        {item.weight_kg != null && (
                          <span className="ml-1.5 font-mono text-xs text-[var(--brand)]">
                            {item.weight_kg} kg
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] break-words">
                        {item.clients?.name ?? '—'}
                        {item.pickup_address && ` · à prendre : ${item.pickup_address}`}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0 pt-1">
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
  arret, busy, documents, action, confirmer, onDemarrer, onCharger, onLivrer, onSignaler,
  premier, dernier, onDeplacer, appNav, prochain, afficherChauffeur, maintenant,
}: {
  arret: ArretJour<CourseChauffeur>
  busy: boolean
  documents: DocumentCourse[]
  /**
   * Le geste à faire ICI (`etapes.logic#actionArret`) : « Démarrer » une seule
   * fois par course, sur son premier arrêt ; « Charger » au retrait ;
   * « Livrer » à la livraison.
   */
  action: ActionArret | null
  /** Demande confirmation si la course n'est pas d'aujourd'hui, puis lance `suite`. */
  confirmer: (suite: () => void) => void
  onDemarrer: () => void
  onCharger: (expediteur: string | null) => void
  onLivrer: (destinataire: string | null, preuve: boolean) => void
  premier: boolean
  dernier: boolean
  onDeplacer: (sens: 'haut' | 'bas') => void
  /** Application de navigation choisie par le chauffeur. */
  appNav: AppNavigation
  onSignaler: (motif: string, note: string | null) => void
  /** C'est l'arrêt où aller maintenant : mis en avant. */
  prochain: boolean
  /** Vue « tous les chauffeurs » : dire à qui est l'arrêt. */
  afficherChauffeur: boolean
  maintenant: { jour: string; minutes: number }
}) {
  const c = arret.course
  const estRetrait = arret.type === 'retrait'
  const etape = etapeCourante(c)

  const [panneauOuvert, setPanneauOuvert] = useState(false)
  const [problemeOuvert, setProblemeOuvert] = useState(false)
  const probleme = aProblemeOuvert(c)
  const creneau = estRetrait
    ? libelleCreneauArret(c.creneau_retrait_debut, c.creneau_retrait_fin)
    : libelleCreneauArret(c.creneau_livraison_debut, c.creneau_livraison_fin)
  // URGENCE : rouge / orange UNIQUEMENT d'après la fin du créneau promis au
  // client. `arrival_time` n'est que l'estimation de la tournée : affichée en
  // gris, jamais en alerte.
  const horaire = !arret.fait
    ? etatHoraire(c.date, estRetrait ? c.creneau_retrait_fin : c.creneau_livraison_fin, maintenant)
    : null
  const estime = !estRetrait && !arret.fait ? libelleHeureEstimee(c.arrival_time) : null
  const [messagesOuverts, setMessagesOuverts] = useState(false)

  /**
   * LE BON NUMÉRO AU BON MOMENT.
   *
   * Au retrait, on appelle celui qui REMET ; à la livraison, celui qui REÇOIT.
   * Le téléphone du donneur d'ordre (client facturé) ne sert qu'en dernier
   * recours, et seulement pour APPELER : un SMS « je suis devant chez vous »
   * envoyé à une plateforme n'a pas de sens (`messageClient#contactArret`).
   */
  const contact = contactArret(arret.type, c)
  const lienAppel = lienTel(contact.tel)
  const peutEcrire = contact.smsPossible && !!lienSms(contact.tel, 'x')
  const messages = messagesPour(arret.type)

  // Coordonnées seulement pour l'adresse de LIVRAISON : `deliveries` ne géocode
  // qu'elle. Un point de retrait n'a que son texte.
  const lienNav = lienNavigation(
    appNav,
    !estRetrait && c.delivery_lat != null && c.delivery_lng != null
      ? { lat: c.delivery_lat, lng: c.delivery_lng }
      : { adresse: arret.adresse },
  )

  const LIBELLE: Record<'demarrer' | 'charger' | 'livrer', string> = {
    demarrer: 'Démarrer', charger: 'Charger', livrer: 'Livrer',
  }

  return (
    <article id={`arret-${arret.cle}`} className={`scroll-mt-4 rounded-[var(--r-lg)] border p-4 flex flex-col gap-3 ${
      arret.fait
        ? 'border-[var(--border)] opacity-55'
        : probleme ? 'border-[var(--danger)]'
        : prochain ? 'border-[var(--brand)] border-2'
        : 'border-[var(--border)]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
            estRetrait ? 'text-[var(--warning)]' : 'text-[var(--brand)]'
          }`}>
            {estRetrait ? <PackageOpen size={13} /> : <Flag size={13} />}
            {estRetrait ? 'Retrait' : 'Livraison'}
          </span>
          <p className="font-medium text-[var(--text)] break-words">{c.clients?.name ?? '—'}</p>
          {c.reference_client?.trim() && (
            <p className="text-xs text-[var(--text-muted)] break-words">Réf. {c.reference_client.trim()}</p>
          )}
          {afficherChauffeur && (
            <p className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <User size={12} /> {c.team_members?.full_name ?? 'Sans chauffeur'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* L'ordre se change tant qu'il reste quelque chose à faire ici —
              sauf dans une TOURNÉE : son ordre vient du bureau (optimisation,
              heures estimées) et les flèches l'écraseraient. */}
          {!arret.fait && !c.tour_id && !(premier && dernier) && (
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
          <Badge color={arret.annule ? 'danger' : arret.fait ? 'success' : estRetrait ? 'warning' : 'info'}>
            {arret.annule ? 'Annulée' : arret.fait ? 'Fait' : libelleEtat(c)}
          </Badge>
        </div>
      </div>

      {/* L'ADRESSE DE CET ARRÊT, en grand : c'est la seule information dont on
          a besoin devant le pare-brise. */}
      {arret.adresse ? (
        <p className="text-sm text-[var(--text)] break-words">{arret.adresse}</p>
      ) : (
        <p className="text-sm font-medium text-[var(--danger)]">
          Adresse manquante — à compléter au bureau
        </p>
      )}

      {/* HORAIRE, une seule horloge : le CRÉNEAU promis au client (coloré
          quand il presse) et, en gris, le passage estimé par la tournée. */}
      {!arret.fait && (creneau || c.urgent || estime) && (
        <p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {c.urgent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--r-pill)] bg-[var(--danger)]/15 text-[var(--danger)] text-xs font-medium">
              <Zap size={12} /> Urgent
            </span>
          )}
          {(creneau || estime) && <Clock size={14} className="text-[var(--text-muted)]" />}
          {creneau && (
            <span className={`font-medium ${
              horaire === 'retard' ? 'text-[var(--danger)]' : horaire === 'bientot' ? 'text-[var(--warning)]' : 'text-[var(--text)]'
            }`}>
              Créneau {creneau}
              {horaire === 'retard' && ' · en retard'}
              {horaire === 'bientot' && ' · moins d’une heure'}
            </span>
          )}
          {estime && (
            <span className="text-xs text-[var(--text-muted)]">
              {creneau ? '· ' : ''}Passage estimé {estime}
            </span>
          )}
        </p>
      )}

      {(c.description || c.weight_kg != null || c.nb_colis != null) && (
        <p className="text-xs text-[var(--text-muted)] break-words">
          {[
            c.nb_colis != null ? `${c.nb_colis} colis` : null,
            c.description,
            c.weight_kg != null ? `${c.weight_kg} kg` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* CONSIGNES du bureau : code, étage, horaires… Invisibles jusqu'ici. */}
      {c.notes?.trim() && !arret.fait && (
        <p className="flex items-start gap-2 p-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)]
          text-sm text-[var(--text)] whitespace-pre-line break-words">
          <Info size={15} className="text-[var(--brand)] shrink-0 mt-0.5" /> {c.notes.trim()}
        </p>
      )}

      {probleme && !arret.fait && (
        <div className="flex items-start gap-2 p-2.5 rounded-[var(--r-md)] border border-[var(--danger)]
          text-sm text-[var(--danger)] break-words">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            Signalé : {libelleMotif(c.probleme_motif)}
            {c.probleme_le && ` à ${new Date(c.probleme_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            {c.probleme_note && ` — ${c.probleme_note}`}
            <span className="block text-xs text-[var(--text-muted)]">
              Le bureau est prévenu. Tu peux encore livrer si le client revient.
            </span>
          </span>
        </div>
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

        {!arret.fait && etape !== 'terminee' && !panneauOuvert && !problemeOuvert && (
          <button type="button" onClick={() => setProblemeOuvert(true)} aria-label="Signaler un problème"
            className={`${boutonCls} !text-[var(--danger)]`}>
            <AlertTriangle size={16} /> Problème
          </button>
        )}

        {action && !panneauOuvert && !problemeOuvert && (
          <Button variant="primary" className="min-h-11 ml-auto" disabled={busy}
            onClick={() => confirmer(() => (action === 'demarrer' ? onDemarrer() : setPanneauOuvert(true)))}>
            {busy ? '…' : LIBELLE[action]}
          </Button>
        )}

        {arret.fait && !arret.annule && !estRetrait && c.pod_captured_at && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--success)]">
            <ShieldCheck size={14} /> Preuve
          </span>
        )}
      </div>

      {/* Dire QUI on appelle quand ce n'est pas le contact de cet arrêt :
          composer le numéro du donneur d'ordre en croyant joindre le
          destinataire fait perdre un appel et parfois la livraison. */}
      {lienAppel && !arret.fait && contact.source === 'donneur_ordre' && (
        <p className="text-xs text-[var(--text-disabled)]">
          Numéro du donneur d'ordre (pas de contact sur place).
        </p>
      )}

      {messagesOuverts && peutEcrire && (
        <div className="flex flex-wrap gap-2">
          {messages.map(m => {
            const lien = lienSms(contact.tel, m.texte(c.clients?.name ?? null))
            if (!lien) return null
            return (
              <a key={m.cle} href={lien} onClick={() => setMessagesOuverts(false)}
                className="inline-flex items-center min-h-10 px-3 rounded-[var(--r-md)]
                  border border-[var(--border-soft)] bg-[var(--bg-card)]
                  text-sm text-[var(--text)] no-underline
                  hover:border-[var(--brand)] transition-colors">
                {m.libelle}
              </a>
            )
          })}
        </div>
      )}

      {problemeOuvert && !arret.fait && (
        <PanneauProbleme
          courseId={c.id}
          busy={busy}
          onValider={(motif, note) => { setProblemeOuvert(false); onSignaler(motif, note) }}
          onAnnuler={() => setProblemeOuvert(false)}
        />
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
          onValider={(nom, preuve) => { setPanneauOuvert(false); onLivrer(nom, preuve) }}
          onAnnuler={() => setPanneauOuvert(false)}
        />
      )}
    </article>
  )
}

const flecheCls = `p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
  hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
  disabled:opacity-30 disabled:cursor-not-allowed transition-colors`

const boutonCls = `inline-flex items-center gap-1.5 min-h-11 px-3 rounded-[var(--r-md)]
  border border-[var(--border)] text-sm text-[var(--text)] no-underline
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

  // BOUTON FLOTTANT : toujours sous le pouce, sans occuper la liste. Le
  // ticket (péage, plein…) arrive à n'importe quel moment de la journée.
  const fermer = () => { if (!envoi) { setOuvert(false); setNote('') } }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
        className="hidden" onChange={choisir} />

      {/* Espace réservé en bas de liste : le bouton ne cache jamais le dernier arrêt. */}
      <div className="h-20" aria-hidden />

      {!ouvert && (
        <button onClick={() => setOuvert(true)} aria-label="Scanner un ticket"
          className="fixed z-20 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] lg:right-8 lg:bottom-8
            inline-flex items-center gap-2 h-14 pl-4 pr-5 rounded-full shadow-lg
            bg-[var(--brand)] text-white text-sm font-medium">
          <Camera size={20} /> Ticket
        </button>
      )}

      {ouvert && (
        <div className="fixed inset-0 z-30 flex items-end lg:items-center justify-center bg-black/50" onClick={fermer}>
          <div onClick={e => e.stopPropagation()}
            className="w-full lg:max-w-md flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]
              rounded-t-[var(--r-lg)] lg:rounded-[var(--r-lg)] bg-[var(--bg-card)] border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text)]">Scanner un ticket</span>
              <button onClick={fermer} disabled={envoi} aria-label="Fermer"
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text)]"><X size={18} /></button>
            </div>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="De quoi s'agit-il ? (péage A35, plein Movano…)"
              className="w-full min-h-11 px-3 rounded-[var(--r-md)] bg-[var(--bg)]
                border border-[var(--border)] text-[var(--text)] text-sm
                focus:outline-none focus:border-[var(--brand)]" />
            <Button variant="primary" className="min-h-12" onClick={() => inputRef.current?.click()} disabled={envoi}>
              <Camera size={16} /> {envoi ? 'Envoi…' : 'Prendre la photo'}
            </Button>
          </div>
        </div>
      )}
    </>
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
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
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
              className="flex items-center gap-2 min-h-11 px-3 rounded-[var(--r-md)] text-left
                border border-[var(--border)] bg-[var(--bg-deep)]
                hover:border-[var(--brand)] transition-colors disabled:opacity-50"
            >
              <span className="text-[var(--text-disabled)] shrink-0">
                {estImage ? <ImageIcon size={15} /> : <FileText size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--text)] truncate">{d.file_name}</span>
                <span className="block text-xs text-[var(--text-disabled)]">{libelleCategorieDocument(d.category)}</span>
              </span>
              {ouverture === d.id && (
                <span className="text-xs text-[var(--text-muted)] shrink-0">Ouverture…</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
