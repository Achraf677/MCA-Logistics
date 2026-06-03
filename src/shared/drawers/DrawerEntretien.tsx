import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { useToast } from '../ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createMaintenance, updateMaintenance } from '../../features/entretiens/entretiens.queries'
import {
  MAINTENANCE_TYPE_LABELS, MAINTENANCE_TYPE_COLOR, formatCents,
} from '../../features/entretiens/entretiens.logic'
import type { MaintenanceRow, MaintenanceInsert, MaintenanceType } from '../../features/entretiens/entretiens.types'

interface Props {
  open: boolean
  onClose: () => void
  maintenance?: MaintenanceRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }

const MAINTENANCE_TYPES: MaintenanceType[] = [
  'vidange', 'pneus', 'freins', 'controle_technique',
  'revision', 'reparation', 'inspection', 'autre',
]

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vehicle_id: '',
  type: '',
  description: '',
  mileage_km: '',
  cost_cts_str: '',
  supplier_id: '',
  next_due_date: '',
  next_due_km: '',
  notes: '',
}

export function DrawerEntretien({ open, onClose, maintenance, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!maintenance

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [suppliers, setSuppliers] = useState<Lookup[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('vehicles').select('id, label').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setSuppliers((data ?? []).map(s => ({ id: s.id, label: s.name }))))
  }, [open])

  useEffect(() => {
    if (maintenance) {
      setForm({
        date: maintenance.date,
        vehicle_id: maintenance.vehicle_id,
        type: maintenance.type ?? '',
        description: maintenance.description ?? '',
        mileage_km: maintenance.mileage_km != null ? String(maintenance.mileage_km) : '',
        cost_cts_str: maintenance.cost_cts != null ? (maintenance.cost_cts / 100).toFixed(2) : '',
        supplier_id: maintenance.supplier_id ?? '',
        next_due_date: maintenance.next_due_date ?? '',
        next_due_km: maintenance.next_due_km != null ? String(maintenance.next_due_km) : '',
        notes: maintenance.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [maintenance, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const costCts = form.cost_cts_str ? Math.round(parseFloat(form.cost_cts_str) * 100) : null

  const handleSave = async () => {
    if (!form.vehicle_id) { toast('Le véhicule est requis', 'error'); return }
    if (!form.date) { toast('La date est requise', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        vehicle_id: form.vehicle_id,
        type: (form.type || null) as MaintenanceType | null,
        description: form.description || null,
        mileage_km: form.mileage_km ? parseInt(form.mileage_km) : null,
        cost_cts: costCts,
        supplier_id: form.supplier_id || null,
        next_due_date: form.next_due_date || null,
        next_due_km: form.next_due_km ? parseInt(form.next_due_km) : null,
        receipt_url: null,
        notes: form.notes || null,
      }

      if (isEdit && maintenance) {
        const { error } = await updateMaintenance(maintenance.id, payload)
        if (error) throw error
        toast('Entretien mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createMaintenance({ ...payload, company_id: companyId } as MaintenanceInsert)
        if (error) throw error
        toast('Entretien enregistré')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const drawerTitle = isEdit
    ? `Entretien — ${maintenance!.vehicles?.label ?? '...'}`
    : 'Nouvel entretien'

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle}>
      <div className="flex flex-col gap-4">
        {isEdit && maintenance?.type && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={MAINTENANCE_TYPE_COLOR[maintenance.type]}>
              {MAINTENANCE_TYPE_LABELS[maintenance.type]}
            </Badge>
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(maintenance.date).toLocaleDateString('fr-FR')}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{MAINTENANCE_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Véhicule *">
          <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={inputCls}>
            <option value="">— Sélectionner un véhicule —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>

        <Field label="Description">
          <Input value={form.description} onChange={v => set('description', v)}
            placeholder="Détail de l'intervention…" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Coût (€ HT)">
            <Input type="number" value={form.cost_cts_str} onChange={v => set('cost_cts_str', v)}
              placeholder="0.00" />
          </Field>
          <Field label="Kilométrage">
            <Input type="number" value={form.mileage_km} onChange={v => set('mileage_km', v)}
              placeholder="125000" />
          </Field>
        </div>

        {costCts != null && costCts > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
            <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Coût HT</span>
            <span className="font-mono font-semibold text-[var(--text)]">{formatCents(costCts)}</span>
          </div>
        )}

        <Field label="Prestataire / Garage">
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={inputCls}>
            <option value="">— Aucun —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>

        {/* Prochaine échéance */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
          <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Prochaine échéance
          </span>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={form.next_due_date} onChange={v => set('next_due_date', v)} />
            </Field>
            <Field label="Kilométrage">
              <Input type="number" value={form.next_due_km} onChange={v => set('next_due_km', v)}
                placeholder="135000" />
            </Field>
          </div>
        </div>

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Observations, pièces remplacées…"
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
        </div>
      </div>
    </Drawer>
  )
}

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function Input({ type = 'text', value, onChange, placeholder, disabled }: {
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
