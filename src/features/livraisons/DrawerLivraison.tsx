import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ExternalLink, FileText, Package, Truck } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import {
  createDelivery,
  updateDelivery,
  advanceStatut,
} from './livraisons.queries'
import {
  STATUS_LABELS, STATUS_COLOR, TYPE_LABELS, TYPE_COLOR,
  formatCents, computeTtcCts, nextStatut, advanceLabel,
} from './livraisons.logic'
import type { DeliveryRow, DeliveryInsert, DeliveryStatus } from './livraisons.types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  delivery?: DeliveryRow | null
  onSaved: () => void
}

type Tab = 'detail' | 'documents' | 'historique' | 'paiement'
type Lookup = { id: string; label: string }

// ── Constantes ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  date: TODAY,
  client_id: '',
  vehicle_id: '',
  driver_id: '',
  type: '',
  description: '',
  pickup_address: '',
  delivery_address: '',
  km: '',
  weight_kg: '',
  montant_ht: '',
  tva_rate: '20',
  notes: '',
}

const TVA_OPTIONS = ['0', '5.5', '10', '20']
const STATUS_ORDER: DeliveryStatus[] = ['brouillon', 'validee', 'facturee', 'payee']

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerLivraison({ open, onClose, delivery, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!delivery

  const [tab, setTab] = useState<Tab>('detail')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const [clients, setClients] = useState<Lookup[]>([])
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers] = useState<Lookup[]>([])

  // Charge les référentiels à l'ouverture
  useEffect(() => {
    if (!open) return
    supabase.from('clients').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setClients((data ?? []).map(c => ({ id: c.id, label: c.name }))))
    supabase.from('vehicles').select('id, label').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [open])

  // Initialise le formulaire selon la livraison sélectionnée
  useEffect(() => {
    if (delivery) {
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
        weight_kg:        delivery.weight_kg != null ? String(delivery.weight_kg) : '',
        montant_ht:       delivery.montant_ht_cts != null
                            ? (delivery.montant_ht_cts / 100).toFixed(2)
                            : '',
        tva_rate:         String(delivery.tva_rate ?? 20),
        notes:            delivery.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
    setTab('detail')
  }, [delivery, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const htCts  = Math.round(parseFloat(form.montant_ht || '0') * 100)
  const tvaRate = parseFloat(form.tva_rate || '20')
  const ttcCts  = computeTtcCts(htCts, tvaRate)

  const isReadOnly = isEdit && !['brouillon', 'validee'].includes(delivery?.statut ?? '')
  const nextS      = delivery ? nextStatut(delivery.statut) : null
  const advLabel   = delivery ? advanceLabel(delivery.statut) : null

  const tabs: { key: Tab; label: string }[] = isEdit
    ? [
        { key: 'detail',     label: 'Détail'     },
        { key: 'documents',  label: 'Documents'  },
        { key: 'historique', label: 'Historique' },
        { key: 'paiement',   label: 'Paiement'   },
      ]
    : [{ key: 'detail', label: 'Détail' }]

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.client_id) { toast('Le client est requis', 'error'); return }
    if (!form.date)       { toast('La date est requise', 'error'); return }
    if (!form.montant_ht || parseFloat(form.montant_ht) <= 0) {
      toast('Le montant HT doit être supérieur à 0', 'error'); return
    }
    setSaving(true)
    try {
      const payload = {
        date:             form.date,
        client_id:        form.client_id,
        vehicle_id:       form.vehicle_id  || null,
        driver_id:        form.driver_id   || null,
        type:             (form.type       || null) as DeliveryInsert['type'],
        description:      form.description || null,
        pickup_address:   form.pickup_address   || null,
        delivery_address: form.delivery_address || null,
        km:               form.km        ? parseFloat(form.km)        : null,
        weight_kg:        form.weight_kg ? parseFloat(form.weight_kg) : null,
        montant_ht_cts:   htCts,
        tva_rate:         tvaRate,
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
          company_id: companyId,
          statut: 'brouillon',
        } as DeliveryInsert)
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

  const handleAdvance = async () => {
    if (!delivery || !nextS) return
    setAdvancing(true)
    const { error } = await advanceStatut(delivery.id, nextS)
    if (error) { toast(error.message, 'error'); setAdvancing(false); return }
    toast(`Statut mis à jour : ${STATUS_LABELS[nextS]}`)
    onSaved()
    onClose()
    setAdvancing(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const drawerTitle = isEdit
    ? `Livraison — ${delivery!.clients?.name ?? '...'}`
    : 'Nouvelle livraison'

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} width="max-w-xl">
      {/* Badge statut */}
      {isEdit && (
        <div className="flex items-center gap-2 mb-4">
          <Badge color={STATUS_COLOR[delivery!.statut]}>{STATUS_LABELS[delivery!.statut]}</Badge>
          {delivery!.type && (
            <Badge color={TYPE_COLOR[delivery!.type]}>{TYPE_LABELS[delivery!.type]}</Badge>
          )}
          <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
            {new Date(delivery!.date).toLocaleDateString('fr-FR')}
          </span>
        </div>
      )}

      {/* Barre d'onglets */}
      {isEdit && (
        <div className="flex gap-0 mb-5 border-b border-[var(--border)]">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[var(--fs-sm)] transition-colors -mb-px
                ${tab === t.key
                  ? 'text-[var(--brand)] border-b-2 border-[var(--brand)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Onglet Détail ───────────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <Input type="date" value={form.date} onChange={v => set('date', v)} disabled={isReadOnly} />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={e => set('type', e.target.value)}
                disabled={isReadOnly} className={inputCls}>
                <option value="">— Aucun —</option>
                {(['medical','ecommerce','retail','particulier'] as const).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Client *">
            <select value={form.client_id} onChange={e => set('client_id', e.target.value)}
              disabled={isReadOnly} className={inputCls}>
              <option value="">— Sélectionner un client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Véhicule">
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}
                disabled={isReadOnly} className={inputCls}>
                <option value="">— Aucun —</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Chauffeur">
              <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)}
                disabled={isReadOnly} className={inputCls}>
                <option value="">— Aucun —</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <Input value={form.description} onChange={v => set('description', v)}
              placeholder="Objet de la course…" disabled={isReadOnly} />
          </Field>

          <Field label="Adresse d'enlèvement">
            <Input value={form.pickup_address} onChange={v => set('pickup_address', v)}
              placeholder="Rue, ville…" disabled={isReadOnly} />
          </Field>
          <Field label="Adresse de livraison">
            <Input value={form.delivery_address} onChange={v => set('delivery_address', v)}
              placeholder="Rue, ville…" disabled={isReadOnly} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance (km)">
              <Input type="number" value={form.km} onChange={v => set('km', v)}
                placeholder="0" disabled={isReadOnly} />
            </Field>
            <Field label="Poids (kg)">
              <Input type="number" value={form.weight_kg} onChange={v => set('weight_kg', v)}
                placeholder="0" disabled={isReadOnly} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant HT (€) *">
              <Input type="number" value={form.montant_ht} onChange={v => set('montant_ht', v)}
                placeholder="0.00" disabled={isReadOnly} />
            </Field>
            <Field label="TVA (%)">
              <select value={form.tva_rate} onChange={e => set('tva_rate', e.target.value)}
                disabled={isReadOnly} className={inputCls}>
                {TVA_OPTIONS.map(v => <option key={v} value={v}>{v} %</option>)}
              </select>
            </Field>
          </div>

          {/* TTC calculé live */}
          {htCts > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5
              rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
              <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Total TTC</span>
              <span className="font-mono font-semibold text-[var(--text)]">{formatCents(ttcCts)}</span>
            </div>
          )}

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              disabled={isReadOnly}
              placeholder="Notes internes…"
              className={`${inputCls} resize-none`}
            />
          </Field>

          <Footer
            isReadOnly={isReadOnly}
            saving={saving}
            advancing={advancing}
            advLabel={advLabel}
            nextS={nextS}
            onSave={handleSave}
            onAdvance={handleAdvance}
            onClose={onClose}
          />
        </div>
      )}

      {/* ── Onglet Documents ────────────────────────────────────────────────── */}
      {tab === 'documents' && delivery && (
        <div className="flex flex-col gap-3">
          <DocRow label="Facture"           icon={<FileText size={15} />} url={delivery.facture_url} />
          <DocRow label="Bon de livraison"  icon={<Package  size={15} />} url={delivery.bon_livraison_url} />
          <DocRow label="Lettre de voiture" icon={<Truck    size={15} />} url={delivery.lettre_voiture_url} />
          {!delivery.facture_url && !delivery.bon_livraison_url && !delivery.lettre_voiture_url && (
            <p className="py-10 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
              Aucun document disponible.<br />
              Les documents seront générés à la validation.
            </p>
          )}
          <div className="pt-3 border-t border-[var(--border)]">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      )}

      {/* ── Onglet Historique ────────────────────────────────────────────────── */}
      {tab === 'historique' && delivery && (
        <div className="flex flex-col py-2">
          {STATUS_ORDER.map((s, i) => {
            const currentIdx = STATUS_ORDER.indexOf(
              delivery.statut === 'annulee' ? 'brouillon' : delivery.statut
            )
            const reached  = i <= currentIdx
            const isCurrent = delivery.statut !== 'annulee' && delivery.statut === s
            return (
              <div key={s} className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-0.5">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0
                    ${reached ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} />
                  {i < STATUS_ORDER.length - 1 && (
                    <div className={`w-0.5 h-8 mt-0.5 ${reached ? 'bg-[var(--brand)]/30' : 'bg-[var(--border)]'}`} />
                  )}
                </div>
                <div className="pb-4">
                  <span className={`text-[var(--fs-sm)] font-medium
                    ${reached ? 'text-[var(--text)]' : 'text-[var(--text-disabled)]'}`}>
                    {STATUS_LABELS[s]}
                  </span>
                  {isCurrent && (
                    <span className="ml-2 text-[var(--fs-xs)] text-[var(--brand)]">← actuel</span>
                  )}
                </div>
              </div>
            )
          })}
          {delivery.statut === 'annulee' && (
            <div className="mt-2 pl-6">
              <Badge color="danger">Annulée</Badge>
            </div>
          )}
          <div className="pt-4 border-t border-[var(--border)] mt-2">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      )}

      {/* ── Onglet Paiement ──────────────────────────────────────────────────── */}
      {tab === 'paiement' && delivery && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            <InfoRow label="Statut">
              <Badge color={STATUS_COLOR[delivery.statut]}>{STATUS_LABELS[delivery.statut]}</Badge>
            </InfoRow>
            <InfoRow label="Montant HT">
              <span className="font-mono">{formatCents(delivery.montant_ht_cts)}</span>
            </InfoRow>
            <InfoRow label="TVA">
              <span className="font-mono">{delivery.tva_rate} %</span>
            </InfoRow>
            <InfoRow label="Montant TTC">
              <span className="font-mono font-semibold">{formatCents(delivery.montant_ttc_cts)}</span>
            </InfoRow>
            {delivery.pennylane_invoice_id && (
              <InfoRow label="N° facture Pennylane">
                <span className="font-mono text-[var(--fs-xs)]">{delivery.pennylane_invoice_id}</span>
              </InfoRow>
            )}
            {delivery.sync_pending && (
              <InfoRow label="Synchronisation">
                <Badge color="warning">En attente</Badge>
              </InfoRow>
            )}
            {delivery.sync_error && (
              <InfoRow label="Erreur sync">
                <span className="text-[var(--danger)] text-[var(--fs-xs)] truncate max-w-[16rem]">
                  {delivery.sync_error}
                </span>
              </InfoRow>
            )}
          </div>

          {advLabel && nextS && (
            <Button variant="primary" onClick={handleAdvance} disabled={advancing}>
              {advancing ? 'Mise à jour…' : advLabel}
            </Button>
          )}

          <div className="pt-2 border-t border-[var(--border)]">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function Input({
  type = 'text', value, onChange, placeholder, disabled, className = '',
}: {
  type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean; className?: string
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`${inputCls} ${className}`}
    />
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

function DocRow({ label, icon, url }: { label: string; icon: ReactNode; url: string | null }) {
  return (
    <div className="flex items-center justify-between px-4 py-3
      rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)]">
      <span className="flex items-center gap-2 text-[var(--fs-sm)] text-[var(--text)]">
        {icon}{label}
      </span>
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--brand)] text-[var(--fs-sm)] hover:underline">
            <ExternalLink size={11} />Ouvrir
          </a>
        : <span className="text-[var(--text-disabled)] text-[var(--fs-xs)]">Non généré</span>
      }
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

function Footer({
  isReadOnly, saving, advancing, advLabel, nextS, onSave, onAdvance, onClose,
}: {
  isReadOnly: boolean
  saving: boolean
  advancing: boolean
  advLabel: string | null
  nextS: DeliveryStatus | null
  onSave: () => void
  onAdvance: () => void
  onClose: () => void
}) {
  return (
    <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
      {!isReadOnly && (
        <Button variant="primary" onClick={onSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      )}
      <Button variant="secondary" onClick={onClose}>
        {isReadOnly ? 'Fermer' : 'Annuler'}
      </Button>
      {advLabel && nextS && (
        <Button variant="primary" onClick={onAdvance} disabled={advancing} className="ml-auto">
          {advancing ? '…' : advLabel}
        </Button>
      )}
    </div>
  )
}
