import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Drawer }     from '../../shared/ui/Drawer'
import { Button }     from '../../shared/ui/Button'
import { useToast }   from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { eurosToCentimes, centimesToEuros, formatMoney } from '../../shared/lib/money'
import { ttcFromHt } from './modeles.logic'
import {
  createTemplate, updateTemplate, deleteTemplate,
  listClientsLight, listVehiclesLight, listDriversLight,
} from './modeles.queries'
import type { DeliveryTemplate } from './modeles.types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  template?: DeliveryTemplate | null
  onSaved: () => void
}

const TVA_RATES = [
  { label: '20 %', value: 20 },
  { label: '10 %', value: 10 },
  { label: '5,5 %', value: 5.5 },
  { label: '2,1 %', value: 2.1 },
  { label: '0 %', value: 0 },
]

const EMPTY_FORM = {
  label:            '',
  client_id:        '',
  description:      '',
  pickup_address:   '',
  delivery_address: '',
  amount_ht:        '',
  tva_rate:         20,
  type:             '',
  weight_kg:        '',
  km:               '',
  empty_km:         '',
  vehicle_id:       '',
  driver_id:        '',
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerModele({ open, onClose, template, onSaved }: Props) {
  const { companyId, profile } = useProfile()
  const { toast } = useToast()
  const isEdit = !!template

  const [form, setForm] = useState(EMPTY_FORM)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>([])
  const [drivers, setDrivers] = useState<{ id: string; full_name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Chargement des selects ────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    listClientsLight().then(({ data }) => setClients(data ?? []))
    listVehiclesLight().then(({ data }) => setVehicles(data ?? []))
    listDriversLight().then(({ data }) => setDrivers(data ?? []))
  }, [open])

  // ── Initialisation formulaire ─────────────────────────────────────────────

  useEffect(() => {
    if (template) {
      setForm({
        label:            template.label,
        client_id:        template.client_id ?? '',
        description:      template.description ?? '',
        pickup_address:   template.pickup_address ?? '',
        delivery_address: template.delivery_address ?? '',
        amount_ht:        template.amount_ht_cts != null
          ? centimesToEuros(template.amount_ht_cts).toFixed(2) : '',
        tva_rate:         template.tva_rate ?? 20,
        type:             template.type ?? '',
        weight_kg:        template.weight_kg != null ? String(template.weight_kg) : '',
        km:               template.km != null ? String(template.km) : '',
        empty_km:         template.empty_km != null ? String(template.empty_km) : '',
        vehicle_id:       template.vehicle_id ?? '',
        driver_id:        template.driver_id ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [template, open])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  // ── Calcul TTC ────────────────────────────────────────────────────────────

  const htCts = useMemo(() => {
    const v = parseFloat(form.amount_ht)
    return isNaN(v) ? 0 : eurosToCentimes(v)
  }, [form.amount_ht])

  const ttcCts = useMemo(() => ttcFromHt(htCts, form.tva_rate), [htCts, form.tva_rate])

  // ── Helpers de parsing numérique ──────────────────────────────────────────

  function numOrNull(s: string): number | null {
    const t = s.trim()
    if (t === '') return null
    const v = parseFloat(t)
    return isNaN(v) ? null : v
  }

  // ── Enregistrer ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.label.trim()) { toast('Le libellé est requis', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        label:            form.label.trim(),
        client_id:        form.client_id || null,
        description:      form.description.trim() || null,
        pickup_address:   form.pickup_address.trim() || null,
        delivery_address: form.delivery_address.trim() || null,
        amount_ht_cts:    form.amount_ht.trim() === '' ? null : htCts,
        tva_rate:         form.tva_rate,
        type:             form.type.trim() || null,
        weight_kg:        numOrNull(form.weight_kg),
        km:               numOrNull(form.km),
        empty_km:         numOrNull(form.empty_km),
        vehicle_id:       form.vehicle_id || null,
        driver_id:        form.driver_id || null,
      }

      if (isEdit && template) {
        const { error } = await updateTemplate(template.id, payload)
        if (error) throw error
        toast('Modèle mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createTemplate({ ...payload, company_id: companyId })
        if (error) throw error
        toast('Modèle créé')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message ?? 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Supprimer ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!template) return
    setDeleting(true)
    const { error } = await deleteTemplate(template.id)
    setDeleting(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    setConfirmDelete(false)
    toast('Modèle supprimé')
    onSaved()
    onClose()
  }

  const canDelete = isEdit && profile?.role === 'president'

  // ── Render ────────────────────────────────────────────────────────────────

  const drawerTitle = isEdit ? `Modèle — ${template!.label}` : 'Nouveau modèle'

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} width="max-w-xl">
      <div className="flex flex-col gap-4">

        {/* Libellé */}
        <Field label="Libellé *">
          <input type="text" value={form.label}
            onChange={e => set('label', e.target.value)}
            placeholder="Nom du modèle…" className={inputCls} />
        </Field>

        {/* Client */}
        <Field label="Client">
          <select value={form.client_id}
            onChange={e => set('client_id', e.target.value)}
            className={inputCls}>
            <option value="">— Aucun / générique —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {/* Description */}
        <Field label="Description">
          <input type="text" value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Objet de la course…" className={inputCls} />
        </Field>

        {/* Trajet */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Adresse de prise en charge">
            <input type="text" value={form.pickup_address}
              onChange={e => set('pickup_address', e.target.value)}
              placeholder="Départ…" className={inputCls} />
          </Field>
          <Field label="Adresse de livraison">
            <input type="text" value={form.delivery_address}
              onChange={e => set('delivery_address', e.target.value)}
              placeholder="Arrivée…" className={inputCls} />
          </Field>
        </div>

        {/* Montant HT + TVA */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant HT (€)">
            <input type="number" min="0" step="0.01" value={form.amount_ht}
              onChange={e => set('amount_ht', e.target.value)}
              placeholder="0.00" className={inputCls} />
          </Field>
          <Field label="Taux TVA">
            <select value={form.tva_rate}
              onChange={e => set('tva_rate', parseFloat(e.target.value))}
              className={inputCls}>
              {TVA_RATES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Récap TTC */}
        {htCts > 0 && (
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            <InfoRow label="HT"><span className="font-mono">{formatMoney(htCts)}</span></InfoRow>
            <InfoRow label="TTC">
              <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(ttcCts)}</span>
            </InfoRow>
          </div>
        )}

        {/* Type + poids */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <input type="text" value={form.type}
              onChange={e => set('type', e.target.value)}
              placeholder="ex. messagerie…" className={inputCls} />
          </Field>
          <Field label="Poids (kg)">
            <input type="number" min="0" step="0.01" value={form.weight_kg}
              onChange={e => set('weight_kg', e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
        </div>

        {/* Km + km à vide */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Km">
            <input type="number" min="0" step="0.01" value={form.km}
              onChange={e => set('km', e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
          <Field label="Km à vide">
            <input type="number" min="0" step="0.01" value={form.empty_km}
              onChange={e => set('empty_km', e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
        </div>

        {/* Véhicule + chauffeur */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Véhicule">
            <select value={form.vehicle_id}
              onChange={e => set('vehicle_id', e.target.value)}
              className={inputCls}>
              <option value="">— Aucun —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Chauffeur">
            <select value={form.driver_id}
              onChange={e => set('driver_id', e.target.value)}
              className={inputCls}>
              <option value="">— Aucun —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </Field>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          {canDelete && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}
              className="ml-auto text-[var(--danger)]">
              Supprimer
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce modèle ?"
        message="Action irréversible. Les livraisons déjà créées depuis ce modèle ne sont pas affectées."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

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
