import { useState, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Drawer }     from '../../shared/ui/Drawer'
import { Bloc, ChoixClient, ChoixPrestation, Champ as Field } from '../../shared/ui/FicheSaisie'
import { ContactLinks } from '../../shared/ui/ContactLinks'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import { ExtraLinesEditor } from '../../shared/ui/LignesSupplementaires'
import { Button }     from '../../shared/ui/Button'
import { Badge }      from '../../shared/ui/Badge'
import { useToast }   from '../../shared/ui/useToast'
import { useProfile, supabase } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney } from '../../shared/lib/money'
import type { DeliveryExtraLine } from '../../shared/lib/money'
import { toLocalISO } from '../../shared/lib/dates'
import { autoliquidationParDefaut } from '../../shared/lib/pays'
import { lireSupplements } from '../../shared/lib/supplements'
import { blocsPrestation } from '../../shared/lib/prestations'
import { libelleDelaiPaiement } from '../../shared/lib/paymentTerms'
import type { Prestation } from '../../shared/lib/prestations'
import {
  STATUS_LABELS, STATUS_COLORS, isExpiredDisplay, addDays,
  UNITES, LIBELLES_UNITE, uniteParDefaut, prixParDefaut, montantsDevis, resumeLigne,
  ligneDepuisAncien, tarifDepuisDevis, seTransformeEnCourse,
} from './devis.logic'
import {
  createQuote, updateQuote, updateQuoteStatus, deleteQuote, appliquerTarifClient,
  listClientsLight, calculerTrajet, sendToPennylane, syncQuoteNumber, convertToInvoice, transformToDelivery,
} from './devis.queries'
import type { ClientDevis } from './devis.queries'
import type { Quote, QuoteStatus, UniteDevis } from './devis.types'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  quote?: Quote | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }

interface Form {
  client_id: string
  prestation: Prestation
  reference_client: string
  date: string
  valid_until: string
  description: string
  unite: UniteDevis
  quantite: string
  prix: string
  tva_rate: number
  autoliquidation: boolean
  pickup_address: string
  delivery_address: string
  vehicle_id: string
  driver_id: string
  notes: string
  // Mêmes champs que la fiche livraison
  expediteur_nom: string
  expediteur_tel: string
  destinataire_nom: string
  destinataire_tel: string
  marchandise_desc: string
  nb_colis: string
  poids_kg: string
  volume_m3: string
  km: string
}

function formVide(): Form {
  const auj = toLocalISO(new Date())
  return {
    client_id: '', prestation: 'express', reference_client: '', date: auj, valid_until: addDays(auj, 30),
    description: '', unite: 'forfait', quantite: '1', prix: '', tva_rate: 20, autoliquidation: false,
    pickup_address: '', delivery_address: '', vehicle_id: '', driver_id: '', notes: '',
    expediteur_nom: '', expediteur_tel: '', destinataire_nom: '', destinataire_tel: '',
    marchandise_desc: '', nb_colis: '', poids_kg: '', volume_m3: '', km: '',
  }
}

function formDepuis(q: Quote): Form {
  const ligne = ligneDepuisAncien(q)
  return {
    client_id: q.client_id,
    prestation: q.prestation ?? 'express',
    reference_client: q.reference_client ?? '',
    date: q.date,
    valid_until: q.valid_until ?? addDays(q.date, 30),
    description: q.description ?? '',
    unite: ligne.unite,
    quantite: String(ligne.quantite),
    prix: (ligne.prix_unitaire_cts / 100).toFixed(2),
    tva_rate: q.tva_rate ?? 20,
    autoliquidation: q.autoliquidation,
    pickup_address: q.pickup_address ?? '',
    delivery_address: q.delivery_address ?? '',
    vehicle_id: q.vehicle_id ?? '',
    driver_id: q.driver_id ?? '',
    notes: q.notes ?? '',
    expediteur_nom: q.expediteur_nom ?? '',
    expediteur_tel: q.expediteur_tel ?? '',
    destinataire_nom: q.destinataire_nom ?? '',
    destinataire_tel: q.destinataire_tel ?? '',
    marchandise_desc: q.marchandise_desc ?? '',
    nb_colis: q.nb_colis != null ? String(q.nb_colis) : '',
    poids_kg: q.poids_kg != null ? String(q.poids_kg) : '',
    volume_m3: q.volume_m3 != null ? String(q.volume_m3) : '',
    km: q.km != null ? String(q.km) : (q.unite === 'km' && q.quantite != null ? String(q.quantite) : ''),
  }
}

/** « 1,5 » ou « 1.5 » → nombre ; vide / invalide → null. */
function nombre(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerDevis({ open, onClose, quote, onSaved }: Props) {
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const navigate = useNavigate()
  const isEdit = !!quote

  const [form, setForm] = useState<Form>(formVide)
  const [extraLines, setExtraLines] = useState<DeliveryExtraLine[]>([])
  const [clients, setClients] = useState<ClientDevis[]>([])
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers] = useState<Lookup[]>([])
  const [saving, setSaving] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing]   = useState(false)
  const [dateCourse, setDateCourse] = useState(() => toLocalISO(new Date()))
  const [tente, setTente] = useState(false)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)
  // Adresses du dernier trajet calculé : évite de rappeler l'IGN pour rien.
  const trajetCle = useRef('')

  // ── Chargement des listes ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    listClientsLight().then(({ data, error }) => {
      if (error) toast('Clients illisibles', 'error')
      setClients(data ?? [])
    })
    supabase.from('vehicles').select('id, label').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [open, toast])

  // ── Initialisation ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    if (quote) {
      setForm(formDepuis(quote))
      setExtraLines(quote.extra_lines ?? [])
      trajetCle.current = `${(quote.pickup_address ?? '').trim()}|${(quote.delivery_address ?? '').trim()}`
    } else {
      setForm(formVide())
      setExtraLines([])
      trajetCle.current = ''
    }
    setDateCourse(toLocalISO(new Date()))
    setTente(false)
    setCalcError(null)
  }, [quote, open])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }))
  const client = useMemo(() => clients.find(c => c.id === form.client_id) ?? null, [clients, form.client_id])

  /**
   * Choix du client — même règle que la fiche livraison : en CRÉATION, ses
   * habitudes (fiche client) remplissent les cases encore vides : prestation,
   * retrait habituel et son contact, chauffeur, véhicule, autoliquidation ;
   * en plus, l'unité et le prix de son tarif. En modification, rien n'est
   * pré-rempli.
   */
  const choisirClient = (id: string) => {
    const c = clients.find(x => x.id === id) ?? null
    if (!c || isEdit) { setForm(f => ({ ...f, client_id: id })); return }
    setForm(f => {
      const ou = (actuel: string, defaut: string | null) => actuel.trim() ? actuel : (defaut ?? '')
      const prestation = (c.prestation_defaut as Prestation | null)
        ?? (c.tariff_mode === 'colis' ? 'messagerie' : f.prestation)
      const unite = f.prix ? f.unite : uniteParDefaut(prestation, c.tariff_mode)
      const prixDefaut = prixParDefaut(unite, c)
      return {
        ...f, client_id: id, prestation, unite,
        prix: f.prix || (prixDefaut != null ? (prixDefaut / 100).toFixed(2) : ''),
        pickup_address: ou(f.pickup_address, c.retrait_adresse),
        expediteur_nom: ou(f.expediteur_nom, c.retrait_contact),
        expediteur_tel: ou(f.expediteur_tel, c.retrait_tel),
        driver_id: ou(f.driver_id, c.chauffeur_habituel_id),
        vehicle_id: ou(f.vehicle_id, c.vehicule_habituel_id),
        autoliquidation: autoliquidationParDefaut(c.pays, c.tva_intra),
      }
    })
  }

  const choisirPrestation = (p: Prestation) => {
    setForm(f => {
      const unite = f.prix ? f.unite : uniteParDefaut(p, client?.tariff_mode)
      const prixDefaut = prixParDefaut(unite, client)
      return { ...f, prestation: p, unite, prix: f.prix || (prixDefaut != null ? (prixDefaut / 100).toFixed(2) : '') }
    })
  }

  const choisirUnite = (u: UniteDevis) => {
    setForm(f => {
      const prixDefaut = prixParDefaut(u, client)
      return { ...f, unite: u, prix: prixDefaut != null && !f.prix ? (prixDefaut / 100).toFixed(2) : f.prix }
    })
  }

  // ── Montants ──────────────────────────────────────────────────────────────

  const prixCts = useMemo(() => { const n = nombre(form.prix); return n != null && n >= 0 ? Math.round(n * 100) : null }, [form.prix])
  // Au km, la quantité EST le trajet (une seule saisie : le champ km).
  const quantite = useMemo(() => {
    const n = nombre(form.unite === 'km' ? form.km : form.quantite)
    return n != null && n > 0 ? n : null
  }, [form.quantite, form.km, form.unite])
  // Suppléments tels qu'enregistrés et envoyés à Pennylane (lignes vides écartées ;
  // un seul taux pour tout le devis : les suppléments suivent).
  const extrasAEnvoyer = useMemo(() => extraLines
    .filter(l => l.label.trim() || l.amount_ht_cts > 0)
    .map(l => ({ ...l, label: l.label.trim(), tva_rate: form.tva_rate })), [extraLines, form.tva_rate])
  // Mêmes lignes que chez Pennylane (miroir de l'Edge) : TVA ligne par ligne.
  const montants = useMemo(() => montantsDevis({
    quantite, prix_unitaire_cts: prixCts, extra_lines: extrasAEnvoyer,
    tva_rate: form.tva_rate, autoliquidation: form.autoliquidation,
  }), [quantite, prixCts, extrasAEnvoyer, form.tva_rate, form.autoliquidation])

  const blocs = blocsPrestation(form.prestation)
  const messagerie = blocs.releve
  const tarifClient = client?.tariff_rate_cts != null && client.tariff_mode && client.tariff_mode !== 'manuel'
    ? `${formatMoney(client.tariff_rate_cts)} / ${client.tariff_mode === 'forfait' ? 'course' : client.tariff_mode}`
    : null

  // ── Trajet (même calcul que la fiche livraison : IGN, automatique) ────────

  const lancerTrajet = async (depart: string, arrivee: string, silencieux: boolean) => {
    if (!depart || !arrivee) {
      if (!silencieux) setCalcError("Renseignez l'adresse de retrait et l'adresse de livraison avant de calculer.")
      return
    }
    trajetCle.current = `${depart}|${arrivee}`
    setCalcLoading(true)
    setCalcError(null)
    const { data, error } = await calculerTrajet(depart, arrivee)
    setCalcLoading(false)
    if (error || !data?.ok) { setCalcError(data?.error ?? error?.message ?? 'Erreur lors du calcul du trajet.'); return }
    set('km', String(Math.round(data.data.distance_km as number)))
  }

  // ── Statut ────────────────────────────────────────────────────────────────

  const aujourdhui = toLocalISO(new Date())
  const statut: QuoteStatus = quote?.statut ?? 'brouillon'
  const isReadOnly = (isEdit && statut !== 'brouillon')
    || !can('livraisons.devis', isEdit ? 'update' : 'create')

  useEffect(() => {
    if (!open || isReadOnly || !blocs.retrait) return
    const depart = form.pickup_address.trim()
    const arrivee = form.delivery_address.trim()
    if (!depart || !arrivee) return
    const cle = `${depart}|${arrivee}`
    if (cle === trajetCle.current) return
    const t = setTimeout(() => { void lancerTrajet(depart, arrivee, true) }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isReadOnly, blocs.retrait, form.pickup_address, form.delivery_address])
  const isTerminal = ['refuse', 'facture', 'expire', 'transforme'].includes(statut)
  const expired    = isExpiredDisplay(quote?.valid_until ?? null, statut, aujourdhui)

  // ── Enregistrer ───────────────────────────────────────────────────────────

  /** Ce qui manque pour enregistrer (même présentation que la fiche livraison). */
  const manques = [
    !form.client_id && 'client',
    client?.reference_obligatoire && !form.reference_client.trim() && 'référence client (exigée par ce client)',
    quantite == null && (form.unite === 'km' ? 'kilomètres' : 'quantité'),
    montants.htCts <= 0 && 'prix',
    montants.htCts > 0 && montants.blocage,
  ].filter(Boolean) as string[]

  const handleSave = async () => {
    setTente(true)
    if (manques.length) { toast(`À compléter : ${manques.join(', ')}`, 'error'); return }
    setSaving(true)
    try {
      const payload = {
        client_id:        form.client_id,
        date:             form.date,
        valid_until:      form.valid_until || null,
        description:      form.description.trim() || null,
        prestation:       form.prestation,
        unite:            form.unite,
        quantite,
        prix_unitaire_cts: prixCts,
        extra_lines:      extrasAEnvoyer,
        reference_client: form.reference_client.trim() || null,
        autoliquidation:  form.autoliquidation,
        // Totaux des lignes envoyées à Pennylane (ligne principale + suppléments).
        amount_ht_cts:    montants.htCts,
        tva_rate:         form.tva_rate,
        tva_cts:          montants.tvaCts,
        amount_ttc_cts:   montants.ttcCts,
        // Champs absents de la prestation (comme la fiche livraison) : vidés.
        pickup_address:   blocs.retrait ? form.pickup_address.trim() || null : null,
        delivery_address: blocs.livraison ? form.delivery_address.trim() || null : null,
        expediteur_nom:   blocs.retrait ? form.expediteur_nom.trim() || null : null,
        expediteur_tel:   blocs.retrait ? form.expediteur_tel.trim() || null : null,
        destinataire_nom: blocs.livraison ? form.destinataire_nom.trim() || null : null,
        destinataire_tel: blocs.livraison ? form.destinataire_tel.trim() || null : null,
        marchandise_desc: blocs.marchandise ? form.marchandise_desc.trim() || null : null,
        nb_colis:         blocs.marchandise && nombre(form.nb_colis) != null ? Math.round(nombre(form.nb_colis)!) : null,
        poids_kg:         blocs.marchandise ? nombre(form.poids_kg) : null,
        volume_m3:        blocs.marchandise ? nombre(form.volume_m3) : null,
        km:               blocs.retrait || form.unite === 'km' ? nombre(form.km) : null,
        vehicle_id:       blocs.execution ? form.vehicle_id || null : null,
        driver_id:        blocs.execution ? form.driver_id || null : null,
        notes:            form.notes.trim() || null,
      }
      if (isEdit && quote) {
        const { error } = await updateQuote(quote.id, payload)
        if (error) throw error
        toast('Devis mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createQuote({
          ...payload, company_id: companyId, statut: 'brouillon',
          pennylane_quote_id: null, pennylane_invoice_id: null, accepte_le: null,
        })
        if (error) throw error
        toast('Devis créé')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message ?? 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Actions de cycle de vie ───────────────────────────────────────────────

  const handleSend = async () => {
    if (!quote) return
    setActioning(true)
    const { data, error } = await sendToPennylane(quote.id)
    setActioning(false)
    if (error || !data?.ok) {
      toast(data?.error ?? (error as Error)?.message ?? 'Erreur Pennylane', 'error')
      return
    }
    await updateQuoteStatus(quote.id, 'envoye')
    toast('Devis envoyé chez Pennylane')
    onSaved(); onClose()
  }

  const handleMark = async (s: QuoteStatus) => {
    if (!quote) return
    setActioning(true)
    const { error } = await updateQuoteStatus(quote.id, s)
    setActioning(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    toast(`Devis marqué : ${STATUS_LABELS[s]}`)
    onSaved(); onClose()
  }

  /** Crée la course (tout repris) puis l'ouvre dans Livraisons pour la compléter. */
  const handleTransform = async () => {
    if (!quote || !companyId) return
    setActioning(true)
    const { id, error } = await transformToDelivery(quote, dateCourse, companyId)
    setActioning(false)
    if (error || !id) { toast(error?.message ?? 'Course non créée', 'error'); return }
    toast('Course créée depuis le devis : à compléter')
    onSaved(); onClose()
    navigate(`/livraisons?ouvrir=${id}`)
  }

  const tarif = quote ? tarifDepuisDevis(quote) : null
  const handleAppliquerTarif = async () => {
    if (!quote || !tarif) return
    setActioning(true)
    const { error } = await appliquerTarifClient(quote.id, quote.client_id, tarif)
    setActioning(false)
    if (error) { toast((error as { message?: string }).message ?? 'Erreur', 'error'); return }
    toast(`Tarif du client : ${formatMoney(tarif.tariff_rate_cts)} / ${LIBELLES_UNITE[tarif.tariff_mode].court}`)
    onSaved(); onClose()
  }

  const handleConvert = async () => {
    if (!quote) return
    setActioning(true)
    const { data, error } = await convertToInvoice(quote.id)
    setActioning(false)
    if (error || !data?.ok) {
      toast(data?.error ?? (error as Error)?.message ?? 'Erreur Pennylane', 'error')
      return
    }
    await updateQuoteStatus(quote.id, 'facture')
    toast('Devis converti en facture')
    onSaved(); onClose()
  }

  const handleSyncNumber = async () => {
    if (!quote) return
    setSyncing(true)
    const { data, error } = await syncQuoteNumber(quote.id)
    setSyncing(false)
    if (error || !data?.ok) {
      toast(data?.error ?? (error as Error)?.message ?? 'Erreur Pennylane', 'error')
      return
    }
    toast(`Numéro récupéré : ${data.data?.pennylane_quote_number ?? '—'}`)
    onSaved()
  }

  const handleDelete = async () => {
    if (!quote) return
    setDeleting(true)
    const { error } = await deleteQuote(quote.id)
    setDeleting(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    setConfirmDelete(false)
    toast('Devis supprimé')
    onSaved(); onClose()
  }

  // Droits d'écran (la RLS et l'Edge `pennylane-quote` les revérifient côté serveur).
  const canDelete  = isEdit && can('livraisons.devis', 'delete')
  const canSave    = can('livraisons.devis', isEdit ? 'update' : 'create')
  const canSend    = isEdit && can('livraisons.devis', 'create')
  const canUpdate  = isEdit && can('livraisons.devis', 'update')
  const canTransform = canUpdate && can('livraisons.livraisons', 'create')
  const canTarif   = canUpdate && can('tiers.clients', 'update')
  const enCourse   = seTransformeEnCourse(quote?.prestation ?? null)
  const isInvoiced = statut === 'facture' || !!quote?.pennylane_invoice_id
  const isLinked   = !!quote?.pennylane_quote_id || !!quote?.pennylane_invoice_id

  const deleteMessage = isInvoiced
    ? "Ce devis est facturé. Le supprimer ici ne touche PAS Pennylane : la facture devra être annulée par un avoir séparément. Action irréversible."
    : isLinked
    ? "Ce devis existe chez Pennylane. Le supprimer ici ne le supprime pas chez Pennylane. Action irréversible."
    : "Action irréversible."
  const deleteAcknowledge = isInvoiced
    ? "Je comprends que ce devis est facturé : la facture Pennylane devra être annulée par un avoir, et cette suppression est irréversible."
    : isLinked
    ? "Je comprends que le devis restera présent chez Pennylane et que cette suppression est irréversible."
    : undefined

  const drawerTitle = isEdit ? `Devis — ${quote!.clients?.name ?? '…'}` : 'Nouveau devis'
  const libUnite = LIBELLES_UNITE[form.unite]

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} width="max-w-[min(64rem,100vw)]">

      {isEdit && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge color={STATUS_COLORS[statut]}>{STATUS_LABELS[statut]}</Badge>
          {expired && <Badge color="warning">Validité dépassée</Badge>}
          {quote!.accepte_le && (
            <span className="text-xs text-[var(--text-muted)]">
              Accepté le {new Date(quote!.accepte_le).toLocaleDateString('fr-FR')}
            </span>
          )}
          {quote!.pennylane_quote_id && (
            quote!.pennylane_quote_number
              ? <span className="ml-auto font-mono text-xs text-[var(--text-muted)]" title={quote!.pennylane_quote_id}>
                  {quote!.pennylane_quote_number}
                </span>
              : <div className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text-muted)] italic">N° en attente</span>
                  {canUpdate && (
                    <Button variant="ghost" size="compact" onClick={handleSyncNumber} disabled={syncing}>
                      {syncing ? '…' : 'Synchroniser le n°'}
                    </Button>
                  )}
                </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Colonne 1 : le devis et les arrêts (mêmes blocs que la fiche livraison) */}
        <div className="flex flex-col gap-4 min-w-0">
          <Bloc titre="Devis">
            <Field label="Prestation">
              <ChoixPrestation value={form.prestation} onChange={choisirPrestation} disabled={isReadOnly} />
            </Field>
            <Field label="Client *">
              <ChoixClient clients={clients.map(c => ({ id: c.id, label: c.name }))} value={form.client_id}
                onChange={choisirClient} disabled={isReadOnly} />
              {client && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                  {(client.phone || client.email) && <ContactLinks phone={client.phone} email={client.email} />}
                  <span>Paiement : {libelleDelaiPaiement(client)}</span>
                </div>
              )}
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={client?.reference_obligatoire ? 'Référence client *' : 'Référence client'}>
                <input type="text" value={form.reference_client} onChange={e => set('reference_client', e.target.value)}
                  placeholder="ODT, n° de commande…" disabled={isReadOnly} className="field" />
              </Field>
              <Field label="Date du devis">
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                  disabled={isReadOnly} className="field" />
              </Field>
            </div>
            <Field label="Valable jusqu'au">
              <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)}
                disabled={isReadOnly} className="field" />
            </Field>
          </Bloc>

          {blocs.retrait && (
            <Bloc titre="Retrait">
              <AddressAutocomplete value={form.pickup_address} placeholder="Rue, ville… (vide = départ du dépôt)"
                onChange={v => set('pickup_address', v)} onSelect={s => set('pickup_address', s.address)}
                disabled={isReadOnly} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Qui remet">
                  <input type="text" value={form.expediteur_nom} onChange={e => set('expediteur_nom', e.target.value)}
                    placeholder="Nom, société" disabled={isReadOnly} className="field" />
                </Field>
                <Field label="Téléphone">
                  <input type="tel" value={form.expediteur_tel} onChange={e => set('expediteur_tel', e.target.value)}
                    placeholder="06…" disabled={isReadOnly} className="field" />
                </Field>
              </div>
            </Bloc>
          )}

          {blocs.livraison && (
            <Bloc titre={blocs.titreLivraison}>
              <AddressAutocomplete value={form.delivery_address} placeholder="Rue, ville…"
                onChange={v => set('delivery_address', v)} onSelect={s => set('delivery_address', s.address)}
                disabled={isReadOnly} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={form.prestation === 'mise_a_dispo' ? 'Contact sur place' : 'Qui reçoit'}>
                  <input type="text" value={form.destinataire_nom} onChange={e => set('destinataire_nom', e.target.value)}
                    placeholder="Nom, société" disabled={isReadOnly} className="field" />
                </Field>
                <Field label="Téléphone">
                  <input type="tel" value={form.destinataire_tel} onChange={e => set('destinataire_tel', e.target.value)}
                    placeholder="06…" disabled={isReadOnly} className="field" />
                </Field>
              </div>
            </Bloc>
          )}

          {blocs.retrait && (
            <div className="flex flex-wrap items-center gap-3 px-1">
              <span className="text-xs uppercase tracking-wide font-medium text-[var(--text-muted)]">Trajet</span>
              {calcLoading && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-[var(--text-muted)]">km</span>
                <input type="text" inputMode="decimal" value={form.km} onChange={e => { set('km', e.target.value); setCalcError(null) }}
                  placeholder="0" disabled={isReadOnly} className="field w-[5.5rem]" />
                {!isReadOnly && (
                  <BoutonIcone icone={RefreshCw} libelle="Recalculer le trajet (IGN)" taille="sm" disabled={calcLoading}
                    onClick={() => lancerTrajet(form.pickup_address.trim(), form.delivery_address.trim(), false)} />
                )}
              </div>
              {calcError && <span className="basis-full text-xs text-[var(--warning)]">{calcError}</span>}
            </div>
          )}
        </div>

        {/* Colonne 2 : marchandise, exécution & prix, note */}
        <div className="flex flex-col gap-4 min-w-0">
          {blocs.marchandise && (
            <Bloc titre="Marchandise">
              <Field label="Nature">
                <input type="text" value={form.marchandise_desc} onChange={e => set('marchandise_desc', e.target.value)}
                  placeholder="Colis, palette, meuble, documents…" disabled={isReadOnly} className="field" />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Colis">
                  <input type="text" inputMode="numeric" value={form.nb_colis} onChange={e => set('nb_colis', e.target.value)}
                    placeholder="0" disabled={isReadOnly} className="field" />
                </Field>
                <Field label="Poids (kg)">
                  <input type="text" inputMode="decimal" value={form.poids_kg} onChange={e => set('poids_kg', e.target.value)}
                    placeholder="0" disabled={isReadOnly} className="field" />
                </Field>
                <Field label="Volume (m³)">
                  <input type="text" inputMode="decimal" value={form.volume_m3} onChange={e => set('volume_m3', e.target.value)}
                    placeholder="0" disabled={isReadOnly} className="field" />
                </Field>
              </div>
            </Bloc>
          )}

          <Bloc titre={messagerie ? 'Prix' : 'Exécution & prix'}>
            {blocs.execution && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Chauffeur">
                  <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)}
                    disabled={isReadOnly} className="field">
                    <option value="">— À affecter —</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </Field>
                <Field label="Véhicule">
                  <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}
                    disabled={isReadOnly} className="field">
                    <option value="">— À affecter —</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Libellé (devis, puis facture)">
              <input type="text" value={form.description} onChange={e => set('description', e.target.value)}
                placeholder={`Vide = « Devis du ${new Date(`${form.date}T00:00:00`).toLocaleDateString('fr-FR')} »`}
                disabled={isReadOnly} className="field" />
              {form.reference_client.trim() && (
                <span className="text-xs text-[var(--text-muted)]">La référence client est reprise sur la course et la facture.</span>
              )}
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Unité">
                <select value={form.unite} onChange={e => choisirUnite(e.target.value as UniteDevis)}
                  disabled={isReadOnly} className="field">
                  {UNITES.map(u => <option key={u} value={u}>{u === 'forfait' ? 'Forfait' : `Au ${LIBELLES_UNITE[u].court}`}</option>)}
                </select>
              </Field>
              {form.unite === 'km' ? (
                <Field label="Kilomètres">
                  <input type="text" inputMode="decimal" value={form.km} onChange={e => set('km', e.target.value)}
                    disabled={isReadOnly} className="field" />
                </Field>
              ) : (
                <Field label={messagerie ? 'Colis par mois' : libUnite.quantite}>
                  <input type="text" inputMode="decimal" value={form.quantite}
                    onChange={e => set('quantite', e.target.value)} disabled={isReadOnly} className="field" />
                </Field>
              )}
              <Field label={form.unite === 'forfait' ? 'Prix HT (€)' : `€ HT / ${libUnite.court}`}>
                <input type="text" inputMode="decimal" value={form.prix} placeholder="0,00"
                  onChange={e => set('prix', e.target.value)} disabled={isReadOnly} className="field" />
              </Field>
            </div>
            {tarifClient && (
              <p className="text-xs text-[var(--text-muted)]">Tarif actuel du client : {tarifClient}</p>
            )}
            {messagerie && (
              <p className="text-xs text-[var(--text-muted)]">
                Les colis par mois servent à chiffrer le volume ; chaque mois, le relevé facture les colis réellement livrés à ce prix.
              </p>
            )}

            <ExtraLinesEditor
              lines={extraLines}
              onChange={setExtraLines}
              defaultTvaRate={form.tva_rate}
              tauxForce={form.autoliquidation ? 0 : form.tva_rate}
              disabled={isReadOnly}
              catalogue={lireSupplements(client?.supplements)}
            />

            {/* Autoliquidation avant la TVA, qu'elle annule (comme la fiche livraison) */}
            <label className="flex items-start gap-2 cursor-pointer rounded-[var(--r-md)] border border-[var(--border)] p-2.5">
              <input type="checkbox" checked={form.autoliquidation} disabled={isReadOnly}
                onChange={e => set('autoliquidation', e.target.checked)}
                className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer" />
              <span className="text-sm text-[var(--text)]">
                Autoliquidation — TVA due par le preneur
                <span className="block text-xs text-[var(--text-muted)]">
                  Prestation intracommunautaire B2B (art. 259-1 du CGI). La TVA n'est pas facturée : le TTC vaut le HT.
                </span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3 items-end">
              <Field label="Taux TVA">
                <TvaRateInput value={form.autoliquidation ? 0 : form.tva_rate}
                  onChange={r => set('tva_rate', r)} disabled={isReadOnly || form.autoliquidation} />
              </Field>
            </div>

            <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              <InfoRow label={resumeLigne(form.unite, quantite, prixCts)}>
                <span className="font-mono">{formatMoney(montants.principalHtCts)}</span>
              </InfoRow>
              {montants.supplementsHtCts > 0 && (
                <InfoRow label="Suppléments"><span className="font-mono">{formatMoney(montants.supplementsHtCts)}</span></InfoRow>
              )}
              <InfoRow label="Total HT"><span className="font-mono">{formatMoney(montants.htCts)}</span></InfoRow>
              <InfoRow label={form.autoliquidation ? 'TVA (autoliquidation)' : `TVA ${form.tva_rate} %`}>
                <span className="font-mono">{formatMoney(montants.tvaCts)}</span>
              </InfoRow>
              <InfoRow label="Total TTC">
                <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(montants.ttcCts)}</span>
              </InfoRow>
            </div>
          </Bloc>

          <Bloc titre="Note">
            <Field label="Note interne (bureau seulement)">
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                rows={3} placeholder="Non transmise au client"
                disabled={isReadOnly} className="field field-area resize-none" />
            </Field>
          </Bloc>
        </div>
      </div>

      {/* Barre d'actions fixe en bas du tiroir */}
      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-4 px-5 py-3 flex flex-wrap items-center gap-2
        bg-[var(--bg-elevated)] border-t border-[var(--border)] z-10">

        {statut === 'brouillon' && (
          <>
            {canSave && (
              <Button variant="primary" onClick={handleSave} disabled={saving || actioning}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            )}
            {canSend && (
              <Button variant="secondary" onClick={handleSend} disabled={saving || actioning}>
                {actioning ? '…' : 'Envoyer chez Pennylane'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            {tente && manques.length > 0 && (
              <span className="text-xs text-[var(--danger)]">À compléter : {manques.join(', ')}</span>
            )}
          </>
        )}

        {statut === 'envoye' && (
          <>
            {canUpdate && (
              <>
                <Button variant="primary" onClick={() => handleMark('accepte')} disabled={actioning}>
                  {actioning ? '…' : 'Marquer accepté'}
                </Button>
                <Button variant="secondary" onClick={() => handleMark('refuse')} disabled={actioning}
                  className="text-[var(--danger)] border-[var(--danger)]/40">
                  Marquer refusé
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          </>
        )}

        {statut === 'accepte' && (
          <>
            {tarif && canTarif && (
              <Button variant={enCourse ? 'secondary' : 'primary'} onClick={handleAppliquerTarif} disabled={actioning}
                title="Écrit ce prix dans la fiche client : relevés et courses le reprendront">
                Appliquer ce prix au client
              </Button>
            )}
            {enCourse && canTransform && (
              <span className="inline-flex items-center gap-2">
                <input type="date" value={dateCourse} onChange={e => setDateCourse(e.target.value)}
                  aria-label="Date de la course" className="field h-9 w-auto" />
                <Button variant="primary" onClick={handleTransform} disabled={actioning || !dateCourse}>
                  {actioning ? '…' : 'Créer la course'}
                </Button>
              </span>
            )}
            {canUpdate && (
              <>
                {/* Messagerie : la facture vient des relevés mensuels, pas du devis. */}
                {quote?.prestation !== 'messagerie' && (
                  <Button variant="secondary" onClick={handleConvert} disabled={actioning}>
                    Facturer directement
                  </Button>
                )}
                <Button variant="secondary" onClick={() => handleMark('refuse')} disabled={actioning}
                  className="text-[var(--danger)] border-[var(--danger)]/40">
                  Marquer refusé
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          </>
        )}

        {isTerminal && <Button variant="secondary" onClick={onClose}>Fermer</Button>}

        {canDelete && (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="ml-auto text-[var(--danger)]">
            Supprimer
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce devis ?"
        message={deleteMessage}
        acknowledgeLabel={deleteAcknowledge}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}
