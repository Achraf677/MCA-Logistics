import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ChevronLeft, ChevronRight, ScanText, Trash2, ClipboardList, List, Map as IconeCarte, Route, LocateFixed,
  Undo2, RefreshCw, MapPinOff, Search, MapPin, Radio, Flag, ChevronDown, AlertTriangle, History,
} from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ScanFeuilleRoute } from '../../shared/ui/ScanFeuilleRoute'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import { LIBELLE_STATUT_TOURNEE, type ArretColis, type TourneeColis } from '../../shared/lib/tourneesColis'
import {
  arretsAPlacer, bandeauOrdre, deplacer, distanceM, doitEnvoyerPosition, grouperEnSuite, idsOrdreHabituel, libelleDistance, modeOrdre,
  nonTraites, ordreManuel, prochainDansOrdre, sansCalcul, sectionsListe, type PointCarte,
} from '../../shared/lib/tourneesColisRoute'
import {
  listerTourneesColis, arretsDesTournees, supprimerTourneeColis, nomsClients, calculerItineraire,
  ecrireOrdre, placerArret, chercherAdresse, photosArrets, cloturerTournee, preremplirJournee, envoyerPosition,
  effacerPosition,
} from '../../shared/lib/tourneesColis.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import type { EtatFiche, MaFiche } from './mescourses.types'
import { decalerJour, borneAujourdhui } from './espace.logic'
import { libelleDateCourte } from './mescourses.logic'
import { compteursTournee, libelleAdresse, libelleCompteurs } from './tourneeColis.logic'
import { ArretTournee } from './ArretTournee'
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

  useEffect(() => {
    let annule = false
    nomsClients(fiche.clients_messagerie).then(m => {
      if (!annule) setClients(fiche.clients_messagerie.map(id => ({ id, name: m.get(id) ?? 'Client' })))
    })
    return () => { annule = true }
  }, [fiche.clients_messagerie])

  const tournee = tournees.find(t => t.id === choisie) ?? null
  const arretsTournee = useMemo(() => arrets.filter(a => a.tournee_id === choisie), [arrets, choisie])
  const auj = aujourdhui()
  const estAujourdhui = date === auj

  const majArrets = (maj: ArretColis[]) => {
    const par = new Map(maj.map(a => [a.id, a]))
    setArrets(prev => prev.map(a => par.get(a.id) ?? a))
  }
  const majTournee = (t: Partial<TourneeColis> & { id: string }) =>
    setTournees(prev => prev.map(x => (x.id === t.id ? { ...x, ...t } : x)))

  const surGeste = (maj: ArretColis) => {
    majArrets([maj])
    if (tournee?.statut === 'a_faire' && maj.statut) majTournee({ id: tournee.id, statut: 'en_cours' })
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

      {scan && companyId ? (
        <Carte>
          <h2 className="text-base font-semibold text-[var(--text)]">Scanner ma feuille de route</h2>
          <ScanFeuilleRoute companyId={companyId} memberId={fiche.id} date={date} clients={clients}
            basCollant="bottom-[calc(4rem+env(safe-area-inset-bottom))]"
            onAnnuler={() => setScan(false)}
            onCree={id => { setScan(false); setChargement(true); recharger(id) }} />
        </Carte>
      ) : chargement ? (
        <Skeleton className="h-64" />
      ) : !tournee ? (
        <Carte>
          <EmptyState icon={<ClipboardList size={28} />} title="Pas de tournée ce jour"
            description="Photographie ta feuille de route (une photo par page) : le site en fait la liste de tes arrêts." />
          {estAujourdhui && (
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
            {estAujourdhui && (
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
  const { companyId } = useProfile()
  const [vue, setVue] = useState<'liste' | 'carte'>(() => (lirePref(CLE_VUE) === 'carte' ? 'carte' : 'liste'))
  const [calcul, setCalcul] = useState<null | 'tout' | 'restants' | 'ordre'>(null)
  const [moi, setMoi] = useState<{ lat: number; lng: number } | null>(null)
  const [point, setPoint] = useState<PointCarte | null>(null)
  const [aPlacerSur, setAPlacerSur] = useState<ArretColis | null>(null)
  const [photos, setPhotos] = useState<Map<string, DocumentRow[]>>(new Map())
  const [cloture, setCloture] = useState(false)
  const [clotureEnCours, setClotureEnCours] = useState(false)
  const [traitesOuverts, setTraitesOuverts] = useState(false)

  const verrouillee = tournee.statut === 'cloturee'
  const mode = modeOrdre(tournee)
  const c = useMemo(() => compteursTournee(arrets), [arrets])
  const lib = libelleCompteurs(c)
  const total = c.arrets + c.collectes
  const pct = total ? Math.round(((c.arretsTraites + c.collectesTraitees) / total) * 100) : 0
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

  const calculer = async (m: 'tout' | 'restants') => {
    setCalcul(m)
    const depart = m === 'restants' ? (moi ?? await positionUneFois()) : null
    if (m === 'restants' && !depart) {
      setCalcul(null)
      toast('Position indisponible : autorise la localisation, ou lance le calcul complet.', 'error')
      return
    }
    const { data, error } = await calculerItineraire({ tourneeId: tournee.id, mode: m, depart })
    setCalcul(null)
    if (error || !data) { toast(error?.message ?? 'Calcul impossible', 'error'); return }
    toast(data.message ?? `Itinéraire calculé : ${libelleDistance(data.km_total * 1000)}`, 'success')
    onRecharger()
  }

  const revenirCalcule = async () => {
    const ids = tournee.trajet?.ordre_ids
    if (!ids?.length) return
    setCalcul('ordre')
    const { error } = await ecrireOrdre(tournee.id, ordreManuel(arrets, 'route', ids.filter(id => arrets.some(a => a.id === id && !a.statut))), arrets.map(a => a.id), 'route')
    setCalcul(null)
    if (error) { toast(error.message, 'error'); onRecharger(); return }
    onRecharger()
  }

  const habituel = useMemo(() => idsOrdreHabituel(arrets), [arrets])
  const revenirHabituel = async () => {
    setCalcul('ordre')
    const { error } = await ecrireOrdre(tournee.id, ordreManuel(arrets, mode, habituel.filter(id => arrets.some(a => a.id === id && !a.statut))), arrets.map(a => a.id), 'habituel')
    setCalcul(null)
    if (error) toast(error.message, 'error')
    onRecharger()
  }

  const placer = async (a: ArretColis, pos: { lat: number; lng: number }) => {
    const { data, error } = await placerArret(a.id, pos)
    if (error || !data) { toast(error?.message ?? 'Placement impossible', 'error'); return }
    onArrets([data])
    setAPlacerSur(null)
    toast(sansCalcul(mode) ? 'Arrêt placé' : "Arrêt placé : recalcule l'itinéraire pour l'intégrer", 'success')
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

  const enregistrerOrdre = async (ids: string[]) => {
    const tous = ordreManuel(arrets, mode, [...(prochain ? [prochain.id] : []), ...ids])
    const place = new Map(tous.map((id, i) => [id, i + 1]))
    onArrets(arrets.map(a => ({ ...a, ordre: place.get(a.id) ?? null })))
    onTournee({ id: tournee.id, ordre_mode: 'manuel' })
    const { error } = await ecrireOrdre(tournee.id, tous, arrets.map(a => a.id), 'manuel')
    if (error) { toast(error.message, 'error'); onRecharger() }
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
    const j = companyId ? await preremplirJournee({ companyId, memberId: fiche.id, date: tournee.date, clientId: tournee.client_id }) : null
    setClotureEnCours(false)
    setCloture(false)
    onTournee(data)
    if (j?.error) toast(`Tournée terminée. Journée non préremplie : ${j.error.message}`, 'error')
    else if (j?.etat === 'creee' || j?.etat === 'mise_a_jour') toast('Tournée terminée. Ta journée de colis est préremplie : vérifie-la et envoie-la.', 'success')
    else if (j?.etat === 'deja_envoyee') toast("Tournée terminée. Ta journée est déjà envoyée : elle n'a pas été modifiée.", 'success')
    else if (j?.etat === 'deja_saisie') toast("Tournée terminée. Ta journée déjà saisie n'a pas été modifiée : vérifie les colis.", 'success')
    else toast('Tournée terminée', 'success')
  }

  const nt = nonTraites(arrets)
  const messageCloture = `${c.colisLivres} colis livrés · ${c.colisAttente} en attente · ${c.colisRetour} en retour.`
    + (nt ? ` Attention : ${nt} arrêt${nt > 1 ? 's' : ''} pas encore traité${nt > 1 ? 's' : ''} (compté${nt > 1 ? 's' : ''} en litige).` : '')
    + ' Ensuite, plus rien n’est modifiable (le bureau peut rouvrir).'

  return (
    <>
      {/* Compteur en tête, collé en haut pendant le défilement. */}
      <div className="sticky top-0 z-[5] -mx-1 px-1 pt-1 pb-2 bg-[var(--bg)]">
        <Carte className="gap-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Arrêts</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--text)]">{lib.arrets}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Colis</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--text)]">{lib.colis}</p>
              </div>
            </div>
            <Badge color={verrouillee ? 'muted' : tournee.statut === 'en_cours' ? 'info' : 'warning'}>
              {LIBELLE_STATUT_TOURNEE[tournee.statut]}
            </Badge>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden" aria-hidden>
            <div className="h-full bg-[var(--success)] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <span><strong className="text-[var(--success)]">{c.colisLivres}</strong> livrés</span>
            <span><strong className="text-[var(--warning)]">{c.colisAttente}</strong> en attente</span>
            <span><strong className="text-[var(--danger)]">{c.colisRetour}</strong> en retour</span>
            {c.collectes > 0 && <span>{c.collectesTraitees} / {c.collectes} collectes</span>}
          </p>
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Affichage">
            {([['liste', List, 'Liste'], ['carte', IconeCarte, 'Carte']] as const).map(([v, Ic, l]) => (
              <button key={v} type="button" role="tab" aria-selected={vue === v} onClick={() => changerVue(v)}
                className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] border text-sm font-medium ${
                  vue === v ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                <Ic size={16} /> {l}
              </button>
            ))}
          </div>
        </Carte>
      </div>

      {/* Ordre de passage : une ligne, gestes en pictogramme (le 1er calcul en clair). */}
      <Carte className="gap-2">
        <div className="flex items-center gap-2">
          <Route size={18} className="shrink-0 text-[var(--text-muted)]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text)] truncate">{bandeau.titre}</p>
            {bandeau.detail && <p className="text-xs text-[var(--text-muted)] truncate">{bandeau.detail}</p>}
          </div>
          {!verrouillee && !sansCalcul(mode) && habituel.length > 0 && (
            <BoutonIcone icone={History} libelle="Revenir à mon ordre habituel" disabled={calcul != null} onClick={revenirHabituel} />
          )}
          {!verrouillee && !sansCalcul(mode) && (
            <>
              {mode === 'manuel' && (tournee.trajet?.ordre_ids?.length ?? 0) > 0 && (
                <BoutonIcone icone={Undo2} libelle="Revenir à l'ordre calculé" disabled={calcul != null} onClick={revenirCalcule} />
              )}
              {c.arretsTraites + c.collectesTraitees > 0 && (
                <BoutonIcone icone={LocateFixed} libelle={calcul === 'restants' ? 'Calcul…' : 'Recalculer depuis ma position'}
                  disabled={calcul != null} onClick={() => calculer('restants')} />
              )}
              <BoutonIcone icone={RefreshCw} libelle={calcul === 'tout' ? 'Calcul…' : "Recalculer l'itinéraire"}
                disabled={calcul != null} onClick={() => calculer('tout')} />
            </>
          )}
        </div>
        {!verrouillee && sansCalcul(mode) && (
          <button type="button" disabled={calcul != null} onClick={() => calculer('tout')} className={boutonSecondaireCls}>
            <Route size={16} /> {calcul === 'tout' ? 'Calcul de l’itinéraire…' : "Calculer l'itinéraire"}
          </button>
        )}
        {calcul && !sansCalcul(mode) && <p className="text-xs text-[var(--text-muted)]">Calcul en cours…</p>}
        {bandeau.avertissement && (
          <p className="flex items-start gap-1.5 text-xs text-[var(--warning)]"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {bandeau.avertissement}</p>
        )}
        {horsOrdre > 0 && !verrouillee && (
          <p className="text-xs text-[var(--warning)]">
            {horsOrdre} arrêt{horsOrdre > 1 ? 's' : ''} pas dans l'ordre calculé : recalcule pour {horsOrdre > 1 ? 'les' : "l'"}intégrer.
          </p>
        )}
        {!verrouillee && estAujourdhui && <PartagePosition tournee={tournee} memberId={fiche.id} />}
      </Carte>

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
                  return (
                    <ArretTournee key={a.id} arret={actuel} tournee={tournee} verrouillee={verrouillee} onGeste={onGeste}
                      photos={photos.get(a.id)} onPhoto={surPhoto} />
                  )
                })}
              </ul>
            ) : null}
            onFermerPanneau={() => setPoint(null)} />
          {prochain && !verrouillee && !point && (
            <ul className="flex flex-col gap-2">
              <ProchainArret arret={prochain} tournee={tournee} moi={moi} onGeste={onGeste} photos={photos.get(prochain.id)} onPhoto={surPhoto} />
            </ul>
          )}
        </Suspense>
      ) : (
        <>
          {prochain && !verrouillee && (
            <ul className="flex flex-col gap-2">
              <ProchainArret arret={prochain} tournee={tournee} moi={moi} onGeste={onGeste} photos={photos.get(prochain.id)} onPhoto={surPhoto} />
            </ul>
          )}
          {groupes.map(g => (
            <section key={g.cle} className="flex flex-col gap-2">
              <h3 className="flex items-baseline gap-2 px-1 text-sm font-semibold text-[var(--text)]">
                <span className="flex-1 min-w-0 truncate">{g.commune}{g.cp ? ` ${g.cp}` : ''}</span>
                <span className="text-xs font-normal tabular-nums text-[var(--text-muted)]">{g.arrets.length} à faire</span>
              </h3>
              <ul className="flex flex-col gap-2">
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
          <p className="text-xs text-[var(--text-muted)]">
            {tournee.cloturee_le ? `Le ${new Date(tournee.cloturee_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. ` : ''}
            Plus rien n'est modifiable ; le bureau peut la rouvrir si besoin.
          </p>
          {tournee.client_id && onOuvrirJournee && (
            <button type="button" onClick={onOuvrirJournee} className={boutonSecondaireCls}>Voir ma journée de colis</button>
          )}
        </Carte>
      ) : (
        <button type="button" onClick={() => setCloture(true)} className={boutonPrimaireCls}>
          <Flag size={18} /> Terminer ma tournée
        </button>
      )}

      <ConfirmDialog open={cloture} title="Terminer ma tournée ?" message={messageCloture}
        confirmLabel="Terminer" loading={clotureEnCours}
        onConfirm={terminer} onCancel={() => setCloture(false)} />
    </>
  )
}

// ── Prochain arrêt ──────────────────────────────────────────────────────────

function ProchainArret({ arret, tournee, moi, onGeste, photos, onPhoto }: {
  arret: ArretColis
  tournee: TourneeColis
  moi: { lat: number; lng: number } | null
  onGeste: (a: ArretColis) => void
  photos?: DocumentRow[]
  onPhoto: (id: string, d: DocumentRow) => void
}) {
  const loin = moi && arret.lat != null && arret.lng != null ? distanceM(moi, { lat: arret.lat, lng: arret.lng }) : null
  return (
    <>
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
        Prochain arrêt{loin != null ? ` · à ${libelleDistance(loin)} (à vol d'oiseau)` : ''}
      </p>
      <ArretTournee arret={arret} tournee={tournee} verrouillee={false} onGeste={onGeste} photos={photos} onPhoto={onPhoto} enAvant />
    </>
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

  return (
    <div className="flex flex-col gap-0.5 pt-2 border-t border-[var(--border)]">
      <label className="flex items-center gap-3 min-h-11 cursor-pointer">
        <Radio size={18} className={actif ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
        <span className="flex-1 text-sm text-[var(--text)]">Partager ma position avec le bureau</span>
        <input type="checkbox" role="switch" checked={actif} onChange={basculer} className="w-6 h-6 accent-[var(--brand)]" />
      </label>
      {actif && (
        <p className="text-xs text-[var(--text-muted)]">
          {etat === 'refus' ? 'Position refusée par le téléphone : autorise la localisation pour ce site.'
            : 'Le bureau voit ta dernière position. Garde le site ouvert ; coupé à la fin de la tournée.'}
        </p>
      )}
    </div>
  )
}
