import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drawer }     from '../../shared/ui/Drawer'
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
import { PRESTATIONS, PRESTATION_LABELS } from '../../shared/lib/prestations'
import type { Prestation } from '../../shared/lib/prestations'
import {
  STATUS_LABELS, STATUS_COLORS, isExpiredDisplay, addDays,
  UNITES, LIBELLES_UNITE, uniteParDefaut, prixParDefaut, montantsDevis, resumeLigne,
  ligneDepuisAncien, tarifDepuisDevis, seTransformeEnCourse,
} from './devis.logic'
import {
  createQuote, updateQuote, updateQuoteStatus, deleteQuote, appliquerTarifClient,
  listClientsLight, sendToPennylane, syncQuoteNumber, convertToInvoice, transformToDelivery,
} from './devis.queries'
import type { ClientDevis } from './devis.queries'
import type { Quote, QuoteStatus, UniteDevis } from './devis.types'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Field } from '../../shared/ui/Field'

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
  prestation: Prestation | ''
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
}

function formVide(): Form {
  const auj = toLocalISO(new Date())
  return {
    client_id: '', prestation: '', reference_client: '', date: auj, valid_until: addDays(auj, 30),
    description: '', unite: 'forfait', quantite: '1', prix: '', tva_rate: 20, autoliquidation: false,
    pickup_address: '', delivery_address: '', vehicle_id: '', driver_id: '', notes: '',
  }
}

function formDepuis(q: Quote): Form {
  const ligne = ligneDepuisAncien(q)
  return {
    client_id: q.client_id,
    prestation: q.prestation ?? '',
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
    } else {
      setForm(formVide())
      setExtraLines([])
    }
    setDateCourse(toLocalISO(new Date()))
  }, [quote, open])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }))
  const client = useMemo(() => clients.find(c => c.id === form.client_id) ?? null, [clients, form.client_id])

  /**
   * Choix du client : sa fiche donne la prestation habituelle, l'unité et le
   * prix de son tarif, l'autoliquidation (client UE identifié). Seules les
   * cases encore vides sont remplies : rien de saisi n'est écrasé.
   */
  const choisirClient = (id: string) => {
    const c = clients.find(x => x.id === id) ?? null
    setForm(f => {
      const prestation = (f.prestation || (c?.prestation_defaut as Prestation | null) || '') as Form['prestation']
      const unite = f.prix ? f.unite : uniteParDefaut(prestation || null, c?.tariff_mode)
      const prix = f.prix || ((prixParDefaut(unite, c) ?? null) != null ? (prixParDefaut(unite, c)! / 100).toFixed(2) : '')
      return {
        ...f, client_id: id, prestation, unite, prix,
        autoliquidation: autoliquidationParDefaut(c?.pays, c?.tva_intra),
        pickup_address: f.pickup_address || c?.retrait_adresse || '',
      }
    })
  }

  const choisirPrestation = (p: Prestation | '') => {
    setForm(f => {
      const unite = f.prix ? f.unite : uniteParDefaut(p || null, client?.tariff_mode)
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
  const quantite = useMemo(() => { const n = nombre(form.quantite); return n != null && n > 0 ? n : null }, [form.quantite])
  const montants = useMemo(() => montantsDevis({
    quantite, prix_unitaire_cts: prixCts, extra_lines: extraLines,
    tva_rate: form.tva_rate, autoliquidation: form.autoliquidation,
  }), [quantite, prixCts, extraLines, form.tva_rate, form.autoliquidation])

  const messagerie = form.prestation === 'messagerie'
  const sansTrajet = form.prestation === 'messagerie' || form.prestation === 'forfait'
  const tarifClient = client?.tariff_rate_cts != null && client.tariff_mode && client.tariff_mode !== 'manuel'
    ? `${formatMoney(client.tariff_rate_cts)} / ${client.tariff_mode === 'forfait' ? 'course' : client.tariff_mode}`
    : null

  // ── Statut ────────────────────────────────────────────────────────────────

  const aujourdhui = toLocalISO(new Date())
  const statut: QuoteStatus = quote?.statut ?? 'brouillon'
  const isReadOnly = (isEdit && statut !== 'brouillon')
    || !can('livraisons.devis', isEdit ? 'update' : 'create')
  const isTerminal = ['refuse', 'facture', 'expire', 'transforme'].includes(statut)
  const expired    = isExpiredDisplay(quote?.valid_until ?? null, statut, aujourdhui)

  // ── Enregistrer ───────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!form.client_id)          return 'Choisir le client'
    if (!form.description.trim()) return 'Décrire la prestation'
    if (quantite == null)         return 'Quantité invalide'
    if (montants.htCts <= 0)      return 'Le prix doit être supérieur à 0'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { toast(err, 'error'); return }
    setSaving(true)
    try {
      const payload = {
        client_id:        form.client_id,
        date:             form.date,
        valid_until:      form.valid_until || null,
        description:      form.description.trim() || null,
        prestation:       form.prestation || null,
        unite:            form.unite,
        quantite,
        prix_unitaire_cts: prixCts,
        // Un seul taux pour tout le devis : les suppléments suivent.
        extra_lines:      extraLines
          .filter(l => l.label.trim() || l.amount_ht_cts > 0)
          .map(l => ({ ...l, label: l.label.trim(), tva_rate: form.tva_rate })),
        reference_client: form.reference_client.trim() || null,
        autoliquidation:  form.autoliquidation,
        // Totaux (Pennylane émet une ligne au montant HT total, au taux effectif).
        amount_ht_cts:    montants.htCts,
        tva_rate:         form.tva_rate,
        tva_cts:          montants.tvaCts,
        amount_ttc_cts:   montants.ttcCts,
        pickup_address:   sansTrajet ? null : form.pickup_address.trim() || null,
        delivery_address: sansTrajet ? null : form.delivery_address.trim() || null,
        vehicle_id:       messagerie ? null : form.vehicle_id || null,
        driver_id:        messagerie ? null : form.driver_id || null,
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
        {/* ── Colonne 1 : quoi, pour qui ── */}
        <div className="flex flex-col gap-4">
          <Bloc titre="Client et prestation">
            <Field label="Client *">
              <select value={form.client_id} onChange={e => choisirClient(e.target.value)}
                disabled={isReadOnly} className="field">
                <option value="">— Choisir un client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Prestation">
              <select value={form.prestation} onChange={e => choisirPrestation(e.target.value as Prestation | '')}
                disabled={isReadOnly} className="field">
                <option value="">— Non précisée —</option>
                {PRESTATIONS.map(p => <option key={p} value={p}>{PRESTATION_LABELS[p]}</option>)}
              </select>
            </Field>
            <Field label="Objet du devis *">
              <input type="text" value={form.description} onChange={e => set('description', e.target.value)}
                placeholder={messagerie ? 'Ex. : Messagerie Strasbourg, colis livrés au mois' : 'Ex. : Transport palettes Strasbourg → Colmar'}
                disabled={isReadOnly} className="field" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Référence client">
                <input type="text" value={form.reference_client} onChange={e => set('reference_client', e.target.value)}
                  placeholder="N° de commande, ODT…" disabled={isReadOnly} className="field" />
              </Field>
              <Field label="Date">
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                  disabled={isReadOnly} className="field" />
              </Field>
            </div>
            <Field label="Valable jusqu'au">
              <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)}
                disabled={isReadOnly} className="field" />
            </Field>
          </Bloc>

          {!sansTrajet && (
            <Bloc titre="Trajet et exécution">
              <AddressAutocomplete label="Adresse de départ" value={form.pickup_address}
                onChange={v => set('pickup_address', v)} onSelect={s => set('pickup_address', s.address)}
                disabled={isReadOnly} />
              <AddressAutocomplete label="Adresse de livraison" value={form.delivery_address}
                onChange={v => set('delivery_address', v)} onSelect={s => set('delivery_address', s.address)}
                disabled={isReadOnly} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Véhicule">
                  <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}
                    disabled={isReadOnly} className="field">
                    <option value="">—</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </Field>
                <Field label="Chauffeur">
                  <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)}
                    disabled={isReadOnly} className="field">
                    <option value="">—</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </Field>
              </div>
            </Bloc>
          )}

          <Bloc titre="Notes internes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Non transmises au client"
              disabled={isReadOnly} className="field field-area resize-none" />
          </Bloc>
        </div>

        {/* ── Colonne 2 : le prix ── */}
        <div className="flex flex-col gap-4">
          <Bloc titre="Prix">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unité">
                <select value={form.unite} onChange={e => choisirUnite(e.target.value as UniteDevis)}
                  disabled={isReadOnly} className="field">
                  {UNITES.map(u => <option key={u} value={u}>{u === 'forfait' ? 'Forfait' : `Au ${LIBELLES_UNITE[u].court}`}</option>)}
                </select>
              </Field>
              <Field label={messagerie ? 'Colis par mois' : libUnite.quantite}>
                <input type="text" inputMode="decimal" value={form.quantite}
                  onChange={e => set('quantite', e.target.value)} disabled={isReadOnly} className="field" />
              </Field>
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

            <div className="grid grid-cols-2 gap-3 items-end">
              <Field label="Taux de TVA">
                <TvaRateInput value={form.autoliquidation ? 0 : form.tva_rate}
                  onChange={r => set('tva_rate', r)} disabled={isReadOnly || form.autoliquidation} />
              </Field>
              <label className="flex items-start gap-2 cursor-pointer pb-2">
                <input type="checkbox" checked={form.autoliquidation} disabled={isReadOnly}
                  onChange={e => set('autoliquidation', e.target.checked)}
                  className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer" />
                <span className="text-sm text-[var(--text)]">
                  Autoliquidation
                  <span className="block text-xs text-[var(--text-muted)]">Client UE identifié à la TVA</span>
                </span>
              </label>
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

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] p-3.5 flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{titre}</h3>
      {children}
    </section>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}
