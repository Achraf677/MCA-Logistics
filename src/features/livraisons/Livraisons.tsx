import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Package, RefreshCw, Loader2, FileText, Euro, FileClock, Wallet, Mail, Search,
  CalendarRange, AlertTriangle, Camera, X, Route,
} from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { Badge }       from '../../shared/ui/Badge'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Skeleton }    from '../../shared/ui/Skeleton'
import { BoutonIcone, PanneauReglages } from '../../shared/ui/BoutonIcone'
// Chargé à la demande : c'est le plus gros bloc du site (formulaire à 5
// onglets + génération de PDF) — même ici, sur l'écran Livraisons, il n'est
// utile qu'au clic sur une ligne, pas à l'affichage du tableau.
const DrawerLivraison = lazy(() =>
  import('./DrawerLivraison').then(m => ({ default: m.DrawerLivraison })))
import { ApercuFacture } from './ApercuFacture'
import { useToast }    from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { downloadCSV } from '../../shared/lib/download'
import { libelleMotif, aProblemeOuvert } from '../../shared/lib/problemeTerrain'
import {
  getDeliveries, getDelivery, exportDeliveriesCSV, getPendingSyncDeliveries, resyncPending,
  sendClientEmail, compterEchecs, getListesFiltres, facturerGroupe, messageErreurEdge,
} from './livraisons.queries'
import {
  STATUS_LABELS, STATUS_COLORS,
  kpiSummary, formatCents, deliveryTotalHtCts, deliveryTotalTtcCts,
  bornesPeriode, libellePeriode, isoLocal, eurosArrondis, dateCourte, heureCourte, trajetOuReleve,
  type RaccourciPeriode, type Periode,
} from './livraisons.logic'
import { listDocuments } from '../../shared/lib/documents.queries'
import { isLivraisonSansJustif } from '../../shared/lib/livraisonsSansJustif'
import type { DeliveryRow, DeliveryFilters, DeliveryStatus } from './livraisons.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const STATUTS: DeliveryStatus[] = ['planifiee', 'en_cours', 'livree', 'facturee', 'payee', 'annulee']

const RACCOURCIS: Array<{ cle: RaccourciPeriode; libelle: string }> = [
  { cle: 'jour', libelle: "Aujourd'hui" },
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'tout', libelle: 'Tout' },
]

// Facturable via la sélection multiple : livrée, non encore synchro Pennylane, montant saisi
const isInvoiceable = (row: DeliveryRow) =>
  row.statut === 'livree' &&
  row.pennylane_invoice_id === null &&
  (row.amount_ht_cts ?? 0) > 0

/**
 * Registre des livraisons — ÉCRAN DE TRAVAIL, au gabarit du Dashboard.
 *
 * PC : tient sur un écran (cartes chiffrées · barre de filtres · tableau qui
 * défile à l'intérieur). Mobile : une colonne qui défile, des cartes.
 *
 * Période par défaut = mois en cours (dates locales). Les chiffres suivent la
 * période et les filtres client / chauffeur ; le filtre de statut ne réduit
 * que le tableau (un clic sur une carte le pose).
 *
 * URL : `?q=` (recherche, barre du haut ou champ local) · `?filtre=echecs`
 * (cloche) · `?filtre=sans_justif` (cloche) · `?ouvrir=<id>` (Dashboard).
 * Recherche et filtres spéciaux portent sur tout l'historique.
 */
export function Livraisons() {
  const { toast } = useToast()

  const { can } = usePermissions()
  const canCreate = can('livraisons.livraisons', 'create')

  // ── État principal ─────────────────────────────────────────────────────────
  const [rows, setRows]         = useState<DeliveryRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [pendingSync, setPendingSync] = useState(0)
  const [resyncing, setResyncing] = useState(false)
  const [nbEchecs, setNbEchecs] = useState(0)

  // ── Filtres ────────────────────────────────────────────────────────────────
  const [raccourci, setRaccourci] = useState<RaccourciPeriode | 'libre'>('mois')
  const [libre, setLibre]         = useState<Periode>({})
  const [reglagesDates, setReglagesDates] = useState(false)
  const [statut, setStatut]       = useState<DeliveryStatus | 'all'>('all')
  const [clientId, setClientId]   = useState('')
  const [chauffeurId, setChauffeurId] = useState('')
  const [listes, setListes] = useState<Awaited<ReturnType<typeof getListesFiltres>>>({ clients: [], chauffeurs: [] })

  // ── Sélection facturation (lignes facturables d'un même client) ───────────
  const [invoiceIds, setInvoiceIds]         = useState<Set<string>>(new Set())
  const [invoiceClientId, setInvoiceClientId] = useState<string | null>(null)
  const [previewInvoice, setPreviewInvoice] = useState(false)
  const [invoicing, setInvoicing]           = useState(false)
  // Envoi email facture au client (depuis la liste).
  const [emailConfirm, setEmailConfirm]     = useState<DeliveryRow | null>(null)
  const [emailSendingId, setEmailSendingId] = useState<string | null>(null)

  // ── Paramètres d'URL ───────────────────────────────────────────────────────
  // Toujours modifiés en COPIE des paramètres existants : `?tab=` (sous-onglet
  // de la section) ne doit jamais sauter.
  const [searchParams, setSearchParams] = useSearchParams()
  const majParams = useCallback((f: (p: URLSearchParams) => void) => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); f(p); return p }, { replace: true })
  }, [setSearchParams])
  const filtre = searchParams.get('filtre')
  const filtreSansJustif = filtre === 'sans_justif'
  const filtreEchecs = filtre === 'echecs'
  const q = searchParams.get('q')?.trim() ?? ''

  // Champ de recherche local, synchronisé avec `?q=` (la barre du haut y écrit).
  const [saisie, setSaisie] = useState(q)
  const [qVu, setQVu] = useState(q)
  if (q !== qVu) { setQVu(q); setSaisie(q) }
  useEffect(() => {
    const t = saisie.trim()
    if (t === q) return
    const minuteur = setTimeout(() => majParams(p => { if (t) p.set('q', t); else p.delete('q') }), 350)
    return () => clearTimeout(minuteur)
  }, [saisie, q, majParams])

  // ── Période ────────────────────────────────────────────────────────────────
  const aujourdhui = isoLocal(new Date())
  // Recherche et filtres venus de la cloche : toutes dates (sinon on raterait
  // une course signalée hier ou une facture du mois dernier).
  const toutesDates = !!q || filtreEchecs || filtreSansJustif
  const periodeChoisie = useMemo<Periode>(
    () => raccourci === 'libre' ? libre : bornesPeriode(raccourci, new Date(`${aujourdhui}T12:00:00`)),
    [raccourci, libre, aujourdhui],
  )
  const periode = useMemo<Periode>(() => (toutesDates ? {} : periodeChoisie), [toutesDates, periodeChoisie])

  const filtresRequete = useMemo<DeliveryFilters>(() => ({
    date_from: periode.debut,
    date_to: periode.fin,
    client_id: clientId || undefined,
    driver_id: chauffeurId || undefined,
    q: q || undefined,
    echecs: filtreEchecs || undefined,
  }), [periode.debut, periode.fin, clientId, chauffeurId, q, filtreEchecs])

  // ── Chargement ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    setInvoiceIds(new Set())
    setInvoiceClientId(null)
    const { data, error: err } = await getDeliveries(filtresRequete)
    if (err) setError(err.message)
    else setRows((data as unknown as DeliveryRow[]) ?? [])
    setLoading(false)
  }, [filtresRequete])

  const loadCompteurs = useCallback(async () => {
    const [{ data }, echecs] = await Promise.all([getPendingSyncDeliveries(), compterEchecs()])
    setPendingSync((data as unknown[] | null)?.length ?? 0)
    setNbEchecs(echecs.count ?? 0)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCompteurs() }, [loadCompteurs])
  useEffect(() => { getListesFiltres().then(setListes) }, [])

  // Documents de livraison : servent UNIQUEMENT au filtre « sans justificatif »
  // → chargés seulement quand ce filtre est actif (et rechargés à chaque fois).
  const [documentsLivraison, setDocumentsLivraison] = useState<{ entity_type: string | null; entity_id: string | null }[]>([])
  useEffect(() => {
    if (!filtreSansJustif) return
    let annule = false
    listDocuments({ entity_type: 'delivery' }).then(({ data }) => {
      if (!annule) setDocumentsLivraison((data ?? []).map(d => ({ entity_type: d.entity_type, entity_id: d.entity_id })))
    })
    return () => { annule = true }
  }, [filtreSansJustif])

  const recharger = async () => { await Promise.all([load(), loadCompteurs()]) }

  // ── Resync Pennylane ────────────────────────────────────────────────────────
  const handleResync = async () => {
    setResyncing(true)
    const { resynced, failed } = await resyncPending()
    await recharger()
    setResyncing(false)
    toast(
      `${resynced} resynchronisée(s)${failed > 0 ? `, ${failed} encore en échec` : ''}`,
      failed > 0 ? 'error' : 'success',
    )
  }

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportDeliveriesCSV({ ...filtresRequete, status: statut })
      downloadCSV(csv, 'livraisons.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  // Ouverture directe `?ouvrir=<id>` : le Dashboard (consultation seule) envoie
  // ici pour voir ou modifier une livraison. Le paramètre est retiré aussitôt,
  // pour qu'un rechargement ne rouvre pas le tiroir.
  const aOuvrir = searchParams.get('ouvrir')
  useEffect(() => {
    if (!aOuvrir) return
    let annule = false
    getDelivery(aOuvrir).then(({ data }) => {
      if (annule) return
      if (data) { setSelected(data as unknown as DeliveryRow); setDrawerOpen(true) }
      majParams(p => p.delete('ouvrir'))
    })
    return () => { annule = true }
  }, [aOuvrir, majParams])

  // ── Facturation groupée ────────────────────────────────────────────────────
  // UNE seule porte : l'aperçu (ApercuFacture), qui bloque les lignes que
  // Pennylane refuserait. Plus de modale de confirmation qui le contournait.
  const invoiceSelectedRows = rows.filter(r => invoiceIds.has(r.id))
  const invoiceClientName   = invoiceSelectedRows[0]?.clients?.name ?? ''
  // Total à facturer : ligne principale + extras de chaque livraison
  // (identique à ce que Pennylane émettra).
  const invoiceTotalHtCts   = invoiceSelectedRows.reduce((s, r) => s + deliveryTotalHtCts(r), 0)
  const invoiceTotalTtcCts  = invoiceSelectedRows.reduce((s, r) => s + deliveryTotalTtcCts(r), 0)

  const clearInvoiceSelection = () => { setInvoiceIds(new Set()); setInvoiceClientId(null) }

  const toggleInvoice = (row: DeliveryRow) => {
    const next = new Set(invoiceIds)
    if (next.has(row.id)) next.delete(row.id)
    else next.add(row.id)
    setInvoiceIds(next)
    // Verrouille sur le client de la première sélection ; libère si tout vide
    const remaining = rows.filter(r => next.has(r.id))
    setInvoiceClientId(remaining.length > 0 ? remaining[0].client_id : null)
  }

  const handleInvoice = async () => {
    const ids = [...invoiceIds]
    setInvoicing(true)
    try {
      // Porte unique (livraisons.queries) : message précis, refus métier sans
      // changement de statut, rattrapage en cas d'échec technique.
      const r = await facturerGroupe(ids)
      if (!r.ok) { toast(r.message, 'error'); return }
      setPreviewInvoice(false)
      clearInvoiceSelection()
      await load()
      toast(`Facture créée — ${ids.length} course(s)`, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setInvoicing(false)
    }
  }

  const handleSendEmail = async () => {
    if (!emailConfirm) return
    const row = emailConfirm
    setEmailSendingId(row.id)
    const { data, error } = await sendClientEmail(row.id)
    setEmailSendingId(null)
    setEmailConfirm(null)
    if (error || !data?.ok) {
      toast(await messageErreurEdge(error, data, 'Envoi échoué.'), 'error')
      return
    }
    await load()
    toast(data.data?.bl_attached ? 'Email envoyé (facture + lettre de voiture)' : 'Email envoyé (facture)')
  }

  // ── Lignes affichées & chiffres ────────────────────────────────────────────
  // Le filtre « sans justificatif » se calcule en mémoire (il dépend des
  // documents) ; le statut ne réduit que le TABLEAU, pas les chiffres.
  const baseRows = useMemo(
    () => filtreSansJustif ? rows.filter(r => isLivraisonSansJustif(r, documentsLivraison)) : rows,
    [filtreSansJustif, rows, documentsLivraison],
  )
  const kpis = useMemo(() => kpiSummary(baseRows, periode, aujourdhui), [baseRows, periode, aujourdhui])
  const tableRows = useMemo(
    () => statut === 'all' ? baseRows : baseRows.filter(r => r.statut === statut),
    [baseRows, statut],
  )

  const choisirStatut = (s: DeliveryStatus | 'all') => setStatut(cur => (cur === s ? 'all' : s))
  const choisirRaccourci = (r: RaccourciPeriode) => {
    setRaccourci(r)
    if (q) { setSaisie(''); majParams(p => p.delete('q')) }
  }
  const basculerEchecs = () => majParams(p => { if (filtreEchecs) p.delete('filtre'); else p.set('filtre', 'echecs') })
  const sortirFiltre = () => majParams(p => p.delete('filtre'))

  const aDesFiltres = statut !== 'all' || !!clientId || !!chauffeurId || !!q || !!filtre || raccourci !== 'mois'
  const reinitialiser = () => {
    setStatut('all'); setClientId(''); setChauffeurId(''); setRaccourci('mois'); setLibre({}); setSaisie('')
    majParams(p => { p.delete('q'); p.delete('filtre') })
  }

  const anneeCourante = Number(aujourdhui.slice(0, 4))
  const libellePer = q ? "Recherche sur tout l'historique" : filtre ? 'Toutes dates' : libellePeriode(periode)

  return (
    <Shell pageTitle="Livraisons" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* PC : occupe EXACTEMENT la hauteur visible (écran − barre du haut −
          barre de sous-onglets et son espacement − marges de <main>). Le
          tableau prend le reste et défile à l'intérieur. */}
      <div className="flex flex-col gap-3 min-w-0 lg:h-[calc(100dvh-var(--topbar-h)-6.75rem)]">

        {/* Bandeaux : filtre venu de la cloche · synchronisation Pennylane */}
        {(filtreSansJustif || filtreEchecs) && (
          <Bandeau ton={filtreEchecs ? 'danger' : 'warning'} icone={<AlertTriangle size={15} />}
            action={<Button variant="ghost" size="compact" onClick={sortirFiltre}>Voir toutes les livraisons</Button>}>
            {filtreEchecs
              ? `${baseRows.length} course${baseRows.length > 1 ? 's' : ''} ouverte${baseRows.length > 1 ? 's' : ''} avec un échec signalé par le chauffeur (toutes dates).`
              : `${baseRows.length} livraison${baseRows.length > 1 ? 's' : ''} sans justificatif (toutes dates).`}
          </Bandeau>
        )}
        {pendingSync > 0 && (
          <Bandeau ton="warning" icone={<RefreshCw size={15} />}
            action={(
              <Button variant="secondary" size="compact" onClick={handleResync} disabled={resyncing}>
                {resyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Resynchroniser
              </Button>
            )}>
            {pendingSync} livraison{pendingSync > 1 ? 's' : ''} en attente de synchronisation Pennylane
          </Bandeau>
        )}

        {/* ── Chiffres de la période : 4 cartes au gabarit du Dashboard ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 [&>*]:min-w-0">
          {loading ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[5.5rem]" />) : (
            <>
              <Chiffre libelle="Courses" icone={<Package size={14} />} valeur={String(kpis.nbCourses)}
                detail={`${kpis.nbAFaire} à faire · ${kpis.nbFaites} faite${kpis.nbFaites > 1 ? 's' : ''}`}
                onClick={() => setStatut('all')} titre="Tout afficher" />
              <Chiffre libelle="CA HT" icone={<Euro size={14} />} valeur={eurosArrondis(kpis.caHtCts)}
                detail={kpis.nbCourses ? `${eurosArrondis(Math.round(kpis.caHtCts / kpis.nbCourses))} / course` : 'Aucune course'}
                onClick={() => setStatut('all')} titre="Tout afficher" />
              <Chiffre libelle="À facturer" icone={<FileClock size={14} />} valeur={eurosArrondis(kpis.aFacturerHtCts)}
                ton={kpis.nbAFacturer ? 'warning' : undefined} actif={statut === 'livree'}
                detail={`${kpis.nbAFacturer} livrée${kpis.nbAFacturer > 1 ? 's' : ''} · HT`}
                onClick={() => choisirStatut('livree')} titre="Afficher les livrées à facturer" />
              <Chiffre libelle="À encaisser" icone={<Wallet size={14} />} valeur={eurosArrondis(kpis.aEncaisserTtcCts)}
                ton={kpis.nbRetard ? 'danger' : undefined} actif={statut === 'facturee'}
                detail={kpis.nbRetard
                  ? `dont ${eurosArrondis(kpis.retardTtcCts)} en retard`
                  : `${kpis.nbAEncaisser} facturée${kpis.nbAEncaisser > 1 ? 's' : ''} · TTC`}
                onClick={() => choisirStatut('facturee')} titre="Afficher les facturées à encaisser" />
            </>
          )}
        </div>

        {/* ── Liste : filtres en tête, tableau défilant ── */}
        <section className={`${carteCls} flex flex-col min-w-0 lg:flex-1 lg:min-h-0 overflow-hidden`}>
          <div className="flex flex-col gap-2 p-3 pb-2 border-b border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex-1 min-w-[12rem] basis-full sm:basis-auto">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] pointer-events-none" />
                <input value={saisie} onChange={e => setSaisie(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { const t = saisie.trim(); majParams(p => { if (t) p.set('q', t); else p.delete('q') }) } }}
                  placeholder="Client, adresse, description, n° facture…"
                  aria-label="Rechercher une livraison"
                  className={`${champCls} w-full pl-8 pr-7`} />
                {saisie && (
                  <button type="button" onClick={() => { setSaisie(''); majParams(p => p.delete('q')) }}
                    aria-label="Effacer la recherche" title="Effacer la recherche"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]">
                    <X size={13} />
                  </button>
                )}
              </label>

              <div className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden shrink-0" role="group" aria-label="Période">
                {RACCOURCIS.map(r => {
                  const actif = !toutesDates && raccourci === r.cle
                  return (
                    <button key={r.cle} type="button" onClick={() => choisirRaccourci(r.cle)} aria-pressed={actif}
                      className={`h-8 px-2.5 text-xs font-medium border-l first:border-l-0 border-[var(--border)] transition-colors ${
                        actif ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}>
                      {r.libelle}
                    </button>
                  )
                })}
              </div>
              <BoutonIcone icone={CalendarRange} libelle="Dates libres" taille="sm" className="!w-8 !h-8"
                actif={reglagesDates || (raccourci === 'libre' && !toutesDates)} onClick={() => setReglagesDates(o => !o)} />

              <button type="button" onClick={basculerEchecs} aria-pressed={filtreEchecs} aria-label="Échecs"
                title="Courses ouvertes avec un échec signalé par le chauffeur (toutes dates)"
                className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[var(--r-md)] border text-xs font-medium transition-colors shrink-0 ${
                  filtreEchecs
                    ? 'border-[var(--danger)] bg-[var(--danger)] text-white'
                    : nbEchecs
                      ? 'border-[var(--danger)]/50 text-[var(--danger)] hover:bg-[var(--danger)]/10'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                <AlertTriangle size={13} /><span className="hidden sm:inline">Échecs</span>{nbEchecs > 0 && <span className="font-mono">{nbEchecs}</span>}
              </button>

              <div className="grid grid-cols-3 gap-2 basis-full lg:basis-auto lg:flex lg:ml-auto">
                <select value={statut} onChange={e => setStatut(e.target.value as DeliveryStatus | 'all')}
                  aria-label="Statut" className={`${champCls} lg:w-[9rem]`}>
                  <option value="all">Tous statuts</option>
                  {STATUTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  aria-label="Client" className={`${champCls} lg:w-[11rem]`}>
                  <option value="">Tous clients</option>
                  {listes.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={chauffeurId} onChange={e => setChauffeurId(e.target.value)}
                  aria-label="Chauffeur" className={`${champCls} lg:w-[10rem]`}>
                  <option value="">Tous chauffeurs</option>
                  {listes.chauffeurs.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
            </div>

            {reglagesDates && (
              <PanneauReglages titre="Dates libres">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={libre.debut ?? ''} aria-label="Du"
                    onChange={e => { setLibre(p => ({ ...p, debut: e.target.value || undefined })); setRaccourci('libre') }}
                    className={champCls} />
                  <span className="text-xs text-[var(--text-muted)]">au</span>
                  <input type="date" value={libre.fin ?? ''} aria-label="Au"
                    onChange={e => { setLibre(p => ({ ...p, fin: e.target.value || undefined })); setRaccourci('libre') }}
                    className={champCls} />
                  {raccourci === 'libre' && (
                    <Button variant="ghost" size="compact" onClick={() => { setLibre({}); setRaccourci('mois') }}>
                      Revenir au mois
                    </Button>
                  )}
                </div>
              </PanneauReglages>
            )}

            <div className="flex items-center gap-2 min-w-0 text-xs text-[var(--text-muted)]">
              <span className="truncate">
                <b className="font-semibold text-[var(--text)]">{loading ? '…' : tableRows.length}</b>
                {` livraison${tableRows.length > 1 ? 's' : ''} · ${libellePer}`}
                {statut !== 'all' && ` · ${STATUS_LABELS[statut]}`}
              </span>
              {aDesFiltres && (
                <button type="button" onClick={reinitialiser}
                  className="shrink-0 underline underline-offset-2 hover:text-[var(--text)]">
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* ── Barre de facturation groupée (≥ 1 cochée) ── */}
          {invoiceIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2
              border-b border-[var(--brand)]/40 bg-[var(--brand)]/8 text-sm">
              <span className="min-w-0">
                <b>{invoiceIds.size}</b> course{invoiceIds.size > 1 ? 's' : ''} · <b>{invoiceClientName}</b>
                {' '}· {formatCents(invoiceTotalHtCts)} HT / {formatCents(invoiceTotalTtcCts)} TTC
                <button onClick={clearInvoiceSelection}
                  className="ml-3 text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]">
                  Tout désélectionner
                </button>
              </span>
              <Button variant="primary" size="compact" onClick={() => setPreviewInvoice(true)}>
                <FileText size={14} />
                Facturer ({invoiceIds.size})
              </Button>
            </div>
          )}

          {/* ── Contenu ── */}
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
            {loading ? (
              <div className="p-3 flex flex-col gap-2">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8" />)}</div>
            ) : error ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <p className="text-[var(--danger)] text-sm">{error}</p>
                <Button variant="secondary" onClick={load}>Réessayer</Button>
              </div>
            ) : tableRows.length === 0 ? (
              <EmptyState
                icon={<Package size={40} />}
                title="Aucune livraison"
                description={aDesFiltres ? 'Aucune livraison ne correspond aux filtres.' : 'Aucune course sur la période.'}
                action={!aDesFiltres && canCreate
                  ? { label: '+ Nouvelle livraison', onClick: () => { setSelected(null); setDrawerOpen(true) } }
                  : undefined}
              />
            ) : (
              <>
                {/* PC : tableau compact */}
                <table className="hidden md:table w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[2.25rem]" />
                    <col className="w-[6.5rem]" />
                    <col />
                    <col />
                    <col className="w-[9rem]" />
                    <col className="w-[7rem]" />
                    <col className="w-[20rem]" />
                    <col className="w-[8.5rem]" />
                    <col className="w-[2.75rem]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)]">
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      <th className="px-2 py-1.5" title="Cocher des livrées d'un même client pour les facturer ensemble"><span className="sr-only">Facturer</span></th>
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      <th className="px-2 py-1.5 font-medium">Client</th>
                      <th className="px-2 py-1.5 font-medium">Trajet</th>
                      <th className="px-2 py-1.5 font-medium">Chauffeur</th>
                      <th className="px-2 py-1.5 font-medium text-right">HT</th>
                      <th className="px-2 py-1.5 font-medium">Statut</th>
                      <th className="px-2 py-1.5 font-medium">N° facture</th>
                      <th className="px-2 py-1.5"><span className="sr-only">Envoyer</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(row => {
                      const invoiceable = isInvoiceable(row)
                      const invoiceBlocked = invoiceable && invoiceClientId !== null && row.client_id !== invoiceClientId
                      const t = trajetOuReleve(row)
                      const heure = heureCourte(row.arrival_time)
                      const ht = deliveryTotalHtCts(row)
                      const ttc = deliveryTotalTtcCts(row)
                      return (
                        <tr key={row.id} onClick={() => openRow(row)}
                          className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)] ${invoiceBlocked ? 'opacity-50' : ''}`}>
                          <td className="px-2 py-1" onClick={e => e.stopPropagation()}>
                            {invoiceable && (
                              <CaseFacture row={row} coche={invoiceIds.has(row.id)} bloque={invoiceBlocked}
                                clientVerrou={invoiceClientName} onToggle={toggleInvoice} />
                            )}
                          </td>
                          <td className="px-2 py-1 font-mono text-xs whitespace-nowrap">
                            <span className="text-[var(--text)]">{dateCourte(row.date, anneeCourante)}</span>
                            {heure && <span className="ml-1.5 text-[var(--text-muted)]" title="Heure prévue">{heure}</span>}
                          </td>
                          <td className="px-2 py-1 truncate font-medium text-[var(--text)]" title={row.clients?.name ?? ''}>
                            {row.clients?.name ?? '—'}
                          </td>
                          <td className="px-2 py-1 truncate text-[var(--text-muted)]" title={t.complet}>{t.court}</td>
                          <td className="px-2 py-1 truncate text-[var(--text-muted)]" title={row.team_members?.full_name ?? ''}>
                            {row.team_members?.full_name ?? '—'}
                          </td>
                          <td className="px-2 py-1 text-right font-mono whitespace-nowrap text-[var(--text)]"
                            title={ht > 0 ? `${formatCents(ttc)} TTC` : undefined}>
                            {ht > 0 ? formatCents(ht) : '—'}
                          </td>
                          <td className="px-2 py-1 text-xs">
                            <BadgesStatut row={row} />
                          </td>
                          <td className="px-2 py-1 font-mono text-xs truncate">
                            <NumeroFacture row={row} />
                          </td>
                          <td className="px-2 py-1 text-right" onClick={e => e.stopPropagation()}>
                            {(row.statut === 'facturee' || row.statut === 'payee') && (
                              <BoutonIcone taille="sm" icone={emailSendingId === row.id ? Loader2 : Mail}
                                libelle={row.clients?.email ? `Envoyer la facture à ${row.clients.email}` : 'Aucun e-mail client'}
                                disabled={!row.clients?.email || emailSendingId === row.id}
                                onClick={() => setEmailConfirm(row)} />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Mobile : cartes */}
                <div className="md:hidden flex flex-col divide-y divide-[var(--border)]">
                  {tableRows.map(row => {
                    const invoiceable = isInvoiceable(row)
                    const invoiceBlocked = invoiceable && invoiceClientId !== null && row.client_id !== invoiceClientId
                    const t = trajetOuReleve(row)
                    const heure = heureCourte(row.arrival_time)
                    const ht = deliveryTotalHtCts(row)
                    return (
                      <div key={row.id} className={`flex items-center gap-2 pl-3 ${invoiceBlocked ? 'opacity-50' : ''}`}>
                        {invoiceable && (
                          <CaseFacture row={row} coche={invoiceIds.has(row.id)} bloque={invoiceBlocked}
                            clientVerrou={invoiceClientName} onToggle={toggleInvoice} />
                        )}
                        <button onClick={() => openRow(row)}
                          className="flex-1 min-w-0 text-left py-2.5 pr-3 flex flex-col gap-1 hover:bg-[var(--bg-card-hover)] transition-colors">
                          <span className="flex items-baseline justify-between gap-2 min-w-0">
                            <span className="font-medium text-sm text-[var(--text)] truncate">{row.clients?.name ?? '—'}</span>
                            <span className="font-mono text-sm font-semibold text-[var(--text)] shrink-0">{ht > 0 ? formatCents(ht) : '—'}</span>
                          </span>
                          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] min-w-0">
                            <Route size={12} className="shrink-0" /><span className="truncate">{t.court}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2 text-xs min-w-0">
                            <span className="font-mono text-[var(--text-muted)] truncate">
                              {dateCourte(row.date, anneeCourante)}{heure && ` · ${heure}`}
                              {row.team_members?.full_name && <span className="font-sans"> · {row.team_members.full_name}</span>}
                            </span>
                            <span className="shrink-0"><BadgesStatut row={row} /></span>
                          </span>
                          {row.pennylane_invoice_number && (
                            <span className="font-mono text-xs text-[var(--text-muted)]">{row.pennylane_invoice_number}</span>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Aperçu = la seule porte de la facturation groupée */}
      <ApercuFacture
        open={previewInvoice}
        rows={invoiceSelectedRows}
        invoicing={invoicing}
        onFacturer={handleInvoice}
        onClose={() => setPreviewInvoice(false)}
      />

      {/* Confirmation envoi email au client (liste) */}
      <ConfirmDialog
        open={emailConfirm !== null}
        title="Envoyer la facture au client ?"
        message={emailConfirm
          ? `La facture Pennylane${emailConfirm.lv_pdf_url ? ' et la lettre de voiture seront envoyées' : ' sera envoyée'} à ${emailConfirm.clients?.email ?? ''}.`
          : ''}
        onConfirm={handleSendEmail}
        onCancel={() => setEmailConfirm(null)}
        loading={emailSendingId !== null}
      />

      <Suspense fallback={null}>
        <DrawerLivraison
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          delivery={selected}
          onSaved={recharger}
        />
      </Suspense>
    </Shell>
  )
}

const carteCls = 'rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]'
const champCls = `h-8 min-w-0 px-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-xs placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--brand)] transition-colors`
/** Libellé de carte, IDENTIQUE au Dashboard. */
const libelleCls = 'text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]'

/** Un chiffre de la période : même gabarit que les cartes du Dashboard, arrondi à l'euro. */
function Chiffre({ libelle, icone, valeur, detail, ton, actif, onClick, titre }: {
  libelle: string
  icone: ReactNode
  valeur: string
  detail: ReactNode
  ton?: 'warning' | 'danger'
  actif?: boolean
  onClick: () => void
  titre: string
}) {
  const couleur = ton === 'danger' ? 'var(--danger)' : ton === 'warning' ? 'var(--warning)' : 'var(--text)'
  return (
    <button type="button" onClick={onClick} title={titre} aria-pressed={actif}
      className={`${carteCls} p-3 text-left flex flex-col min-w-0 transition-colors hover:border-[var(--brand)] ${actif ? '!border-[var(--brand)]' : ''}`}>
      <span className={`inline-flex items-center gap-1.5 mb-2 min-h-[1.25rem] truncate ${libelleCls}`}>
        {icone} {libelle}
      </span>
      <span className="font-mono font-semibold text-base sm:text-2xl leading-tight truncate" style={{ color: couleur }}>{valeur}</span>
      <span className="mt-auto pt-1 text-[0.6875rem] sm:text-xs text-[var(--text-muted)] truncate">{detail}</span>
    </button>
  )
}

/** Bandeau d'une ligne (filtre de la cloche, synchronisation en attente). */
function Bandeau({ ton, icone, action, children }: {
  ton: 'warning' | 'danger'
  icone: ReactNode
  action: ReactNode
  children: ReactNode
}) {
  const c = ton === 'danger' ? 'var(--danger)' : 'var(--warning)'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 rounded-[var(--r-lg)] border text-sm"
      style={{ borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` }}>
      <span className="shrink-0" style={{ color: c }}>{icone}</span>
      <span className="flex-1 min-w-0 text-[var(--text)]">{children}</span>
      {action}
    </div>
  )
}

/** Statut + échec terrain + preuve de livraison. */
function BadgesStatut({ row }: { row: DeliveryRow }) {
  const echec = aProblemeOuvert({ statut: row.statut, probleme_le: row.probleme_le ?? null })
  return (
    <span className="inline-flex flex-wrap items-center gap-1 whitespace-nowrap [&_*]:whitespace-nowrap">
      <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut] ?? row.statut}</Badge>
      {echec && (
        <span title={[
          `Échec signalé${row.probleme_le ? ` le ${new Date(row.probleme_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`,
          row.probleme_note?.trim(),
        ].filter(Boolean).join(' — ')}>
          <Badge color="danger">Échec · {libelleMotif(row.probleme_motif)}</Badge>
        </span>
      )}
      {row.pod_captured_at && (
        <span className="inline-flex text-[var(--success)]"
          title={`Preuve de livraison enregistrée${row.pod_recipient_name ? ` (reçu par ${row.pod_recipient_name})` : ''}`}
          aria-label="Preuve de livraison enregistrée">
          <Camera size={14} />
        </span>
      )}
    </span>
  )
}

function NumeroFacture({ row }: { row: DeliveryRow }) {
  if (row.pennylane_invoice_number) return <span className="text-[var(--text)]" title={row.pennylane_invoice_number}>{row.pennylane_invoice_number}</span>
  if (row.pennylane_invoice_id) return <span className="text-[var(--text-muted)] italic">en attente</span>
  return <span className="text-[var(--text-disabled)]">—</span>
}

function CaseFacture({ row, coche, bloque, clientVerrou, onToggle }: {
  row: DeliveryRow
  coche: boolean
  bloque: boolean
  clientVerrou: string
  onToggle: (row: DeliveryRow) => void
}) {
  return (
    <input type="checkbox" checked={coche} onChange={() => onToggle(row)} disabled={bloque}
      title={bloque ? `Autre client sélectionné (${clientVerrou}) — désélectionnez d'abord` : 'Sélectionner pour facturer'}
      aria-label="Sélectionner pour facturer"
      className="accent-[var(--brand)] w-[1.1rem] h-[1.1rem] shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" />
  )
}
