import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Download, Map as IconeCarte, PackageCheck, Pause, Radio, Route, RotateCcw,
  ScanText, FileText, Camera, Trash2, TriangleAlert, Truck, Undo2, Gauge,
} from 'lucide-react'
import { useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Drawer } from '../../shared/ui/Drawer'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Field } from '../../shared/ui/Field'
import { FeuilleAdresse } from '../../shared/ui/FeuilleAdresse'
import { FeuilleCollecte } from '../../shared/ui/FeuilleCollecte'
import { ScanFeuilleRoute } from '../../shared/ui/ScanFeuilleRoute'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { toLocalISO } from '../../shared/lib/dates'
import { downloadCSV } from '../../shared/lib/download'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { LIBELLE_STATUT_TOURNEE, type ArretColis, type TourneeColis } from '../../shared/lib/tourneesColis'
import {
  arretsDesTournees, calculerItineraire, feuillesDeRoute, listerTourneesColis, membresPourTournee, nomsClients,
  photosSynthese, positionsLivreurs, rouvrirTournee, supprimerTourneeColis, trouverScan, urlPhotoArret,
  type PositionLivreur,
} from '../../shared/lib/tourneesColis.queries'
import { ilYA, libelleDistance, modeOrdre, positionAncienne, prochainDansOrdre } from '../../shared/lib/tourneesColisRoute'
import { ListeTourneeColis } from './ListeTourneeColis'
import { SuiviColis } from './SuiviColis'
import { colorForIndex } from './tours.palette'
import {
  construireLignes, csvTournees, dateDepuisParam, decalerJour, filtrerTournees, resumeTournees,
  type FiltreTournees, type LigneTournee,
} from './tournees.logic'

const CarteTournee = lazy(() => import('../../shared/ui/CarteTournee'))

type Membre = { id: string; full_name: string; clients_messagerie: string[] }
type OngletDetail = 'arrets' | 'feuille' | 'synthese'

const inputCls = 'field'

/**
 * Onglet Tournées (bureau) : les tournées de colis d'un jour — une ligne par feuille de route scannée.
 * Tuiles cliquables (filtre), salarié, recherche, carte du jour avec positions, export CSV, et un tiroir par
 * tournée (arrêts à corriger · feuille de route scannée · photos de synthèse). Le bureau peut aussi
 * scanner la feuille d'un salarié. Plus d'express ici : les courses express se gèrent dans Planning.
 */
export function Tournees() {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutScanner = can('planning.tournees', 'update')
  const peutSupprimer = can('planning.tournees', 'delete')

  // `?date=AAAA-MM-JJ` (résumé du jour du Planning) : lu au montage, ensuite le sélecteur commande.
  const [params] = useSearchParams()
  const [date, setDate] = useState(() => dateDepuisParam(params.get('date')) ?? toLocalISO(new Date()))
  const estAujourdhui = date === toLocalISO(new Date())
  const [vue, setVue] = useState<'tournees' | 'suivi'>('tournees')

  const [tournees, setTournees] = useState<TourneeColis[]>([])
  const [arrets, setArrets] = useState<ArretColis[]>([])
  const [syntheses, setSyntheses] = useState<Map<string, DocumentRow[]>>(new Map())
  const [feuilles, setFeuilles] = useState<Map<string, DocumentRow[]>>(new Map())
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(false)

  const [filtre, setFiltre] = useState<FiltreTournees>('toutes')
  const [membreFiltre, setMembreFiltre] = useState('')
  const [q, setQ] = useState('')

  const [carte, setCarte] = useState(false)
  const [masques, setMasques] = useState<Set<string>>(new Set())
  const [positions, setPositions] = useState<PositionLivreur[]>([])
  const [maintenant, setMaintenant] = useState(() => Date.now())

  const [detailId, setDetailId] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<OngletDetail>('arrets')
  const [adresseEdit, setAdresseEdit] = useState<ArretColis | null>(null)
  const [collecteSur, setCollecteSur] = useState<ArretColis | null>(null)
  const [adresseAjout, setAdresseAjout] = useState(false)
  const [aRecalculerListe, setARecalculerListe] = useState(false)
  const [calcul, setCalcul] = useState<string | null>(null)
  const [aCalculer, setACalculer] = useState<TourneeColis | null>(null)
  const [aRouvrir, setARouvrir] = useState<TourneeColis | null>(null)
  const [aSupprimer, setASupprimer] = useState<TourneeColis | null>(null)
  const [suppression, setSuppression] = useState(false)

  const [scanOuvert, setScanOuvert] = useState(false)
  const [membres, setMembres] = useState<Membre[]>([])
  const [membreId, setMembreId] = useState('')
  // Scan déjà envoyé pour ce salarié (undefined = recherche en cours) : on le retrouve au lieu d'en refaire un.
  const [scanMembre, setScanMembre] = useState<string | null | undefined>(undefined)
  const [noms, setNoms] = useState<Map<string, string>>(new Map())

  const demande = useRef(0)
  const recharger = useCallback(async () => {
    const n = ++demande.current
    const t = await listerTourneesColis({ du: date, au: date })
    if (n !== demande.current) return
    setCharge(true)
    if (t.error) { setErreur(t.error.message); setTournees([]); setArrets([]); return }
    const ids = t.data.map(x => x.id)
    const [a, ph, fe] = await Promise.all([arretsDesTournees(ids), photosSynthese(ids), feuillesDeRoute(ids)])
    if (n !== demande.current) return
    if (a.error) { setErreur(a.error.message); return }
    setErreur(null)
    setTournees(t.data)
    setArrets(a.data)
    const parTournee = (docs: DocumentRow[]) => {
      const m = new Map<string, DocumentRow[]>()
      for (const d of docs) if (d.entity_id) m.set(d.entity_id, [...(m.get(d.entity_id) ?? []), d])
      return m
    }
    setSyntheses(parTournee(ph.data))
    setFeuilles(parTournee(fe.data))
  }, [date])

  useEffect(() => {
    setCharge(false); setFiltre('toutes'); setMembreFiltre(''); setDetailId(null)
    void recharger()
  }, [recharger])

  // Suivi en direct : positions partagées par les livreurs, relues toutes les 30 s (et l'avancement avec),
  // seulement pour aujourd'hui.
  useEffect(() => {
    if (!estAujourdhui) return
    let annule = false
    const lire = () => positionsLivreurs().then(({ data }) => { if (!annule) { setPositions(data); setMaintenant(Date.now()) } })
    void lire()
    const id = window.setInterval(() => { void lire(); if (!document.hidden) void recharger() }, 30_000)
    return () => { annule = true; window.clearInterval(id) }
  }, [estAujourdhui, recharger])

  // Salariés et noms de leurs clients : seulement quand on ouvre le scanner.
  useEffect(() => {
    if (!scanOuvert || membres.length) return
    membresPourTournee().then(async ({ data }) => {
      setMembres(data)
      setNoms(await nomsClients([...new Set(data.flatMap(m => m.clients_messagerie))]))
    })
  }, [scanOuvert, membres.length])

  const membre = membres.find(m => m.id === membreId) ?? null
  useEffect(() => {
    if (!membreId) return
    let annule = false
    trouverScan(membreId).then(s => { if (!annule) setScanMembre(s?.id ?? null) })
    return () => { annule = true }
  }, [membreId])
  const clientsMembre = useMemo(
    () => (membre?.clients_messagerie ?? []).map(id => ({ id, name: noms.get(id) ?? 'Client' })),
    [membre, noms],
  )

  // Une couleur par salarié (ordre alphabétique : stable d'un rechargement à l'autre).
  const couleurs = useMemo(() => {
    const liste = [...new Map(tournees.map(t => [t.member_id, t.team_members?.full_name ?? ''])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
    return new Map(liste.map(([id], i) => [id, colorForIndex(i)]))
  }, [tournees])

  const lignes = useMemo(() => construireLignes(tournees, arrets), [tournees, arrets])
  const resume = useMemo(() => resumeTournees(lignes), [lignes])
  const salaries = useMemo(
    () => [...new Map(tournees.map(t => [t.member_id, t.team_members?.full_name ?? 'Salarié'])).entries()],
    [tournees],
  )
  const visibles = useMemo(() => filtrerTournees(lignes, filtre, membreFiltre, q), [lignes, filtre, membreFiltre, q])

  // Position de CETTE tournée, de moins de 3 h (une ligne oubliée ne traîne pas sur la carte).
  const positionDe = (l: LigneTournee) => estAujourdhui
    ? positions.find(p => p.member_id === l.t.member_id && p.tournee_id === l.t.id
      && maintenant - new Date(p.maj_le).getTime() < 3 * 3_600_000)
    : undefined

  const surCarte = visibles.filter(l => !masques.has(l.t.member_id))
  const couches = useMemo(() => surCarte.map(l => {
    const mode = modeOrdre(l.t)
    return {
      id: l.t.id, couleur: couleurs.get(l.t.member_id) ?? '#2563eb', arrets: l.arrets, mode,
      trajet: l.t.trajet ?? null, prochainId: prochainDansOrdre(l.arrets, mode)?.id ?? null,
    }
  }), [surCarte, couleurs])
  const positionsCarte = surCarte.flatMap(l => {
    const p = positionDe(l)
    return p ? [{
      id: l.t.member_id, lat: p.lat, lng: p.lng, couleur: couleurs.get(l.t.member_id) ?? '#2563eb',
      ancien: positionAncienne(p.maj_le, maintenant),
      libelle: `${(l.t.team_members?.full_name ?? 'Salarié').split(' ')[0]} · ${ilYA(p.maj_le, maintenant)}`,
    }] : []
  })

  const detail = lignes.find(l => l.t.id === detailId) ?? null
  const ouvrirDetail = (id: string, o: OngletDetail = 'arrets') => { setARecalculerListe(false); setOnglet(o); setDetailId(id) }

  const demanderCalcul = (t: TourneeColis) => {
    // Tournée déjà en route ou ordre posé à la main : un recalcul complet l'écraserait.
    if (t.statut === 'en_cours' || modeOrdre(t) === 'manuel') setACalculer(t)
    else void calculer(t)
  }
  const calculer = async (t: TourneeColis) => {
    setACalculer(null)
    setCalcul(t.id)
    const { data, error } = await calculerItineraire({ tourneeId: t.id, mode: 'tout' })
    setCalcul(null)
    if (error || !data) { toast(error?.message ?? 'Calcul impossible', 'error'); return }
    toast(data.message ?? `Itinéraire calculé : ${libelleDistance(data.km_total * 1000)}`, 'success')
    void recharger()
  }
  const apresAdresse = (ajout: boolean) => {
    setAdresseEdit(null); setAdresseAjout(false); setARecalculerListe(true)
    toast(ajout ? 'Adresse ajoutée : recalcule l’itinéraire' : 'Adresse corrigée : recalcule l’itinéraire', 'success')
    void recharger()
  }
  const rouvrir = async () => {
    if (!aRouvrir) return
    const { error } = await rouvrirTournee(aRouvrir.id)
    setARouvrir(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée rouverte : le salarié peut de nouveau la modifier', 'success')
    void recharger()
  }
  const supprimer = async () => {
    if (!aSupprimer) return
    setSuppression(true)
    const { error } = await supprimerTourneeColis(aSupprimer.id)
    setSuppression(false)
    setASupprimer(null)
    if (error) { toast(error.message, 'error'); return }
    setDetailId(null)
    toast('Tournée de colis supprimée', 'success')
    void recharger()
  }
  const basculerMasque = (id: string) => setMasques(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const exporter = () => {
    downloadCSV(csvTournees(visibles, date), `tournees-colis-${date}.csv`)
  }
  const ouvrirPhoto = async (d: DocumentRow) => {
    const u = await urlPhotoArret(d)
    if (u) ouvrirDocument(u, { titre: 'Photo', type: 'image' }); else toast('Photo introuvable', 'error')
  }

  const tuile = (f: FiltreTournees) => ({ actif: filtre === f, onClick: () => setFiltre(cur => (cur === f ? 'toutes' : f)) })

  const bascule = (
    <div className="inline-flex self-start rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden" role="tablist" aria-label="Vue">
      {([['tournees', 'Tournées'], ['suivi', 'Suivi des colis']] as const).map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={vue === v} onClick={() => setVue(v)}
          className={`min-h-9 px-4 text-sm ${vue === v ? 'bg-[var(--bg-elevated)] text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>{l}</button>
      ))}
    </div>
  )
  if (vue === 'suivi') {
    return <div className="flex flex-col gap-3 pb-6">{bascule}<SuiviColis dateInitiale={date} /></div>
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      {bascule}
      {/* Barre : jour · actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <BoutonIcone icone={ChevronLeft} libelle="Jour précédent" onClick={() => setDate(d => decalerJour(d, -1))} />
          <input type="date" value={date} aria-label="Date des tournées"
            onChange={e => { if (e.target.value) setDate(e.target.value) }} className={`${inputCls} !w-auto`} />
          <BoutonIcone icone={ChevronRight} libelle="Jour suivant" onClick={() => setDate(d => decalerJour(d, 1))} />
        </div>
        {!estAujourdhui && (
          <Button variant="secondary" size="compact" onClick={() => setDate(toLocalISO(new Date()))}>Aujourd'hui</Button>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {lignes.length > 0 && (
            <>
              <Button size="compact" className="whitespace-nowrap" variant={carte ? 'primary' : 'secondary'} onClick={() => setCarte(v => !v)}>
                <IconeCarte size={14} /> Carte du jour
              </Button>
              <Button size="compact" className="whitespace-nowrap" variant="secondary" onClick={exporter}>
                <Download size={14} /> Export CSV
              </Button>
            </>
          )}
          {peutScanner && !erreur && (
            <Button size="compact" className="whitespace-nowrap" onClick={() => setScanOuvert(true)}>
              <ScanText size={14} /> Scanner pour un salarié
            </Button>
          )}
        </div>
      </div>

      {erreur && (
        <div role="alert" className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          <TriangleAlert size={15} className="shrink-0" />
          <span className="flex-1">{erreur}</span>
          <Button size="compact" variant="secondary" onClick={() => void recharger()}>Réessayer</Button>
        </div>
      )}

      {!charge ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : lignes.length === 0 && !erreur ? (
        <EmptyState icon={<PackageCheck size={28} />} title="Aucune tournée de colis ce jour"
          description={peutScanner ? 'Scanne la feuille de route d’un salarié, ou choisis un autre jour.' : 'Choisis un autre jour.'}
          action={peutScanner ? { label: 'Scanner pour un salarié', onClick: () => setScanOuvert(true) } : undefined} />
      ) : lignes.length > 0 && (
        <>
          {/* Tuiles cliquables : chaque geste filtre la liste */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <ChiffreCarte libelle="Tournées" icone={<Truck size={13} />} valeur={String(resume.tournees)}
              detail={resume.tournees > 1 ? 'toutes les feuilles du jour' : 'la feuille du jour'} titre="Toutes les tournées"
              actif={filtre === 'toutes'} onClick={() => setFiltre('toutes')} />
            <ChiffreCarte libelle="En cours" icone={<Gauge size={13} />} valeur={String(resume.enCours)}
              detail={`${resume.pct} % · ${resume.arretsTraites} / ${resume.arrets} arrêts`} titre="Tournées en cours" {...tuile('en_cours')} />
            <ChiffreCarte libelle="Clôturées" icone={<PackageCheck size={13} />} valeur={String(resume.cloturees)}
              detail={`${resume.colisLivres} / ${resume.colis} colis livrés${resume.enPause > 0 ? ` · ${resume.enPause} en pause` : ''}`}
              titre="Tournées clôturées" {...tuile('cloturees')} />
            <ChiffreCarte libelle="En attente" icone={<Pause size={13} />} valeur={String(resume.colisAttente)}
              ton={resume.colisAttente > 0 ? 'warning' : undefined} detail="colis avisés / en instance"
              titre="Tournées avec des colis en attente" {...tuile('attente')} />
            <ChiffreCarte libelle="En retour" icone={<Undo2 size={13} />} valeur={String(resume.colisRetour)}
              ton={resume.colisRetour > 0 ? 'danger' : undefined} detail="refusés, absents, adresse…"
              titre="Tournées avec des colis en retour" {...tuile('retours')} />
            <ChiffreCarte libelle="Kilomètres" icone={<Route size={13} />} valeur={resume.km > 0 ? libelleDistance(resume.km * 1000) : '—'}
              detail="itinéraires calculés" titre="Toutes les tournées" actif={false} onClick={() => setFiltre('toutes')} />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2">
            <BarreRecherche value={q} onChange={setQ} placeholder="Chercher une tournée : salarié, client…" ariaLabel="Rechercher une tournée"
              raccourci className="flex-1 min-w-[12rem] max-w-xl" />
            {salaries.length > 1 && (
              <select value={membreFiltre} onChange={e => setMembreFiltre(e.target.value)} aria-label="Salarié" className={`${inputCls} !w-auto`}>
                <option value="">Tous les salariés</option>
                {salaries.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
              </select>
            )}
            {(filtre !== 'toutes' || membreFiltre || q) && (
              <Button size="compact" variant="secondary" onClick={() => { setFiltre('toutes'); setMembreFiltre(''); setQ('') }}>
                Tout afficher
              </Button>
            )}
            <span className="text-xs text-[var(--text-muted)] ml-auto">{visibles.length} sur {lignes.length} tournées</span>
          </div>

          {carte && (
            <div className="flex flex-col gap-3 rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <div className="flex flex-wrap gap-2" aria-label="Salariés affichés">
                {salaries.map(([id, nom]) => {
                  const siennes = lignes.filter(x => x.t.member_id === id)
                  const km = siennes.reduce((s, x) => s + x.km, 0)
                  const pct = Math.round(siennes.reduce((s, x) => s + x.pct, 0) / siennes.length)
                  const masque = masques.has(id)
                  return (
                    <button key={id} type="button" aria-pressed={!masque} onClick={() => basculerMasque(id)}
                      className={`min-h-10 px-3 inline-flex items-center gap-2 rounded-[var(--r-md)] border text-xs ${
                        masque ? 'border-[var(--border)] opacity-50' : 'border-[var(--border-strong)]'}`}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: couleurs.get(id) }} />
                      <strong className="text-[var(--text)]">{nom}</strong>
                      <span className="text-[var(--text-muted)] tabular-nums">{pct} %{km ? ` · ${libelleDistance(km * 1000)}` : ''}</span>
                    </button>
                  )
                })}
              </div>
              <Suspense fallback={<Skeleton className="h-[26rem]" />}>
                <CarteTournee couches={couches} positions={positionsCarte} hauteur="h-[26rem]" />
              </Suspense>
            </div>
          )}

          {/* Liste : une ligne par tournée, un clic ouvre le tiroir */}
          {visibles.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-6 text-center">Aucune tournée ne correspond à ces filtres.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibles.map(l => (
                <LigneTourneeCarte key={l.t.id} l={l} couleur={carte ? couleurs.get(l.t.member_id) : undefined}
                  pos={positionDe(l)} maintenant={maintenant}
                  nbSyntheses={(syntheses.get(l.t.id) ?? []).length} nbFeuilles={(feuilles.get(l.t.id) ?? []).length}
                  onOuvrir={o => ouvrirDetail(l.t.id, o)} />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Tiroir d'une tournée */}
      <Drawer open={detail != null} onClose={() => setDetailId(null)} width="max-w-[44rem]"
        title={detail ? `${detail.t.team_members?.full_name ?? 'Salarié'}${detail.t.clients?.name ? ` · ${detail.t.clients.name}` : ''}` : 'Tournée'}>
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={detail.t.statut === 'cloturee' ? 'muted' : detail.t.statut === 'en_cours' ? 'info' : 'warning'}>
                {LIBELLE_STATUT_TOURNEE[detail.t.statut]}
              </Badge>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {detail.c.arretsTraites} / {detail.c.arrets} arrêts · {detail.c.colisLivres} / {detail.c.colis} colis
                {detail.km > 0 ? ` · ${libelleDistance(detail.km * 1000)}` : ''}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {peutScanner && detail.t.statut !== 'cloturee' && (
                  <BoutonIcone icone={Route} taille="sm" libelle={calcul === detail.t.id ? 'Calcul…' : "Calculer l'itinéraire"}
                    disabled={calcul != null} onClick={() => demanderCalcul(detail.t)} />
                )}
                {peutScanner && detail.t.statut === 'cloturee' && (
                  <BoutonIcone icone={RotateCcw} taille="sm" libelle="Rouvrir la tournée" onClick={() => setARouvrir(detail.t)} />
                )}
                {peutSupprimer && detail.t.statut !== 'cloturee' && (
                  <BoutonIcone icone={Trash2} taille="sm" libelle="Supprimer cette tournée de colis" onClick={() => setASupprimer(detail.t)} />
                )}
              </div>
            </div>

            <div role="tablist" className="inline-flex self-start rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
              {([
                ['arrets', `Arrêts (${detail.arrets.length})`],
                ['feuille', `Feuille de route (${(feuilles.get(detail.t.id) ?? []).length})`],
                ['synthese', `Synthèse (${(syntheses.get(detail.t.id) ?? []).length})`],
              ] as Array<[OngletDetail, string]>).map(([k, lib]) => (
                <button key={k} role="tab" type="button" aria-selected={onglet === k} onClick={() => setOnglet(k)}
                  className={`px-3 py-1.5 rounded-[var(--r-sm)] text-xs font-semibold ${onglet === k ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                  {lib}
                </button>
              ))}
            </div>

            {onglet === 'arrets' && (
              <ListeTourneeColis tournee={detail.t} arrets={detail.arrets} peutModifier={peutScanner}
                aRecalculer={aRecalculerListe} calcul={calcul === detail.t.id}
                onModifier={setAdresseEdit} onCollecte={setCollecteSur} onAjouter={() => setAdresseAjout(true)}
                onRecalculer={async () => { await calculer(detail.t); setARecalculerListe(false) }} />
            )}
            {onglet === 'feuille' && (
              <Photos docs={feuilles.get(detail.t.id) ?? []} onOuvrir={ouvrirPhoto}
                vide="Pas de photo de feuille de route pour cette tournée (elles sont gardées à partir de maintenant)." />
            )}
            {onglet === 'synthese' && (
              <Photos docs={syntheses.get(detail.t.id) ?? []} onOuvrir={ouvrirPhoto}
                vide="Le salarié n'a pas joint de photo de synthèse." />
            )}
          </div>
        )}
      </Drawer>

      {collecteSur && (
        <FeuilleCollecte arret={collecteSur}
          onFait={() => { setARecalculerListe(true); void recharger() }} onFermer={() => setCollecteSur(null)} />
      )}

      {(adresseEdit || adresseAjout) && (() => {
        const l = lignes.find(x => x.t.id === (adresseEdit?.tournee_id ?? detailId))
        if (!l) return null
        return (
          <FeuilleAdresse tournee={l.t} arrets={l.arrets} arret={adresseEdit}
            onFermer={() => { setAdresseEdit(null); setAdresseAjout(false) }}
            onFait={(_a, ajout) => apresAdresse(ajout)} />
        )
      })()}

      <Drawer open={scanOuvert} onClose={() => { setScanOuvert(false); setMembreId('') }}
        title="Scanner une feuille de route" width="max-w-[48rem]">
        <div className="flex flex-col gap-4">
          <Field label="Salarié">
            <select value={membreId} onChange={e => { setScanMembre(undefined); setMembreId(e.target.value) }} className="field">
              <option value="">Choisir…</option>
              {membres.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </Field>
          {membre && scanMembre !== undefined && companyId && (
            <ScanFeuilleRoute key={`${membre.id}-${scanMembre ?? ''}`} companyId={companyId} memberId={membre.id} nomSalarie={membre.full_name}
              date={date} clients={clientsMembre} reprendre={scanMembre}
              onAnnuler={() => { setScanOuvert(false); setMembreId('') }}
              onCree={() => { setScanOuvert(false); setMembreId(''); void recharger() }} />
          )}
        </div>
      </Drawer>

      <ConfirmDialog open={aSupprimer != null} title="Supprimer cette tournée de colis ?"
        message={`Feuille de ${aSupprimer?.team_members?.full_name ?? 'ce salarié'} : les arrêts et leurs statuts seront effacés.`}
        loading={suppression} onConfirm={supprimer} onCancel={() => setASupprimer(null)} />
      <ConfirmDialog open={aCalculer != null} title="Recalculer l'itinéraire ?"
        message="La tournée est en cours ou son ordre a été posé à la main : le recalcul complet remplace cet ordre."
        confirmLabel="Recalculer" onConfirm={() => aCalculer && calculer(aCalculer)} onCancel={() => setACalculer(null)} />
      <ConfirmDialog open={aRouvrir != null} title="Rouvrir cette tournée ?"
        message={`Feuille de ${aRouvrir?.team_members?.full_name ?? 'ce salarié'} : il pourra de nouveau changer les statuts. Sa journée de colis n'est pas modifiée.`}
        confirmLabel="Rouvrir" onConfirm={rouvrir} onCancel={() => setARouvrir(null)} />
    </div>
  )
}

function LigneTourneeCarte({ l, couleur, pos, maintenant, nbSyntheses, nbFeuilles, onOuvrir }: {
  l: LigneTournee
  couleur: string | undefined
  pos: PositionLivreur | undefined
  maintenant: number
  nbSyntheses: number
  nbFeuilles: number
  onOuvrir: (o: OngletDetail) => void
}) {
  const { t, c, pct, enPause } = l
  return (
    <li>
      <div role="button" tabIndex={0} onClick={() => onOuvrir('arrets')}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir('arrets') } }}
        className="w-full text-left flex items-start gap-3 rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 cursor-pointer hover:border-[var(--brand)] transition-colors">
        {couleur && <span className="w-3 h-3 mt-1.5 rounded-full shrink-0" style={{ background: couleur }} aria-hidden />}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <strong className="text-[var(--text)]">{t.team_members?.full_name ?? 'Salarié'}</strong>
            {t.clients?.name && <span className="text-[var(--text-muted)]">{t.clients.name}</span>}
            <Badge color={t.statut === 'cloturee' ? 'muted' : t.statut === 'en_cours' ? 'info' : 'warning'}>
              {LIBELLE_STATUT_TOURNEE[t.statut]}
            </Badge>
            {pos && (
              <span className={`inline-flex items-center gap-1 text-xs ${positionAncienne(pos.maj_le, maintenant) ? 'text-[var(--text-muted)]' : 'text-[var(--success)]'}`}>
                <Radio size={11} /> position {ilYA(pos.maj_le, maintenant)}
              </span>
            )}
          </span>
          <div className="h-1.5 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden" aria-hidden>
            <div className="h-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)] tabular-nums">
            <span>Arrêts {c.arretsTraites} / {c.arrets}</span>
            <span>Colis {c.colisTraites} / {c.colis}</span>
            <span className="text-[var(--success)]">{c.colisLivres} livrés</span>
            {c.colisAttente > 0 && <span className="text-[var(--warning)]">{c.colisAttente} en attente</span>}
            {c.colisRetour > 0 && <span className="text-[var(--danger)]">{c.colisRetour} en retour</span>}
            {enPause > 0 && <span className="text-[var(--warning)]">{enPause} en pause</span>}
            {c.collectes > 0 && <span>Collectes {c.collectesTraitees} / {c.collectes}</span>}
            {t.trajet && <span>{libelleDistance(t.trajet.km_total * 1000)}{modeOrdre(t) === 'manuel' ? ' · ordre manuel' : ''}</span>}
          </span>
          {(nbFeuilles > 0 || nbSyntheses > 0) && (
            <span className="flex flex-wrap gap-2 pt-0.5">
              {nbFeuilles > 0 && (
                <button type="button" onClick={e => { e.stopPropagation(); onOuvrir('feuille') }}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--border-strong)] bg-[var(--bg-card-hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:border-[var(--brand)] transition-colors">
                  <FileText size={12} /> Feuille de route
                  <span className="rounded-full bg-[var(--brand)]/15 text-[var(--brand)] px-1.5 tabular-nums">{nbFeuilles}</span>
                </button>
              )}
              {nbSyntheses > 0 && (
                <button type="button" onClick={e => { e.stopPropagation(); onOuvrir('synthese') }}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--border-strong)] bg-[var(--bg-card-hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:border-[var(--brand)] transition-colors">
                  <Camera size={12} /> Synthèse
                  <span className="rounded-full bg-[var(--brand)]/15 text-[var(--brand)] px-1.5 tabular-nums">{nbSyntheses}</span>
                </button>
              )}
            </span>
          )}
        </div>
        <span className="text-lg font-mono font-semibold tabular-nums text-[var(--text)] shrink-0">{pct} %</span>
      </div>
    </li>
  )
}

/** Vignettes de photos (feuille de route, synthèse) : un clic ouvre l'image en grand. */
function Photos({ docs, onOuvrir, vide }: { docs: DocumentRow[]; onOuvrir: (d: DocumentRow) => void; vide: string }) {
  if (docs.length === 0) return <p className="text-sm text-[var(--text-muted)]">{vide}</p>
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {docs.map((d, i) => (
        <li key={d.id}>
          <Vignette doc={d} libelle={`Page ${i + 1}`} onOuvrir={() => onOuvrir(d)} />
        </li>
      ))}
    </ul>
  )
}

function Vignette({ doc, libelle, onOuvrir }: { doc: DocumentRow; libelle: string; onOuvrir: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let annule = false
    urlPhotoArret(doc).then(u => { if (!annule) setUrl(u) })
    return () => { annule = true }
  }, [doc])
  return (
    <button type="button" onClick={onOuvrir}
      className="w-full aspect-[3/4] rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden relative hover:border-[var(--brand)]">
      {url ? <img src={url} alt={libelle} loading="lazy" className="w-full h-full object-cover" /> : <Skeleton className="w-full h-full" />}
      <span className="absolute bottom-1 left-1 rounded-[var(--r-pill)] bg-black/60 px-2 py-0.5 text-[0.6875rem] text-white">{libelle}</span>
    </button>
  )
}
