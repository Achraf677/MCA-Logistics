import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ChevronLeft, ChevronRight, ScanText, Trash2, ClipboardList, List, Map as IconeCarte, Undo2, LocateFixed,
  RefreshCw, ArrowDownUp, Info, Lock, ArrowUp, ArrowDown, ChevronsUp, MapPinOff, Search, MapPin, Radio, Flag, ChevronDown, AlertTriangle, Pause,
} from 'lucide-react'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ScanFeuilleRoute } from '../../shared/ui/ScanFeuilleRoute'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import { LIBELLE_STATUT_ARRET, type ArretColis, type TourneeColis } from '../../shared/lib/tourneesColis'
import {
  arretsAPlacer, bandeauOrdre, deplacer, doitEnvoyerPosition, grouperEnSuite, libelleDistance, modeOrdre,
  arretsDansOrdre, nonTraites, ordreInverse, ordreManuel, arretsEnPause, inclureEnPause, infosGroupes, libelleGroupe, cleGroupe, prochainDansOrdre, sansCalcul, sectionsListe, type PointCarte,
} from '../../shared/lib/tourneesColisRoute'
import {
  listerTourneesColis, arretsDesTournees, supprimerTourneeColis, nomsClients, calculerItineraire,
  majArret, ecrireOrdre, trouverScan, placerArret, chercherAdresse, photosArrets, cloturerTournee, envoyerPosition,
  effacerPosition, appliquerZones, tourneesABouclerDuSalarie,
} from '../../shared/lib/tourneesColis.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import type { EtatFiche, MaFiche } from './mescourses.types'
import { decalerJour, borneAujourdhui } from './espace.logic'
import { libelleDateCourte } from './mescourses.logic'
import { compteursTournee, libelleAdresse, libelleCompteurs } from './tourneeColis.logic'
import { ArretTournee, ArretEnPauseCompact, BarreProchain, FicheArret } from './ArretTournee'
import { RechercheAdresse } from './RechercheAdresse'
import { FeuilleAdresse } from '../../shared/ui/FeuilleAdresse'
import { ContexteAdresse } from './AdresseContexte'
import { FeuilleCloture } from './FeuilleCloture'
import { PhotosSynthese } from './PhotosSynthese'
import { Carte, MessageErreur, GardeFiche, champCls, boutonPrimaireCls, boutonSecondaireCls } from './EspaceCommun'

const CarteTournee = lazy(() => import('../../shared/ui/CarteTournee'))

const aujourdhui = () => toLocalISO(new Date())
const CLE_VUE = 'mca.maTournee.vue'
const CLE_PARTAGE = 'mca.maTournee.partagePosition'

function lirePref(cle: string): string | null {
  try { return localStorage.getItem(cle) } catch { return null }
}
function ecrirePref(cle: string, v: string | null) {
  try { if (v == null) localStorage.removeItem(cle); else localStorage.setItem(cle, v) } catch { /* stockage indisponible */ }
}

/** Position du téléphone, une fois (recalcul depuis ma position). */
function positionUneFois(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    )
  })
}

/**
 * Ma tournée (messagerie) : le salarié scanne sa feuille de route du matin (une photo par
 * page), vérifie les arrêts lus, puis les traite un par un. Ordre de la feuille, ou ordre par
 * la route (calculé sur les vraies routes), ou réglé à la main ; vue liste ou carte ; « Y aller »
 * ouvre l'application de navigation ; photo de preuve par arrêt ; « Terminer ma tournée »
 * clôture et préremplit la journée de colis.
 */
export function MaTournee({ fiche, onOuvrirJournee }: { fiche: EtatFiche; onOuvrirJournee?: () => void }) {
  return <GardeFiche fiche={fiche}>{f => <MaTourneeFiche fiche={f} onOuvrirJournee={onOuvrirJournee} />}</GardeFiche>
}

function MaTourneeFiche({ fiche, onOuvrirJournee }: { fiche: MaFiche; onOuvrirJournee?: () => void }) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [date, setDate] = useState(aujourdhui)
  const [tournees, setTournees] = useState<TourneeColis[]>([])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [arrets, setArrets] = useState<ArretColis[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [scan, setScan] = useState(false)
  const [reprendreScan, setReprendreScan] = useState<string | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [aSupprimer, setASupprimer] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const recharger = useCallback(async (garder?: string | null) => {
    setErreur(null)
    const t = await listerTourneesColis({ du: date, au: date, memberId: fiche.id })
    if (t.error) { setErreur(t.error.message); setTournees([]); setArrets([]); setChargement(false); return }
    setTournees(t.data)
    const ids = t.data.map(x => x.id)
    const a = await arretsDesTournees(ids)
    if (a.error) setErreur(a.error.message)
    setArrets(a.data)
    setChoisie(prev => {
      const cible = garder ?? prev
      return cible && ids.includes(cible) ? cible : (ids[ids.length - 1] ?? null)
    })
    setChargement(false)
  }, [date, fiche.id])

  useEffect(() => { setChargement(true); setScan(false); recharger() }, [recharger])
  // Une feuille envoyée avant (lecture en cours ou prête) : on la retrouve, même après avoir quitté l'onglet ou le site.
  useEffect(() => {
    let annule = false
    trouverScan(fiche.id).then(s => { if (!annule && s) { setReprendreScan(s.id); setScan(true) } })
    return () => { annule = true }
  }, [fiche.id])

  useEffect(() => {
    let annule = false
    nomsClients(fiche.clients_messagerie).then(m => {
      if (!annule) setClients(fiche.clients_messagerie.map(id => ({ id, name: m.get(id) ?? 'Client' })))
    })
    return () => { annule = true }
  }, [fiche.clients_messagerie])

  const tournee = tournees.find(t => t.id === choisie) ?? null
  const auj = aujourdhui()
  const estAujourdhui = date === auj

  // Tournées des jours passés pas terminées / sans photo de synthèse (depuis le 30/10/2026) : pas de nouveau scan avant.
  const [aBoucler, setABoucler] = useState<Array<{ id: string; date: string }>>([])
  useEffect(() => {
    let annule = false
    tourneesABouclerDuSalarie(fiche.id, auj).then(({ data }) => { if (!annule) setABoucler(data) })
    return () => { annule = true }
  }, [fiche.id, auj, date, tournees])
  const scanBloque = aBoucler.length > 0

  const arretsTournee = useMemo(() => arrets.filter(a => a.tournee_id === choisie), [arrets, choisie])
  const majArrets = (maj: ArretColis[]) => {
    const par = new Map(maj.map(a => [a.id, a]))
    setArrets(prev => prev.map(a => par.get(a.id) ?? a))
  }
  const majTournee = (t: Partial<TourneeColis> & { id: string }) =>
    setTournees(prev => prev.map(x => (x.id === t.id ? { ...x, ...t } : x)))

  const [annulation, setAnnulation] = useState<{ avant: ArretColis; libelle: string } | null>(null)
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const surGeste = (maj: ArretColis) => {
    const avant = arrets.find(a => a.id === maj.id)
    if (avant && maj.statut && avant.statut !== maj.statut) {
      setAnnulation({ avant, libelle: `${LIBELLE_STATUT_ARRET[maj.statut]} · ${libelleAdresse(maj)}` })
      if (minuterie.current) clearTimeout(minuterie.current)
      minuterie.current = setTimeout(() => setAnnulation(null), 8000)
    }
    majArrets([maj])
    if (tournee?.statut === 'a_faire' && maj.statut) majTournee({ id: tournee.id, statut: 'en_cours' })
  }

  const annuler = async () => {
    if (!annulation || !tournee) return
    const { avant } = annulation
    setAnnulation(null)
    const patch = avant.statut ? { statut: avant.statut, colis_remis: avant.colis_remis } : { statut: null, colis_remis: null }
    const { data, error } = await majArret(avant, patch, tournee)
    if (error || !data) { toast(error?.message ?? 'Annulation impossible', 'error'); return }
    majArrets([data])
  }

  const supprimer = async () => {
    if (!tournee) return
    setSuppression(true)
    const { error } = await supprimerTourneeColis(tournee.id)
    setSuppression(false)
    setASupprimer(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée supprimée', 'success')
    recharger(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BoutonIcone icone={ChevronLeft} libelle="Jour précédent" onClick={() => setDate(d => decalerJour(d, -1))} />
        <div className="flex-1 min-w-0 text-center">
          <span className="block text-base font-semibold text-[var(--text)] first-letter:uppercase">
            {estAujourdhui ? "Aujourd'hui" : libelleDateCourte(date)}
          </span>
          {!estAujourdhui && (
            <button onClick={() => setDate(auj)} className="text-xs text-[var(--brand)] underline min-h-7">
              Revenir à aujourd'hui
            </button>
          )}
        </div>
        <BoutonIcone icone={ChevronRight} libelle="Jour suivant" disabled={date >= auj}
          onClick={() => setDate(d => borneAujourdhui(decalerJour(d, 1), auj))} />
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {scanBloque ? (
        <div role="alert" className="flex flex-col gap-2 p-3 rounded-[var(--r-lg)] border-2 border-[var(--danger)] bg-[var(--bg-card)]">
          <p className="flex items-center gap-2 text-base font-bold text-[var(--text)]"><Lock size={18} /> Scan bloqué</p>
          <p className="text-sm text-[var(--text)]">Termine ta tournée du {libelleDateCourte(aBoucler[0].date)} avec la photo de la synthèse.</p>
          <button type="button" className={boutonSecondaireCls} onClick={() => setDate(aBoucler[0].date)}>
            Ouvrir la tournée du {libelleDateCourte(aBoucler[0].date)}
          </button>
        </div>
      ) : estAujourdhui && tournee?.statut !== 'cloturee' && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--r-lg)] border border-[var(--border-strong)] bg-[var(--bg-card)]">
          <Info size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
          <p className="text-sm text-[var(--text)]">Photo de la synthèse obligatoire pour terminer ta tournée.</p>
        </div>
      )}

      {scan && companyId ? (
        <Carte>
          <h2 className="text-base font-semibold text-[var(--text)]">Scanner ma feuille de route</h2>
          <ScanFeuilleRoute key={reprendreScan ?? 'nouveau'} companyId={companyId} memberId={fiche.id} date={date} clients={clients} reprendre={reprendreScan}
            basCollant="bottom-[calc(4rem+env(safe-area-inset-bottom))]"
            onAnnuler={() => { setScan(false); setReprendreScan(null) }}
            onCree={id => { setScan(false); setReprendreScan(null); setChargement(true); recharger(id) }} />
        </Carte>
      ) : chargement ? (
        <Skeleton className="h-64" />
      ) : !tournee ? (
        <Carte>
          <EmptyState icon={<ClipboardList size={28} />} title="Pas de tournée ce jour"
            description="Photographie ta feuille de route (une photo par page) : le site en fait la liste de tes arrêts." />
          {estAujourdhui && !scanBloque && (
            <button type="button" className={boutonPrimaireCls} onClick={() => setScan(true)}>
              <ScanText size={18} /> Scanner ma feuille de route
            </button>
          )}
        </Carte>
      ) : (
        <>
          {tournees.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tournées du jour">
              {tournees.map((t, i) => (
                <button key={t.id} role="tab" aria-selected={t.id === choisie} onClick={() => setChoisie(t.id)}
                  className={`min-h-10 px-3 rounded-[var(--r-md)] border text-sm font-medium ${t.id === choisie
                    ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                  Feuille {i + 1}{t.clients?.name ? ` · ${t.clients.name}` : ''}
                </button>
              ))}
            </div>
          )}
          <VueTournee key={tournee.id} tournee={tournee} arrets={arretsTournee} fiche={fiche} estAujourdhui={estAujourdhui}
            onGeste={surGeste} onArrets={majArrets} onTournee={majTournee} onRecharger={() => recharger(tournee.id)}
            onOuvrirJournee={onOuvrirJournee} />
          <div className="flex flex-wrap gap-2">
            {estAujourdhui && !scanBloque && (
              <button type="button" className={`${boutonSecondaireCls} flex-1`} onClick={() => setScan(true)}>
                <ScanText size={16} /> Scanner une autre feuille
              </button>
            )}
            {tournee.statut !== 'cloturee' && (
              <button type="button" className={`${boutonSecondaireCls} flex-1`} onClick={() => setASupprimer(true)}>
                <Trash2 size={16} /> Supprimer cette tournée
              </button>
            )}
          </div>
        </>
      )}

      {annulation && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+12rem)] z-40 px-3">
          <div className="mx-auto max-w-xl flex items-center gap-3 p-2 pl-4 rounded-[var(--r-lg)] border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-lg">
            <p className="flex-1 min-w-0 text-base font-semibold text-[var(--text)] truncate">{annulation.libelle}</p>
            <button type="button" onClick={annuler}
              className="min-h-14 px-5 inline-flex items-center gap-2 rounded-[var(--r-md)] bg-[var(--brand)] text-white text-base font-bold active:scale-[0.97]">
              <Undo2 size={20} /> Annuler
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog open={aSupprimer} title="Supprimer cette tournée ?"
        message="Les arrêts et ce que tu y as noté seront effacés. À faire seulement si le scan est raté."
        confirmLabel="Supprimer" loading={suppression}
        onConfirm={supprimer} onCancel={() => setASupprimer(false)} />
    </div>
  )
}

// ── Une tournée ─────────────────────────────────────────────────────────────

function VueTournee({ tournee, arrets, fiche, estAujourdhui, onGeste, onArrets, onTournee, onRecharger, onOuvrirJournee }: {
  tournee: TourneeColis
  arrets: ArretColis[]
  fiche: MaFiche
  estAujourdhui: boolean
  onGeste: (a: ArretColis) => void
  onArrets: (a: ArretColis[]) => void
  onTournee: (t: Partial<TourneeColis> & { id: string }) => void
  onRecharger: () => void
  onOuvrirJournee?: () => void
}) {
  const { toast } = useToast()
  const { companyId: societe } = useProfile()
  const [vue, setVue] = useState<'liste' | 'carte'>(() => (lirePref(CLE_VUE) === 'carte' ? 'carte' : 'liste'))
  const [calcul, setCalcul] = useState<null | 'tout' | 'restants' | 'suivre'>(null)
  const [moi, setMoi] = useState<{ lat: number; lng: number } | null>(null)
  const [point, setPoint] = useState<PointCarte | null>(null)
  const [aPlacerSur, setAPlacerSur] = useState<ArretColis | null>(null)
  const [photos, setPhotos] = useState<Map<string, DocumentRow[]>>(new Map())
  const [cloture, setCloture] = useState(false)
  const [clotureEnCours, setClotureEnCours] = useState(false)
  const [traitesOuverts, setTraitesOuverts] = useState(false)
  const [confirmerReset, setConfirmerReset] = useState(false)

  const verrouillee = tournee.statut === 'cloturee'
  const mode = modeOrdre(tournee)
  const c = useMemo(() => compteursTournee(arrets), [arrets])
  const lib = libelleCompteurs(c)
  const prochain = prochainDansOrdre(arrets, mode)
  const bandeau = bandeauOrdre(tournee)
  const aPlacer = useMemo(() => arretsAPlacer(arrets), [arrets])
  const prochainId = prochain?.id ?? null
  const couches = useMemo(() => [{ id: tournee.id, couleur: null, arrets, mode, trajet: tournee.trajet ?? null, prochainId }],
    [tournee.id, tournee.trajet, arrets, mode, prochainId])
  const horsOrdre = sansCalcul(mode) ? 0 : arrets.filter(a => !a.statut && a.lat != null && a.ordre == null).length

  // Photos de preuve des arrêts de la tournée.
  const idsArrets = useMemo(() => arrets.map(a => a.id).join(','), [arrets])
  useEffect(() => {
    let annule = false
    photosArrets(idsArrets ? idsArrets.split(',') : []).then(({ data }) => {
      if (annule) return
      const m = new Map<string, DocumentRow[]>()
      for (const d of data) if (d.entity_id) m.set(d.entity_id, [...(m.get(d.entity_id) ?? []), d])
      setPhotos(m)
    })
    return () => { annule = true }
  }, [idsArrets])
  const surPhoto = (id: string, doc: DocumentRow) => setPhotos(prev => new Map(prev).set(id, [...(prev.get(id) ?? []), doc]))

  const changerVue = (v: 'liste' | 'carte') => { setVue(v); ecrirePref(CLE_VUE, v); setPoint(null) }

  const calculer = async (m: 'tout' | 'restants' | 'suivre') => {
    setCalcul(m)
    // Les zones de Brumath connues du référentiel sont remplies avant le calcul (un bloc par zone).
    if (m !== 'suivre') await appliquerZones(tournee.id)
    const depart = m === 'restants' ? (moi ?? await positionUneFois()) : null
    if (m === 'restants' && !depart) {
      setCalcul(null)
      toast('Position indisponible : autorise la localisation, ou lance le calcul complet.', 'error')
      return
    }
    const { data, error } = await calculerItineraire({ tourneeId: tournee.id, mode: m, depart })
    setCalcul(null)
    if (error || !data) { toast(error?.message ?? 'Calcul impossible', 'error'); return }
    toast(data.message ?? `${m === 'suivre' ? 'Trajet recalculé' : 'Itinéraire calculé'} : ${libelleDistance(data.km_total * 1000)}`, 'success')
    onRecharger()
  }

  const placer = async (a: ArretColis, pos: { lat: number; lng: number }) => {
    const { data, error } = await placerArret(a.id, pos)
    if (error || !data) { toast(error?.message ?? 'Placement impossible', 'error'); return }
    onArrets([data])
    setAPlacerSur(null)
    toast(sansCalcul(mode) ? 'Arrêt placé' : "Arrêt placé : recalcule l'itinéraire pour l'intégrer", 'success')
  }

  // ── Recherche d'adresse : fiche d'un arrêt trouvé, ajout / correction d'une adresse ──
  const [ficheRecherche, setFicheRecherche] = useState<string | null>(null)
  const [adresseAModifier, setAdresseAModifier] = useState<ArretColis | null>(null)
  /** Une adresse ajoutée ou corrigée change l'itinéraire : on le recalcule (l'ordre manuel est gardé, seul le trajet suit). */
  const apresAdresse = (ajout: boolean) => {
    toast(ajout ? 'Adresse ajoutée à la tournée' : 'Adresse corrigée', 'success')
    if (sansCalcul(mode)) { onRecharger(); return }
    if (mode === 'manuel') { if (ajout) onRecharger(); else calculer('suivre'); return }
    calculer(c.arretsTraites + c.collectesTraitees > 0 ? 'restants' : 'tout')
  }

  // ── Ordre manuel : glisser-déposer par la poignée ──
  const [glisse, setGlisse] = useState<{ id: string; ordre: string[]; depart: string[] } | null>(null)
  const ordreAffiche = useMemo(() => {
    const s = sectionsListe(arrets, mode)
    const aFaire = s.aFaire.flatMap(g => g.arrets).filter(a => a.id !== prochain?.id)
    if (!glisse) return { aFaire, traites: s.traites }
    const par = new Map(arrets.map(a => [a.id, a]))
    return { aFaire: glisse.ordre.map(id => par.get(id)!).filter(Boolean), traites: s.traites }
  }, [arrets, mode, prochain?.id, glisse])
  const groupes = useMemo(() => grouperEnSuite(ordreAffiche.aFaire), [ordreAffiche.aFaire])
  const infos = useMemo(() => infosGroupes(arrets, mode), [arrets, mode])
  const enPause = useMemo(() => arretsEnPause(arrets, mode), [arrets, mode])

  /** Ordre choisi à la main (glisser, village déplacé, tournée inversée) : on l'enregistre, puis le trajet suit. */
  const appliquerOrdre = async (aFaireVisibles: string[]) => {
    // Les arrêts en pause sont cachés de la liste mais gardent leur place dans l'ordre.
    const aFaireIds = inclureEnPause(
      arretsDansOrdre(arrets, mode).filter(a => !a.statut).map(a => ({ id: a.id, enPause: !!a.en_pause_le })), aFaireVisibles)
    const tous = ordreManuel(arrets, mode, aFaireIds)
    const place = new Map(tous.map((id, i) => [id, i + 1]))
    onArrets(arrets.map(a => ({ ...a, ordre: place.get(a.id) ?? null })))
    onTournee({ id: tournee.id, ordre_mode: 'manuel' })
    const { error } = await ecrireOrdre(tournee.id, tous, arrets.map(a => a.id), 'manuel')
    if (error) { toast(error.message, 'error'); onRecharger(); return }
    await calculer('suivre')
  }
  /** Carte : « Viser » un arrêt = le passer en tête de l'ordre (il devient le prochain), le trajet suit. */
  const viser = async (a: ArretColis) => {
    const autres = [...(prochain ? [prochain.id] : []), ...ordreAffiche.aFaire.map(x => x.id)].filter(id => id !== a.id)
    setPoint(null)
    await appliquerOrdre([a.id, ...autres])
    toast('Arrêt visé : c\'est le prochain', 'success')
  }
  const enregistrerOrdre = (ids: string[]) => appliquerOrdre([...(prochain ? [prochain.id] : []), ...ids])

  // Tout ce qui reste à faire, village par village (le prochain arrêt compris).
  const groupesComplets = useMemo(
    () => grouperEnSuite([...(prochain ? [prochain] : []), ...ordreAffiche.aFaire]),
    [prochain, ordreAffiche.aFaire])
  const inverser = () => appliquerOrdre(ordreInverse(arrets, mode))
  const deplacerVillage = (idArret: string, vers: 'premier' | 'haut' | 'bas') => {
    const i = groupesComplets.findIndex(g => g.arrets.some(a => a.id === idArret))
    if (i < 0) return
    const j = vers === 'premier' ? 0 : vers === 'haut' ? i - 1 : i + 1
    if (j < 0 || j >= groupesComplets.length || j === i) return
    appliquerOrdre(deplacer(groupesComplets, i, j).flatMap(g => g.arrets.map(a => a.id)))
  }

  const poignee = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const ids = ordreAffiche.aFaire.map(a => a.id)
      setGlisse({ id, ordre: ids, depart: ids })
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!glisse || glisse.id !== id) return
      const y = e.clientY
      if (y < 80) window.scrollBy(0, -14)
      else if (y > window.innerHeight - 120) window.scrollBy(0, 14)
      const autres = glisse.ordre.filter(x => x !== id)
      let cible = autres.length
      for (let i = 0; i < autres.length; i++) {
        const r = document.getElementById(`arret-${autres[i]}`)?.getBoundingClientRect()
        if (r && y < r.top + r.height / 2) { cible = i; break }
      }
      const de = glisse.ordre.indexOf(id)
      if (de !== cible) setGlisse({ ...glisse, ordre: deplacer(glisse.ordre, de, cible) })
    },
    onPointerUp: () => {
      if (!glisse) return
      const fin = glisse.ordre
      const change = fin.some((x, i) => x !== glisse.depart[i])
      setGlisse(null)
      if (change) enregistrerOrdre(fin)
    },
    onPointerCancel: () => setGlisse(null),
  })

  const terminer = async () => {
    setClotureEnCours(true)
    const { data, error } = await cloturerTournee(tournee.id)
    if (error || !data) { setClotureEnCours(false); toast(error?.message ?? 'Clôture impossible', 'error'); return }
    if (lirePref(CLE_PARTAGE) === tournee.id) ecrirePref(CLE_PARTAGE, null)
    setClotureEnCours(false)
    setCloture(false)
    onTournee(data)
    toast('Tournée terminée', 'success')
  }

  const nt = nonTraites(arrets)
  const messageCloture = `${c.colisLivres} colis livrés · ${c.colisAttente} en attente · ${c.colisRetour} en retour.`
    + (nt ? ` Attention : ${nt} arrêt${nt > 1 ? 's' : ''} pas encore traité${nt > 1 ? 's' : ''}${enPause.length ? ` dont ${enPause.length} en pause` : ''} (compté${nt > 1 ? 's' : ''} en litige).` : '')
    + ' Ensuite, plus rien n’est modifiable (le bureau peut rouvrir).'

  return (
    <ContexteAdresse.Provider value={verrouillee ? null : setAdresseAModifier}>
      {/* Bandeau du haut, collé pendant le défilement : avancement, puis tous les gestes avec leur nom. */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 py-2 bg-[var(--bg)] border-b border-[var(--border)]">
        <RechercheAdresse tournee={tournee} arrets={arrets} verrouillee={verrouillee}
          onOuvrir={a => setFicheRecherche(a.id)}
          onAjoute={() => apresAdresse(true)}
          onModifier={setAdresseAModifier} />
        <p className="flex items-baseline gap-x-3 flex-wrap text-xl font-bold tabular-nums text-[var(--text)]">
          <span>{lib.arrets} <span className="text-sm font-medium text-[var(--text-muted)]">arrêts</span></span>
          {tournee.trajet && !sansCalcul(mode) && <span>{libelleDistance(tournee.trajet.km_total * 1000)}</span>}
          {calcul && <span className="text-sm font-medium text-[var(--text-muted)]">Calcul…</span>}
        </p>
        <div className="grid grid-flow-col auto-cols-fr gap-1" role="toolbar" aria-label="Gestes de la tournée">
          {([['liste', List, 'Liste'], ['carte', IconeCarte, 'Carte']] as const).map(([v, Ic, l]) => (
            <BtnHaut key={v} icone={Ic} libelle={l} actif={vue === v} onClick={() => changerVue(v)} />
          ))}
          {!verrouillee && (
            <>
              <BtnHaut icone={RefreshCw} libelle="Recalculer" titre="Recalculer le meilleur ordre (village par village, zone par zone)" tourne={calcul === 'tout'}
                disabled={calcul != null} onClick={() => (mode === 'manuel' ? setConfirmerReset(true) : calculer('tout'))} />
              <BtnHaut icone={ArrowDownUp} libelle="Par la fin" titre="Commencer par la fin : inverser la tournée"
                disabled={calcul != null || groupesComplets.length < 2} onClick={inverser} />
              {c.arretsTraites + c.collectesTraitees > 0 && !sansCalcul(mode) && (
                <BtnHaut icone={LocateFixed} libelle="Depuis ici" titre="Recalculer depuis ma position" disabled={calcul != null} onClick={() => calculer('restants')} />
              )}
              {estAujourdhui && <PartagePosition tournee={tournee} memberId={fiche.id} />}
            </>
          )}
        </div>
        {!verrouillee && horsOrdre > 0 && (
          <p className="text-sm text-[var(--warning)]">
            {horsOrdre} arrêt{horsOrdre > 1 ? 's' : ''} hors itinéraire : touche « Recalculer ».
          </p>
        )}
        {!verrouillee && bandeau.avertissement && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {bandeau.avertissement}</p>
        )}
        {!verrouillee && enPause.length > 0 && (
          <section className="flex flex-col gap-1.5 max-h-[35vh] overflow-y-auto" aria-label="Arrêts en pause">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--warning)]">
              <Pause size={16} /> En pause <span className="tabular-nums">({enPause.length})</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {enPause.map(a => (
                <ArretEnPauseCompact key={a.id} arret={a} tournee={tournee} onGeste={onGeste}
                  photos={photos.get(a.id)} onPhoto={surPhoto} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {!verrouillee && aPlacer.length > 0 && (
        <APlacer arrets={aPlacer} onSurCarte={a => { setAPlacerSur(a); changerVue('carte') }} onPlacer={placer} />
      )}

      {vue === 'carte' ? (
        <Suspense fallback={<Skeleton className="h-[60vh]" />}>
          <CarteTournee
            couches={couches}
            maPosition onPosition={setMoi}
            onPoint={p => setPoint(p)}
            placement={aPlacerSur ? {
              libelle: `${libelleAdresse(aPlacerSur)}, ${aPlacerSur.commune}`,
              onPlacer: pos => placer(aPlacerSur, pos), onAnnuler: () => setAPlacerSur(null),
            } : null}
            panneau={point && !aPlacerSur ? (
              <ul className="flex flex-col gap-2">
                {point.arrets.map(a => {
                  const actuel = arrets.find(x => x.id === a.id) ?? a
                  // Arrêt à faire : même barre que le point actuel (Y aller, Livré, Pause…) + « Viser ».
                  if (!verrouillee && !actuel.statut && !actuel.en_pause_le) {
                    return (
                      <li key={a.id}>
                        <BarreProchain arret={actuel} tournee={tournee} onGeste={onGeste} enCarte
                          photos={photos.get(a.id)} onPhoto={surPhoto}
                          onViser={actuel.id === prochain?.id ? undefined : () => viser(actuel)} />
                      </li>
                    )
                  }
                  return (
                    <ArretTournee key={a.id} arret={actuel} tournee={tournee} verrouillee={verrouillee} onGeste={onGeste}
                      photos={photos.get(a.id)} onPhoto={surPhoto} />
                  )
                })}
              </ul>
            ) : null}
            onFermerPanneau={() => setPoint(null)} />
        </Suspense>
      ) : (
        <>
          {groupes.map(g => (
            <section key={g.cle} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 px-2 py-1 rounded-[var(--r-md)] text-sm font-semibold text-[var(--text)] border-l-[6px]"
                style={{ borderLeftColor: infos.get(cleGroupe(g))?.couleur, background: `color-mix(in srgb, ${infos.get(cleGroupe(g))?.couleur ?? 'transparent'} 14%, transparent)` }}>
                <span className="flex-1 min-w-0 truncate">{libelleGroupe(g.commune, g.zone)}{g.cp ? ` ${g.cp}` : ''}</span>
                <span className="text-xs font-normal tabular-nums text-[var(--text-muted)]">{g.arrets.length} à faire</span>
                {!verrouillee && !glisse && groupesComplets.length > 1 && (() => {
                  const i = groupesComplets.findIndex(x => x.arrets.some(a => a.id === g.arrets[0].id))
                  return (
                    <span className="flex gap-1">
                      <BoutonIcone icone={ChevronsUp} libelle={`Passer ${libelleGroupe(g.commune, g.zone)} en premier`} disabled={calcul != null || i <= 0} onClick={() => deplacerVillage(g.arrets[0].id, 'premier')} />
                      <BoutonIcone icone={ArrowUp} libelle={`Monter ${libelleGroupe(g.commune, g.zone)}`} disabled={calcul != null || i <= 0} onClick={() => deplacerVillage(g.arrets[0].id, 'haut')} />
                      <BoutonIcone icone={ArrowDown} libelle={`Descendre ${libelleGroupe(g.commune, g.zone)}`} disabled={calcul != null || i < 0 || i >= groupesComplets.length - 1} onClick={() => deplacerVillage(g.arrets[0].id, 'bas')} />
                    </span>
                  )
                })()}
              </h3>
              <ul className="flex flex-col gap-2 pl-2 border-l-[3px]" style={{ borderLeftColor: infos.get(cleGroupe(g))?.couleur }}>
                {g.arrets.map(a => (
                  <ArretTournee key={a.id} arret={a} tournee={tournee} verrouillee={verrouillee} onGeste={onGeste}
                    photos={photos.get(a.id)} onPhoto={surPhoto} poignee={poignee(a.id)} glisse={glisse?.id === a.id} />
                ))}
              </ul>
            </section>
          ))}
          {ordreAffiche.traites.length > 0 && (
            <section className="flex flex-col gap-2">
              <button type="button" onClick={() => setTraitesOuverts(o => !o)} aria-expanded={traitesOuverts}
                className="min-h-11 px-1 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <ChevronDown size={16} className={`transition-transform ${traitesOuverts ? '' : '-rotate-90'}`} />
                <span className="flex-1 text-left">Traités</span>
                <span className="text-xs font-normal tabular-nums text-[var(--text-muted)]">{ordreAffiche.traites.length}</span>
              </button>
              {traitesOuverts && (
                <ul className="flex flex-col gap-2">
                  {ordreAffiche.traites.map(a => (
                    <ArretTournee key={a.id} arret={a} tournee={tournee} verrouillee={verrouillee} onGeste={onGeste}
                      photos={photos.get(a.id)} onPhoto={surPhoto} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {verrouillee ? (
        <Carte className="gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Flag size={16} /> Tournée terminée</p>
          {tournee.cloturee_le && (
            <p className="text-sm text-[var(--text-muted)]">
              {new Date(tournee.cloturee_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}
          <p className="text-sm font-semibold text-[var(--text)] mt-1">Photos de la synthèse</p>
          <PhotosSynthese tourneeId={tournee.id} companyId={societe} modifiable={false} />
          {tournee.client_id && onOuvrirJournee && (
            <button type="button" onClick={onOuvrirJournee} className={boutonSecondaireCls}>Voir ma journée de colis</button>
          )}
        </Carte>
      ) : (
        <button type="button" onClick={() => setCloture(true)} className={`${boutonPrimaireCls} min-h-14 text-base`}>
          <Flag size={20} /> Terminer ma tournée
        </button>
      )}

      {prochain && !verrouillee && !point && !aPlacerSur && (
        <>
          <div aria-hidden className="h-52" />
          <BarreProchain key={prochain.id} arret={prochain} tournee={tournee} onGeste={onGeste}
            photos={photos.get(prochain.id)} onPhoto={surPhoto} />
        </>
      )}

      <ConfirmDialog open={confirmerReset} title="Recalculer la tournée ?"
        message="Ton ordre est remplacé par le meilleur ordre calculé, village par village (zone par zone à Brumath)."
        confirmLabel="Recalculer" onConfirm={() => { setConfirmerReset(false); calculer('tout') }} onCancel={() => setConfirmerReset(false)} />
      {cloture && (
        <FeuilleCloture tourneeId={tournee.id} companyId={societe} resume={messageCloture} enCours={clotureEnCours}
          onTerminer={terminer} onFermer={() => setCloture(false)} />
      )}
      {ficheRecherche && (() => {
        const a = arrets.find(x => x.id === ficheRecherche)
        return a ? <FicheArret arret={a} tournee={tournee} onGeste={onGeste} photos={photos.get(a.id)} onPhoto={surPhoto} onFermer={() => setFicheRecherche(null)} /> : null
      })()}
      {adresseAModifier && (
        <FeuilleAdresse tournee={tournee} arrets={arrets} arret={adresseAModifier} onFermer={() => setAdresseAModifier(null)}
          onFait={a => { setAdresseAModifier(null); onArrets([a]); apresAdresse(false) }} />
      )}
    </ContexteAdresse.Provider>
  )
}

// ── Arrêts à placer ─────────────────────────────────────────────────────────

function APlacer({ arrets, onSurCarte, onPlacer }: {
  arrets: ArretColis[]
  onSurCarte: (a: ArretColis) => void
  onPlacer: (a: ArretColis, pos: { lat: number; lng: number }) => Promise<void>
}) {
  const { toast } = useToast()
  const [deplie, setDeplie] = useState(false)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [adresse, setAdresse] = useState('')
  const [cherche, setCherche] = useState(false)

  const chercher = async (a: ArretColis) => {
    setCherche(true)
    const pos = await chercherAdresse(adresse)
    setCherche(false)
    if (!pos) { toast('Adresse introuvable : précise-la, ou place l’arrêt sur la carte.', 'error'); return }
    await onPlacer(a, pos)
    setOuvert(null)
  }

  return (
    <Carte className="gap-2 border-[var(--warning)]">
      <button type="button" onClick={() => setDeplie(d => !d)} aria-expanded={deplie}
        className="min-h-11 flex items-center gap-2 text-left">
        <MapPinOff size={16} className="shrink-0 text-[var(--warning)]" />
        <span className="flex-1 text-sm font-semibold text-[var(--text)]">
          {arrets.length} arrêt{arrets.length > 1 ? 's' : ''} sans adresse trouvée
        </span>
        <span className="text-sm text-[var(--brand)]">{deplie ? 'Fermer' : 'Placer'}</span>
      </button>
      {deplie && (
      <ul className="flex flex-col gap-2">
        {arrets.map(a => (
          <li key={a.id} className="flex flex-col gap-2 p-2 rounded-[var(--r-md)] border border-[var(--border)]">
            <p className="text-sm text-[var(--text)]">{libelleAdresse(a)} <span className="text-[var(--text-muted)]">· {a.commune}</span></p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSurCarte(a)} className={`${boutonSecondaireCls} flex-1`}>
                <MapPin size={16} /> Sur la carte
              </button>
              <button type="button" onClick={() => { setOuvert(o => (o === a.id ? null : a.id)); setAdresse(`${libelleAdresse(a)}, ${a.cp ?? ''} ${a.commune}`.replace(/\s+/g, ' ')) }}
                className={`${boutonSecondaireCls} flex-1`}>
                <Search size={16} /> Par l'adresse
              </button>
            </div>
            {ouvert === a.id && (
              <div className="flex gap-2">
                <input value={adresse} onChange={e => setAdresse(e.target.value)} aria-label="Adresse à chercher" className={champCls} />
                <button type="button" disabled={cherche || adresse.trim().length < 4} onClick={() => chercher(a)} className={boutonSecondaireCls}>
                  {cherche ? '…' : 'Chercher'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      )}
    </Carte>
  )
}

// ── Partage de position avec le bureau (lot 3) ──────────────────────────────

/**
 * Interrupteur « Partager ma position ». Seulement pendant SA tournée du jour, coupé à la
 * clôture : le bureau ne voit que la DERNIÈRE position (pas d'historique), mise à jour toutes
 * les 30 s environ. Le choix est retenu sur le téléphone pour cette tournée.
 */
function PartagePosition({ tournee, memberId }: { tournee: TourneeColis; memberId: string }) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [actif, setActif] = useState(() => lirePref(CLE_PARTAGE) === tournee.id)
  const [etat, setEtat] = useState<'attente' | 'ok' | 'refus'>('attente')
  const dernier = useRef<{ t: number; lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!actif || !companyId || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude }
        const t = Date.now()
        setEtat('ok')
        if (!doitEnvoyerPosition(dernier.current, t, pos)) return
        dernier.current = { t, ...pos }
        envoyerPosition({ companyId, memberId, tourneeId: tournee.id, ...pos, precision: p.coords.accuracy })
      },
      () => setEtat('refus'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [actif, companyId, memberId, tournee.id])

  const basculer = async () => {
    if (actif) {
      setActif(false); ecrirePref(CLE_PARTAGE, null); dernier.current = null
      const { error } = await effacerPosition(memberId)
      if (error) toast(error.message, 'error')
    } else {
      setActif(true); setEtat('attente'); ecrirePref(CLE_PARTAGE, tournee.id)
    }
  }

  const couleur = actif ? (etat === 'refus' ? 'var(--danger)' : 'var(--success)') : undefined
  return (
    <button type="button" onClick={basculer} aria-pressed={actif}
      aria-label={actif ? 'Arrêter de partager ma position' : 'Partager ma position avec le bureau'}
      title={actif ? (etat === 'refus' ? 'Localisation refusée : autorise-la dans le navigateur.' : 'Position partagée avec le bureau') : 'Partager ma position'}
      style={couleur ? { color: couleur, borderColor: couleur } : undefined}
      className={`relative min-h-14 min-w-0 px-0.5 flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] border ${actif ? '' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
      <Radio size={20} />
      <span className="text-[10px] leading-none font-medium tracking-tighter whitespace-nowrap">{actif ? 'Partagée' : 'Partager'}</span>
      {actif && etat !== 'refus' && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--success)]" />}
    </button>
  )
}

/** Bouton du bandeau du haut : pictogramme + petit nom dessous. */
function BtnHaut({ icone: Icone, libelle, titre, onClick, disabled, tourne, actif }: {
  icone: React.ComponentType<{ size?: number; className?: string }>; libelle: string; titre?: string
  onClick: () => void; disabled?: boolean; tourne?: boolean; actif?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={titre ?? libelle} title={titre ?? libelle} aria-pressed={actif}
      className={`min-h-14 min-w-0 px-0.5 flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] border disabled:opacity-40 ${
        actif ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
      <Icone size={20} className={tourne ? 'animate-spin' : ''} />
      <span className="text-[10px] leading-none font-medium tracking-tighter whitespace-nowrap">{libelle}</span>
    </button>
  )
}
