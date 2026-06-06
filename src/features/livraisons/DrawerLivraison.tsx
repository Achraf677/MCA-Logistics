import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Trash2 }      from 'lucide-react'
import { Drawer }      from '../../shared/ui/Drawer'
import { Button }      from '../../shared/ui/Button'
import { Badge }       from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast }    from '../../shared/ui/useToast'
import { useProfile }  from '../../app/providers'
import { formatMoney, addTva } from '../../shared/lib/money'
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
  getActiveClients, getActiveVehicles, getActiveDrivers,
} from './livraisons.queries'
import type { DeliveryRow, DeliveryStatus } from './livraisons.types'

// ── Types locaux ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  delivery?: DeliveryRow | null
  onSaved: () => void
}

type Tab = 'detail' | 'montant' | 'suivi'

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
  pallets:          '',
  manual_ht:        '',   // HT en euros (mode manuel)
  tva_override:     '',   // TVA en euros, éditable dans tous les modes
  notes:            '',
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerLivraison({ open, onClose, delivery, onSaved }: Props) {
  const { companyId, profile } = useProfile()
  const { toast }     = useToast()
  const isEdit        = !!delivery

  const [tab, setTab]           = useState<Tab>('detail')
  const [form, setForm]         = useState(EMPTY_FORM)
  const [tvaTouched, setTvaTouched] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [transitioning, setTransitioning] = useState<DeliveryStatus | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [clients,  setClients]  = useState<ClientLookup[]>([])
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers,  setDrivers]  = useState<Lookup[]>([])

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
        pallets:          delivery.weight_kg != null ? String(delivery.weight_kg) : '',
        manual_ht:        effectiveHtCts(delivery) > 0
                            ? (effectiveHtCts(delivery) / 100).toFixed(2) : '',
        tva_override:     storedTvaCts != null
                            ? (storedTvaCts / 100).toFixed(2) : '',
        notes:            delivery.notes ?? '',
      })
    } else {
      setTvaTouched(false)
      setForm({ ...EMPTY_FORM, date: TODAY })
    }
    setTab('detail')
  }, [delivery, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

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
    ? [{ key: 'detail', label: 'Détail' }, { key: 'montant', label: 'Montant' }, { key: 'suivi', label: 'Suivi' }]
    : [{ key: 'detail', label: 'Détail' }, { key: 'montant', label: 'Montant' }]

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.client_id) { toast('Le client est requis', 'error'); return }
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
        km:               form.km      ? parseFloat(form.km)      : null,
        weight_kg:        form.pallets ? parseFloat(form.pallets) : null,
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

  // Suppression unitaire : président uniquement, tous statuts.
  // Une livraison facturée/payée exige une double vérification (case à cocher).
  const canDelete = isEdit && profile?.role === 'president'
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

          <Field label="Client *">
            <select value={form.client_id} onChange={e => set('client_id', e.target.value)}
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
          <Field label="Adresse de livraison">
            <Input value={form.delivery_address} onChange={v => set('delivery_address', v)}
              placeholder="Rue, ville…" disabled={isDetailReadOnly} />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} disabled={isDetailReadOnly} placeholder="Notes internes…"
              className={`${inputCls} resize-none`} />
          </Field>

          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            {!isDetailReadOnly && (
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
        {!isReadOnly && (
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
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
