import { useState, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Trash2, Loader2, Camera } from 'lucide-react'
import { DocumentsPanel } from '../documents/DocumentsPanel'
import { uploadDocument, listDocuments, getDownloadUrl } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { Drawer }      from '../../shared/ui/Drawer'
import { Button }      from '../../shared/ui/Button'
import { Badge }       from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import { useToast }    from '../../shared/ui/useToast'
import { useProfile, supabase } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney, addTva, centimesToEuros } from '../../shared/lib/money'
import {
  STATUS_LABELS, STATUS_COLORS, TYPE_LABELS,
  TRANSITION_ACTION_LABELS,
  allowedNextStatuses,
  computeAmount,
  effectiveHtCts, effectiveTtcCts,
} from './livraisons.logic'
import type { ClientTariff } from './livraisons.logic'
import {
  createDelivery, updateDelivery, transitionDelivery, deleteDelivery,
  getActiveClients, getActiveVehicles, getActiveDrivers, savePod,
  listDeliveryTemplates, createDeliveryTemplate,
} from './livraisons.queries'
import type { DeliveryTemplateLite } from './livraisons.queries'
import type { DeliveryRow, DeliveryStatus } from './livraisons.types'

// ── Types locaux ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  delivery?: DeliveryRow | null
  onSaved: () => void
}

type Tab = 'detail' | 'montant' | 'suivi' | 'documents' | 'pod'

interface ClientLookup extends ClientTariff {
  id: string
  label: string
}

interface Lookup { id: string; label: string }

// ── Formulaire ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  date:             TODAY,
  client_id:        '',
  vehicle_id:       '',
  driver_id:        '',
  type:             '',
  description:      '',
  pickup_address:   '',
  delivery_address: '',
  km:               '',
  empty_km:         '',
  pallets:          '',
  manual_ht:        '',   // HT en euros (mode manuel)
  tva_override:     '',   // TVA en euros, éditable dans tous les modes
  notes:            '',
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerLivraison({ open, onClose, delivery, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast }     = useToast()
  const isEdit        = !!delivery

  const [tab, setTab]           = useState<Tab>('detail')
  const [form, setForm]         = useState(EMPTY_FORM)
  const [tvaTouched, setTvaTouched] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [clientError, setClientError] = useState('')
  const [transitioning, setTransitioning] = useState<DeliveryStatus | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Coordonnées géocodées de l'adresse de livraison (Photon). null = saisie libre.
  const [deliveryCoords, setDeliveryCoords] =
    useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })

  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError]     = useState<string | null>(null)

  const [clients,  setClients]  = useState<ClientLookup[]>([])
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers,  setDrivers]  = useState<Lookup[]>([])

  // Modèles de course — chargés uniquement en CRÉATION (pré-remplissage).
  const [templates, setTemplates]     = useState<DeliveryTemplateLite[]>([])
  const [templateId, setTemplateId]   = useState('')

  // « Enregistrer comme modèle » — champ inline (libellé) + état de création.
  const [saveAsTplOpen, setSaveAsTplOpen] = useState(false)
  const [tplLabel, setTplLabel]           = useState('')
  const [savingTpl, setSavingTpl]         = useState(false)

  // ── Référentiels ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    getActiveClients().then(({ data }) =>
      setClients((data ?? []).map(c => ({
        id: c.id,
        label: c.name,
        tariff_mode: (c.tariff_mode ?? 'manuel') as ClientTariff['tariff_mode'],
        tariff_rate_cts: c.tariff_rate_cts ?? null,
      })))
    )
    getActiveVehicles().then(({ data }) =>
      setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label })))
    )
    getActiveDrivers().then(({ data }) =>
      setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name })))
    )
  }, [open])

  // ── Modèles de course (création uniquement) ────────────────────────────────────

  useEffect(() => {
    if (!open || delivery) { setTemplates([]); return }
    setTemplateId('')
    listDeliveryTemplates().then(({ data }) => setTemplates(data ?? []))
  }, [open, delivery])

  // Pré-remplit le formulaire depuis un modèle, sans toucher à la date ni au statut.
  // PIÈGE TVA : le modèle stocke un TAUX (tva_rate, en %) ; le form attend un MONTANT
  // de TVA en euros (tva_override). On convertit, puis setTvaTouched(true) pour figer.
  const applyTemplate = (id: string) => {
    setTemplateId(id)
    if (!id) return
    const t = templates.find(x => x.id === id)
    if (!t) return
    const tvaCts = t.amount_ht_cts != null && t.tva_rate != null
      ? Math.round(t.amount_ht_cts * t.tva_rate / 100)
      : null
    setForm(p => ({
      ...p,
      client_id:        t.client_id ?? '',
      vehicle_id:       t.vehicle_id ?? '',
      driver_id:        t.driver_id ?? '',
      type:             t.type ?? '',
      description:      t.description ?? '',
      pickup_address:   t.pickup_address ?? '',
      delivery_address: t.delivery_address ?? '',
      km:               t.km != null ? String(t.km) : '',
      empty_km:         t.empty_km != null ? String(t.empty_km) : '',
      pallets:          t.weight_kg != null ? String(t.weight_kg) : '',
      manual_ht:        t.amount_ht_cts != null ? String(centimesToEuros(t.amount_ht_cts)) : '',
      tva_override:     tvaCts != null ? String(centimesToEuros(tvaCts)) : '',
    }))
    setTvaTouched(true)
  }

  // Crée un modèle (delivery_templates) depuis les champs ACTUELS du form.
  // PIÈGE TVA (inverse) : le form porte tva_override = MONTANT TVA (€) et manual_ht = HT (€) ;
  // le modèle veut tva_rate = TAUX en %. On déduit le taux brut puis on le SNAPPE au taux légal.
  const handleSaveAsTemplate = async () => {
    const label = tplLabel.trim()
    if (!label) { toast('Le libellé du modèle est requis', 'error'); return }
    if (!companyId) { toast('Profil non chargé', 'error'); return }

    const rawRate = (form.tva_override && parseFloat(form.manual_ht) > 0)
      ? parseFloat(form.tva_override) / parseFloat(form.manual_ht) * 100 : 20
    const LEGAL = [0, 2.1, 5.5, 10, 20]
    const tva_rate = LEGAL.reduce((b, r) => Math.abs(r - rawRate) < Math.abs(b - rawRate) ? r : b, 20)

    setSavingTpl(true)
    const { error } = await createDeliveryTemplate({
      company_id:       companyId,
      label,
      client_id:        form.client_id || null,
      description:      form.description || null,
      pickup_address:   form.pickup_address || null,
      delivery_address: form.delivery_address || null,
      amount_ht_cts:    form.manual_ht ? Math.round(parseFloat(form.manual_ht) * 100) : null,
      tva_rate,
      type:             form.type || null,
      weight_kg:        form.pallets  ? Number(form.pallets)  : null,
      km:               form.km       ? Number(form.km)       : null,
      empty_km:         form.empty_km ? Number(form.empty_km) : null,
      vehicle_id:       form.vehicle_id || null,
      driver_id:        form.driver_id || null,
    })
    setSavingTpl(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    toast(`Modèle « ${label} » enregistré`)
    setSaveAsTplOpen(false)
    setTplLabel('')
  }

  // ── Initialisation formulaire ─────────────────────────────────────────────────

  useEffect(() => {
    if (delivery) {
      const storedTvaCts = delivery.tva_cts ?? null
      setTvaTouched(storedTvaCts != null)
      setForm({
        date:             delivery.date,
        client_id:        delivery.client_id,
        vehicle_id:       delivery.vehicle_id ?? '',
        driver_id:        delivery.driver_id ?? '',
        type:             delivery.type ?? '',
        description:      delivery.description ?? '',
        pickup_address:   delivery.pickup_address ?? '',
        delivery_address: delivery.delivery_address ?? '',
        km:               delivery.km != null ? String(delivery.km) : '',
        empty_km:         delivery.empty_km != null ? String(delivery.empty_km) : '',
        pallets:          delivery.weight_kg != null ? String(delivery.weight_kg) : '',
        manual_ht:        effectiveHtCts(delivery) > 0
                            ? (effectiveHtCts(delivery) / 100).toFixed(2) : '',
        tva_override:     storedTvaCts != null
                            ? (storedTvaCts / 100).toFixed(2) : '',
        notes:            delivery.notes ?? '',
      })
      setDeliveryCoords({ lat: delivery.delivery_lat ?? null, lng: delivery.delivery_lng ?? null })
    } else {
      setTvaTouched(false)
      setForm({ ...EMPTY_FORM, date: TODAY })
      setDeliveryCoords({ lat: null, lng: null })
    }
    setSaveAsTplOpen(false)
    setTplLabel('')
    setTab('detail')
  }, [delivery, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // ── Calcul trajet IGN ─────────────────────────────────────────────────────────

  const handleCalcTrajet = async () => {
    const depart  = form.pickup_address.trim()
    const arrivee = form.delivery_address.trim()
    if (!depart || !arrivee) {
      setCalcError("Renseignez l'adresse d'enlèvement et l'adresse de livraison avant de calculer.")
      return
    }
    setCalcLoading(true)
    setCalcError(null)
    const { data, error } = await supabase.functions.invoke('route-calc', {
      body: { depart, arrivee },
    })
    setCalcLoading(false)
    if (error || !data?.ok) {
      setCalcError(data?.error ?? error?.message ?? 'Erreur lors du calcul du trajet.')
      return
    }
    set('km', String(Math.round(data.data.distance_km as number)))
  }

  // ── Client sélectionné ────────────────────────────────────────────────────────

  const selectedClient = useMemo(
    () => clients.find(c => c.id === form.client_id) ?? null,
    [clients, form.client_id],
  )

  // ── Calcul du montant ─────────────────────────────────────────────────────────

  const computed = useMemo(() => {
    if (!selectedClient) return null
    return computeAmount(
      selectedClient,
      {
        distance_km:   form.km      ? parseFloat(form.km)      : null,
        pallets:       form.pallets ? parseFloat(form.pallets) : null,
        manual_ht_cts: form.manual_ht
          ? Math.round(parseFloat(form.manual_ht) * 100) : null,
        // TVA manuelle seulement si l'utilisateur l'a surchargée
        manual_tva_cts: tvaTouched && form.tva_override
          ? Math.round(parseFloat(form.tva_override) * 100) : null,
      },
    )
  }, [selectedClient, form.km, form.pallets, form.manual_ht, form.tva_override, tvaTouched])

  // Auto-remplit le champ TVA à 20 % du HT quand le HT change
  // et que l'utilisateur n'a pas encore surchargé la TVA.
  useEffect(() => {
    if (tvaTouched || !selectedClient) return
    const htCts = computed?.amount_ht_cts ?? 0
    if (htCts > 0) {
      const autoTvaCts = addTva(htCts, 0.20) - htCts
      setForm(p => ({ ...p, tva_override: (autoTvaCts / 100).toFixed(2) }))
    } else {
      setForm(p => ({ ...p, tva_override: '' }))
    }
  }, [computed?.amount_ht_cts, tvaTouched, selectedClient])

  // ── Permissions ───────────────────────────────────────────────────────────────

  const lockedStatuses: string[] = ['facturee', 'payee', 'annulee']
  const isDetailReadOnly  = isEdit && lockedStatuses.includes(delivery?.statut ?? '')
  const isMontantReadOnly = isEdit && lockedStatuses.includes(delivery?.statut ?? '')

  const tabs: { key: Tab; label: string }[] = isEdit
    ? [
        { key: 'detail',    label: 'Détail' },
        { key: 'montant',   label: 'Montant' },
        { key: 'suivi',     label: 'Suivi' },
        { key: 'documents', label: 'Documents' },
        { key: 'pod',       label: 'POD' },
      ]
    : [{ key: 'detail', label: 'Détail' }, { key: 'montant', label: 'Montant' }]

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.client_id) {
      setClientError('Le client est requis')
      toast('Le client est requis', 'error')
      return
    }
    setClientError('')
    if (!form.date)       { toast('La date est requise', 'error'); return }

    setSaving(true)
    try {
      // Seules les colonnes v2 sont écrites pour les montants.
      // montant_ht_cts (DEFAULT 0) et montant_ttc_cts (GENERATED) ne sont JAMAIS écrits.
      const payload = {
        date:             form.date,
        client_id:        form.client_id,
        vehicle_id:       form.vehicle_id  || null,
        driver_id:        form.driver_id   || null,
        type:             (form.type || null) as 'medical' | 'ecommerce' | 'retail' | 'particulier' | null,
        description:      form.description || null,
        pickup_address:   form.pickup_address   || null,
        delivery_address: form.delivery_address || null,
        delivery_lat:     deliveryCoords.lat,
        delivery_lng:     deliveryCoords.lng,
        km:               form.km       ? parseFloat(form.km)       : null,
        empty_km:         form.empty_km ? parseFloat(form.empty_km) : null,
        weight_kg:        form.pallets  ? parseFloat(form.pallets)  : null,
        amount_ht_cts:    computed?.amount_ht_cts  ?? null,
        tva_cts:          computed?.tva_cts         ?? null,
        amount_ttc_cts:   computed?.amount_ttc_cts ?? null,
        notes:            form.notes || null,
      }

      if (isEdit && delivery) {
        const { error } = await updateDelivery(delivery.id, payload)
        if (error) throw error
        toast('Livraison mise à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createDelivery({
          ...payload,
          company_id:  companyId,
          statut:      'planifiee',
          invoiced_at: null,
          paid_at:     null,
        })
        if (error) throw error
        toast('Livraison créée')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTransition = async (to: DeliveryStatus) => {
    if (!delivery) return

    if (to === 'facturee') {
      const ht = delivery.amount_ht_cts ?? 0
      if (ht <= 0) {
        toast("Montant requis avant de facturer — saisissez le montant dans l'onglet Montant", 'error')
        setTab('montant')
        return
      }
    }

    setTransitioning(to)

    const amountForTransition = to === 'facturee' ? {
      amount_ht_cts:  delivery.amount_ht_cts  ?? 0,
      tva_cts:        delivery.tva_cts         ?? 0,
      amount_ttc_cts: delivery.amount_ttc_cts ?? 0,
    } : undefined

    const { error } = await transitionDelivery(delivery.id, delivery.statut, to, amountForTransition)
    if (error) { toast(error.message, 'error'); setTransitioning(null); return }
    toast(`Livraison : ${STATUS_LABELS[to]}`)
    onSaved()
    onClose()
    setTransitioning(null)
  }

  const handleDelete = async () => {
    if (!delivery) return
    setDeleting(true)
    const { error } = await deleteDelivery(delivery.id)
    setDeleting(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDelete(false)
    toast('Livraison supprimée')
    onSaved()
    onClose()
  }

  // Suppression unitaire : gardée par permission delete.
  // Une livraison facturée/payée exige une double vérification (case à cocher).
  const { can } = usePermissions()
  const canDelete = isEdit && can('livraisons.livraisons', 'delete')
  const isInvoicedLike = ['facturee', 'payee'].includes(delivery?.statut ?? '')

  // ── Render ────────────────────────────────────────────────────────────────────

  const drawerTitle = isEdit
    ? `Livraison — ${delivery!.clients?.name ?? '…'}`
    : 'Nouvelle livraison'

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} width="max-w-xl">

      {isEdit && (
        <div className="flex items-center gap-2 mb-4">
          <Badge color={STATUS_COLORS[delivery!.statut] ?? 'muted'}>
            {STATUS_LABELS[delivery!.statut] ?? delivery!.statut}
          </Badge>
          {delivery!.type && (
            <Badge color="muted">{TYPE_LABELS[delivery!.type] ?? delivery!.type}</Badge>
          )}
          <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
            {new Date(delivery!.date).toLocaleDateString('fr-FR')}
          </span>
        </div>
      )}

      <div className="flex gap-0 mb-5 border-b border-[var(--border)]">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[var(--fs-sm)] transition-colors -mb-px
              ${tab === t.key
                ? 'text-[var(--brand)] border-b-2 border-[var(--brand)] font-medium'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Onglet Détail ────────────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="flex flex-col gap-4">
          {/* Pré-remplissage depuis un modèle — création uniquement, masqué si aucun modèle. */}
          {!isEdit && templates.length > 0 && (
            <Field label="Partir d'un modèle…">
              <select value={templateId} onChange={e => applyTemplate(e.target.value)}
                className={inputCls}>
                <option value="">— Aucun —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date planifiée *">
              <Input type="date" value={form.date} onChange={v => set('date', v)}
                disabled={isDetailReadOnly} />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={e => set('type', e.target.value)}
                disabled={isDetailReadOnly} className={inputCls}>
                <option value="">— Aucun —</option>
                {(['medical','ecommerce','retail','particulier'] as const).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Client *" error={clientError}>
            <select value={form.client_id}
              onChange={e => { set('client_id', e.target.value); setClientError('') }}
              disabled={isDetailReadOnly} className={inputCls}>
              <option value="">— Sélectionner un client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Véhicule">
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}
                disabled={isDetailReadOnly} className={inputCls}>
                <option value="">— Aucun —</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Chauffeur">
              <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)}
                disabled={isDetailReadOnly} className={inputCls}>
                <option value="">— Aucun —</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <Input value={form.description} onChange={v => set('description', v)}
              placeholder="Objet de la course…" disabled={isDetailReadOnly} />
          </Field>
          <Field label="Adresse d'enlèvement">
            <Input value={form.pickup_address} onChange={v => set('pickup_address', v)}
              placeholder="Rue, ville…" disabled={isDetailReadOnly} />
          </Field>
          <AddressAutocomplete
            label="Adresse de livraison"
            value={form.delivery_address}
            placeholder="Rue, ville…"
            disabled={isDetailReadOnly}
            onChange={v => {
              set('delivery_address', v)
              // Saisie libre : on invalide les coordonnées tant qu'aucune suggestion n'est choisie.
              setDeliveryCoords({ lat: null, lng: null })
            }}
            onSelect={s => {
              set('delivery_address', s.address)
              setDeliveryCoords({ lat: s.lat, lng: s.lng })
            }}
          />
          {deliveryCoords.lat != null && deliveryCoords.lng != null && (
            <p className="-mt-2 text-[var(--fs-xs)] text-[var(--text-muted)] font-mono">
              📍 {deliveryCoords.lat.toFixed(5)}, {deliveryCoords.lng.toFixed(5)}
            </p>
          )}
          {/* ── Section Distance ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 pt-3 border-t border-[var(--border-soft)]">
            <p className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Distance
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="KM en charge">
                <div className="flex gap-2">
                  <Input type="number" value={form.km} onChange={v => { set('km', v); setCalcError(null) }}
                    placeholder="0" disabled={isDetailReadOnly} />
                  {!isDetailReadOnly && (
                    <button
                      type="button"
                      onClick={handleCalcTrajet}
                      disabled={calcLoading}
                      title="Calculer le trajet via IGN"
                      className="flex-shrink-0 h-9 px-3 rounded-[var(--r-md)] border border-[var(--border)]
                        bg-[var(--bg-elevated)] text-[var(--fs-xs)] text-[var(--text-muted)]
                        hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                      {calcLoading
                        ? <Loader2 size={13} className="animate-spin" />
                        : <span>Calculer le trajet</span>}
                    </button>
                  )}
                </div>
              </Field>
              <Field label="KM à vide">
                <Input type="number" value={form.empty_km} onChange={v => set('empty_km', v)}
                  placeholder="0" disabled={isDetailReadOnly} />
              </Field>
            </div>
            {calcError && (
              <p className="text-[var(--danger)] text-[var(--fs-xs)]">{calcError}</p>
            )}
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} disabled={isDetailReadOnly} placeholder="Notes internes…"
              className={`${inputCls} resize-none`} />
          </Field>

          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            {!isDetailReadOnly && can('livraisons.livraisons', isEdit ? 'update' : 'create') && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {isDetailReadOnly ? 'Fermer' : 'Annuler'}
            </Button>
            {canDelete && (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}
                className="ml-auto text-[var(--danger)]">
                <Trash2 size={14} />
                Supprimer
              </Button>
            )}
          </div>

          {/* Enregistrer la course courante comme modèle réutilisable (création + édition). */}
          <div className="pt-3 border-t border-[var(--border)]">
            {!saveAsTplOpen ? (
              <Button variant="secondary" onClick={() => setSaveAsTplOpen(true)}>
                Enregistrer comme modèle
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Field label="Libellé du modèle *">
                  <Input value={tplLabel} onChange={setTplLabel}
                    placeholder="Nom du modèle…" />
                </Field>
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={handleSaveAsTemplate} disabled={savingTpl}>
                    {savingTpl ? 'Création…' : 'Créer le modèle'}
                  </Button>
                  <Button variant="secondary"
                    onClick={() => { setSaveAsTplOpen(false); setTplLabel('') }}
                    disabled={savingTpl}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Montant ───────────────────────────────────────────────────── */}
      {tab === 'montant' && (
        <MontantTab
          form={form}
          set={set}
          tvaTouched={tvaTouched}
          onTvaChange={v => { set('tva_override', v); setTvaTouched(true) }}
          selectedClient={selectedClient}
          computed={computed}
          delivery={delivery}
          isReadOnly={isMontantReadOnly}
          saving={saving}
          onSave={handleSave}
          onClose={onClose}
        />
      )}

      {/* ── Onglet Suivi ─────────────────────────────────────────────────────── */}
      {tab === 'suivi' && delivery && (
        <SuiviTab
          delivery={delivery}
          transitioning={transitioning}
          onTransition={handleTransition}
          onClose={onClose}
        />
      )}

      {/* ── Onglet Documents ─────────────────────────────────────────────────── */}
      {tab === 'documents' && (
        <DocumentsPanel entityType="delivery" entityId={delivery?.id ?? null} />
      )}

      {/* ── Onglet POD ───────────────────────────────────────────────────────── */}
      {tab === 'pod' && (
        <PodTab delivery={delivery ?? null} companyId={companyId} onSaved={onSaved} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette livraison ?"
        message={isInvoicedLike
          ? "Cette livraison est facturée. La supprimer ici ne touche PAS Pennylane : la facture devra être annulée séparément. Action irréversible."
          : 'Action irréversible.'}
        acknowledgeLabel={isInvoicedLike
          ? "Je comprends que cette livraison est facturée : la facture Pennylane devra être annulée séparément, et cette suppression est irréversible."
          : undefined}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
}

// ── Onglet Montant ────────────────────────────────────────────────────────────

function MontantTab({
  form, set, tvaTouched, onTvaChange,
  selectedClient, computed, delivery,
  isReadOnly, saving, onSave, onClose,
}: {
  form: typeof EMPTY_FORM
  set: (k: keyof typeof EMPTY_FORM, v: string) => void
  tvaTouched: boolean
  onTvaChange: (v: string) => void
  selectedClient: ClientTariff | null
  computed: ReturnType<typeof computeAmount>
  delivery?: DeliveryRow | null
  isReadOnly: boolean
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  const { can } = usePermissions()
  const isEdit    = delivery != null
  const canMontant = can('livraisons.livraisons', isEdit ? 'update' : 'create')
  const mode = selectedClient?.tariff_mode ?? 'manuel'

  // Valeurs à afficher : préfère computed (live), sinon valeurs stockées
  const displayHt  = computed?.amount_ht_cts  ?? (delivery ? effectiveHtCts(delivery)  : null)
  const displayTva = computed?.tva_cts         ?? delivery?.tva_cts                     ?? null
  const displayTtc = computed?.amount_ttc_cts ?? (delivery ? effectiveTtcCts(delivery) : null)

  return (
    <div className="flex flex-col gap-4">

      {/* Info tarif */}
      {selectedClient && (
        <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3
          text-[var(--fs-sm)] text-[var(--text-muted)]">
          Tarif : <span className="font-medium text-[var(--text)]">
            {mode === 'forfait' && 'Forfait fixe'}
            {mode === 'km'      && 'Au kilomètre'}
            {mode === 'palette' && 'À la palette'}
            {mode === 'manuel'  && 'Saisie manuelle'}
          </span>
          {selectedClient.tariff_rate_cts != null && mode !== 'manuel' && (
            <span className="ml-2 font-mono">
              ({formatMoney(selectedClient.tariff_rate_cts)}
              {mode === 'km' ? '/km' : mode === 'palette' ? '/palette' : ''})
            </span>
          )}
        </div>
      )}

      {!selectedClient && (
        <p className="text-[var(--fs-sm)] text-[var(--text-muted)] italic">
          Sélectionnez un client dans l'onglet Détail pour calculer le montant.
        </p>
      )}

      {/* Champs de saisie selon le mode tarifaire */}
      {selectedClient && mode === 'km' && (
        <Field label="Distance (km) *">
          <Input type="number" value={form.km} onChange={v => set('km', v)}
            placeholder="0" disabled={isReadOnly} />
        </Field>
      )}
      {selectedClient && mode === 'palette' && (
        <Field label="Nombre de palettes *">
          <Input type="number" value={form.pallets} onChange={v => set('pallets', v)}
            placeholder="0" disabled={isReadOnly} />
        </Field>
      )}
      {selectedClient && mode === 'manuel' && (
        <Field label="Montant HT (€) *">
          <Input type="number" value={form.manual_ht} onChange={v => set('manual_ht', v)}
            placeholder="0.00" disabled={isReadOnly} />
        </Field>
      )}

      {/* Champ TVA éditable — visible dès qu'un HT est calculable */}
      {selectedClient && (
        <Field label={`TVA (€)${tvaTouched ? ' ✎' : ' — auto 20 %'}`}>
          <Input
            type="number"
            value={form.tva_override}
            onChange={onTvaChange}
            placeholder="0.00"
            disabled={isReadOnly}
          />
        </Field>
      )}

      {/* Récapitulatif HT / TVA / TTC */}
      {displayHt != null && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
          <InfoRow label="Montant HT">
            <span className="font-mono">{formatMoney(displayHt)}</span>
          </InfoRow>
          <InfoRow label="TVA">
            <span className="font-mono">{displayTva != null ? formatMoney(displayTva) : '—'}</span>
          </InfoRow>
          <InfoRow label="Total TTC">
            <span className="font-mono font-semibold text-[var(--text)]">
              {displayTtc != null ? formatMoney(displayTtc) : '—'}
            </span>
          </InfoRow>
        </div>
      )}

      {/* Pennylane */}
      {delivery?.pennylane_invoice_id && (
        <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-2.5
          flex items-center justify-between text-[var(--fs-sm)]">
          <span className="text-[var(--text-muted)]">N° Pennylane</span>
          <span className="font-mono text-[var(--fs-xs)]">{delivery.pennylane_invoice_id}</span>
        </div>
      )}
      {delivery?.sync_pending && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)]
          bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--fs-xs)]">
          <Badge color="warning">Sync en attente</Badge>
          <span className="text-[var(--text-muted)]">Pennylane sera synchronisé dès que possible.</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
        {!isReadOnly && canMontant && (
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          {isReadOnly ? 'Fermer' : 'Annuler'}
        </Button>
      </div>
    </div>
  )
}

// ── Onglet Suivi ──────────────────────────────────────────────────────────────

const STATUS_TIMELINE: string[] = ['planifiee', 'en_cours', 'livree', 'facturee', 'payee']

function SuiviTab({
  delivery, transitioning, onTransition, onClose,
}: {
  delivery: DeliveryRow
  transitioning: DeliveryStatus | null
  onTransition: (to: DeliveryStatus) => void
  onClose: () => void
}) {
  const nextStatuses = allowedNextStatuses(delivery.statut)
  const actionLabels = TRANSITION_ACTION_LABELS[delivery.statut] ?? {}
  const currentIdx   = STATUS_TIMELINE.indexOf(delivery.statut)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col py-1">
        {STATUS_TIMELINE.map((s, i) => {
          const reached   = currentIdx >= 0 && i <= currentIdx
          const isCurrent = delivery.statut === s
          return (
            <div key={s} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <div className={`w-3 h-3 rounded-full flex-shrink-0
                  ${isCurrent
                    ? 'bg-[var(--brand)] ring-2 ring-[var(--brand)]/30'
                    : reached ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} />
                {i < STATUS_TIMELINE.length - 1 && (
                  <div className={`w-0.5 h-8 mt-0.5
                    ${reached && i < currentIdx ? 'bg-[var(--brand)]/40' : 'bg-[var(--border)]'}`} />
                )}
              </div>
              <div className="pb-4">
                <span className={`text-[var(--fs-sm)] font-medium
                  ${reached ? 'text-[var(--text)]' : 'text-[var(--text-disabled)]'}`}>
                  {STATUS_LABELS[s]}
                </span>
                {isCurrent && <span className="ml-2 text-[var(--fs-xs)] text-[var(--brand)]">← actuel</span>}
                {s === 'facturee' && delivery.invoiced_at && (
                  <span className="ml-2 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {new Date(delivery.invoiced_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
                {s === 'payee' && delivery.paid_at && (
                  <span className="ml-2 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {new Date(delivery.paid_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {delivery.statut === 'annulee' && (
          <div className="mt-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--danger)]" />
            <Badge color="danger">Annulée</Badge>
          </div>
        )}
      </div>

      {nextStatuses.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
          {nextStatuses.map(to => {
            const label    = actionLabels[to] ?? STATUS_LABELS[to]
            const isCancel = to === 'annulee'
            const isActive = transitioning === to
            return (
              <Button key={to}
                variant={isCancel ? 'secondary' : 'primary'}
                onClick={() => onTransition(to)}
                disabled={transitioning !== null}
                className={isCancel ? 'text-[var(--danger)] border-[var(--danger)]/40' : ''}>
                {isActive ? '…' : label}
              </Button>
            )
          })}
        </div>
      )}

      <div className={`pt-3 ${nextStatuses.length === 0 ? 'border-t border-[var(--border)]' : ''}`}>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  )
}

// ── Onglet POD ────────────────────────────────────────────────────────────────

function PodTab({
  delivery,
  companyId,
  onSaved,
}: {
  delivery: DeliveryRow | null
  companyId: string | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const isReadOnly = delivery?.statut === 'annulee'

  // Valeurs POD — tracking local pour refléter l'enregistrement sans attendre un rechargement complet
  const [capturedAt, setCapturedAt]         = useState(delivery?.pod_captured_at ?? null)
  const [recipientSaved, setRecipientSaved] = useState(delivery?.pod_recipient_name ?? '')

  // Formulaire
  const [recipient, setRecipient] = useState(delivery?.pod_recipient_name ?? '')

  // Photo courante (depuis DB ou juste uploadée)
  const [photoDoc, setPhotoDoc]   = useState<DocumentRow | null>(null)
  const [photoUrl, setPhotoUrl]   = useState<string | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState(false)

  // Opérations async
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)

  // Charge la photo POD la plus récente pour cette livraison
  useEffect(() => {
    if (!delivery) return
    setLoadingPhoto(true)
    listDocuments({ entity_type: 'delivery', entity_id: delivery.id, category: 'POD' })
      .then(async ({ data }) => {
        const latest = (data as DocumentRow[])?.[0] ?? null
        setPhotoDoc(latest)
        if (latest) {
          const url = await getDownloadUrl(latest)
          setPhotoUrl(url)
        } else {
          setPhotoUrl(null)
        }
      })
      .finally(() => setLoadingPhoto(false))
  }, [delivery?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !companyId || !delivery) return
    if (!file.type.startsWith('image/')) {
      toast('Seules les images sont acceptées pour la photo POD', 'error')
      return
    }
    setUploading(true)
    const { data, error } = await uploadDocument(file, companyId, {
      entity_type: 'delivery',
      entity_id:   delivery.id,
      category:    'POD',
    })
    setUploading(false)
    if (error) { toast(error.message, 'error'); return }
    if (data) {
      setPhotoDoc(data)
      const url = await getDownloadUrl(data)
      setPhotoUrl(url)
      toast('Photo ajoutée')
    }
  }

  const handleSave = async () => {
    if (!delivery) return
    if (!photoDoc)           { toast('Ajoutez d\'abord une photo de preuve', 'error'); return }
    if (!recipient.trim())   { toast('Le nom du réceptionnaire est requis', 'error'); return }
    setSaving(true)
    const { error } = await savePod(delivery.id, recipient.trim())
    setSaving(false)
    if (error) { toast((error as Error).message, 'error'); return }
    const now = new Date().toISOString()
    setCapturedAt(now)
    setRecipientSaved(recipient.trim())
    toast('Preuve de livraison enregistrée')
    onSaved()
  }

  if (!delivery) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)] italic py-4 text-center">
        Enregistre d'abord la livraison pour y rattacher une preuve.
      </p>
    )
  }

  const isCaptured = !!capturedAt

  const photoBlock = loadingPhoto ? (
    <div className="flex items-center justify-center py-6">
      <Loader2 size={20} className="animate-spin text-[var(--text-disabled)]" />
    </div>
  ) : photoUrl ? (
    <a href={photoUrl} target="_blank" rel="noopener noreferrer"
      className="block rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]
        hover:border-[var(--brand)] transition-colors">
      <img src={photoUrl} alt="Photo POD"
        className="w-full max-h-64 object-contain bg-[var(--bg-elevated)]" />
      <p className="px-3 py-1.5 text-[var(--fs-xs)] text-[var(--text-muted)] text-center">
        Cliquer pour ouvrir en grand
      </p>
    </a>
  ) : (
    <p className="text-[var(--fs-sm)] text-[var(--text-muted)] italic">Aucune photo trouvée</p>
  )

  if (isCaptured) {
    return (
      <div className="flex flex-col gap-4">
        {/* Bandeau succès */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)]
          bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--fs-sm)]">
          <span className="text-[var(--success)] font-semibold">✓</span>
          <span className="text-[var(--text)]">Preuve de livraison enregistrée</span>
        </div>

        {/* Méta */}
        <div className="flex flex-col gap-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between text-[var(--fs-sm)]">
            <span className="text-[var(--text-muted)]">Réceptionnaire</span>
            <span className="font-medium text-[var(--text)]">{recipientSaved}</span>
          </div>
          <div className="flex items-center justify-between text-[var(--fs-sm)]">
            <span className="text-[var(--text-muted)]">Horodatage</span>
            <span className="font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(capturedAt!).toLocaleString('fr-FR')}
            </span>
          </div>
        </div>

        {/* Photo */}
        {photoBlock}

        {/* Remplacement de la photo */}
        {!isReadOnly && (
          <div className="pt-2 border-t border-[var(--border)]">
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mb-2">
              Remplacer la photo (l'ancienne reste dans Documents) :
            </p>
            <input
              ref={fileRef}
              id="pod-file-replace"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            <label htmlFor="pod-file-replace"
              className={`inline-flex items-center gap-2 h-8 px-3 rounded-[var(--r-md)]
                border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fs-xs)]
                text-[var(--text-muted)] cursor-pointer
                hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors
                ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading
                ? <Loader2 size={12} className="animate-spin" />
                : <Camera size={12} />}
              {uploading ? 'Upload…' : 'Nouvelle photo'}
            </label>
          </div>
        )}
      </div>
    )
  }

  // ── Formulaire de capture ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom du réceptionnaire">
        <input
          type="text"
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder="Prénom Nom du signataire"
          disabled={isReadOnly}
          className={inputCls}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
          Photo de preuve
        </label>
        <input
          ref={fileRef}
          id="pod-file-add"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading || isReadOnly}
          className="hidden"
        />
        <label htmlFor="pod-file-add"
          className={`flex items-center gap-2 h-9 px-3 rounded-[var(--r-md)]
            border border-[var(--border)] bg-[var(--bg)] text-[var(--fs-sm)]
            text-[var(--text-muted)] cursor-pointer hover:border-[var(--brand)] transition-colors
            ${(uploading || isReadOnly) ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading
            ? <Loader2 size={14} className="animate-spin" />
            : <Camera size={14} />}
          {uploading
            ? 'Upload en cours…'
            : photoDoc ? 'Remplacer la photo' : 'Ajouter la photo de preuve'}
        </label>

        {/* Aperçu après upload */}
        {photoUrl && !loadingPhoto && (
          <div className="mt-2 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]">
            <img src={photoUrl} alt="Aperçu POD"
              className="w-full max-h-48 object-contain bg-[var(--bg-elevated)]" />
          </div>
        )}
      </div>

      {isReadOnly ? (
        <p className="text-[var(--fs-sm)] text-[var(--text-muted)] italic">
          La livraison est annulée — la preuve n'est pas modifiable.
        </p>
      ) : (
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || !photoDoc || !recipient.trim()}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la preuve'}
        </Button>
      )}
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function Input({
  type = 'text', value, onChange, placeholder, disabled,
}: {
  type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean
}) {
  return (
    <input type={type} value={value} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <span className="text-[var(--danger)] text-[var(--fs-xs)]">{error}</span>}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--fs-sm)]">{children}</span>
    </div>
  )
}
