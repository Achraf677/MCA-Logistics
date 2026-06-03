import { useState, useEffect } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { createVehicle, updateVehicle } from './vehicules.queries'
import { validatePtac, STATUS_LABELS, FUEL_LABELS } from './vehicules.logic'
import type { Vehicle, VehicleInsert } from './vehicules.types'
import { useProfile } from '../../app/providers'

interface DrawerVehiculeProps {
  open: boolean
  onClose: () => void
  vehicle?: Vehicle | null
  onSaved: () => void
}

const inputClass = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)] transition-colors`

function FieldGroup({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
      {error && <span className="text-[var(--danger)] text-[var(--fs-xs)]">{error}</span>}
    </div>
  )
}

export function DrawerVehicule({ open, onClose, vehicle, onSaved }: DrawerVehiculeProps) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [form, setForm] = useState<Partial<VehicleInsert>>({})
  const [saving, setSaving] = useState(false)
  const [ptacError, setPtacError] = useState('')
  const isEdit = !!vehicle

  useEffect(() => {
    setForm(vehicle ? {
      label: vehicle.label, plate: vehicle.plate, brand: vehicle.brand ?? '',
      model: vehicle.model ?? '', year: vehicle.year ?? undefined,
      ptac_kg: vehicle.ptac_kg ?? undefined, critair: vehicle.critair,
      fuel_type: vehicle.fuel_type, mileage_km: vehicle.mileage_km,
      purchase_price_cts: vehicle.purchase_price_cts ?? undefined,
      purchase_date: vehicle.purchase_date ?? '',
      status: vehicle.status, notes: vehicle.notes ?? '', company_id: vehicle.company_id,
    } : { status: 'active', mileage_km: 0, company_id: companyId ?? '' })
    setPtacError('')
  }, [vehicle, open, companyId])

  const set = (k: keyof VehicleInsert, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.label?.trim()) { toast('Le libellé est requis', 'error'); return }
    if (!form.plate?.trim()) { toast("L'immatriculation est requise", 'error'); return }
    if (form.ptac_kg && !validatePtac(form.ptac_kg)) {
      setPtacError('PTAC doit être ≤ 3 500 kg'); return
    }
    setPtacError('')
    setSaving(true)
    try {
      if (isEdit && vehicle) {
        const { error } = await updateVehicle(vehicle.id, form)
        if (error) throw error
        toast('Véhicule mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createVehicle({ ...form, company_id: companyId } as VehicleInsert)
        if (error) throw error
        toast('Véhicule créé')
      }
      onSaved(); onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (status: Vehicle['status']) => {
    if (!vehicle) return
    const { error } = await updateVehicle(vehicle.id, { status })
    if (error) { toast(error.message, 'error'); return }
    toast(`Statut mis à jour : ${STATUS_LABELS[status]}`)
    onSaved()
  }

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? vehicle!.label : 'Nouveau véhicule'}>
      <div className="flex flex-col gap-4">
        {isEdit && (
          <div className="flex flex-wrap gap-2">
            {(['active', 'maintenance', 'inactive'] as Vehicle['status'][]).map(s => (
              <Button key={s} size="compact"
                variant={vehicle!.status === s ? 'primary' : 'secondary'}
                onClick={() => handleStatusChange(s)}>
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Libellé *">
            <input value={form.label ?? ''} onChange={e => set('label', e.target.value)} className={inputClass} placeholder="ex. Trafic L2H1 Blanc" />
          </FieldGroup>
          <FieldGroup label="Immatriculation *">
            <input value={form.plate ?? ''} onChange={e => set('plate', e.target.value.toUpperCase())} className={`${inputClass} font-mono uppercase`} placeholder="AA-123-BB" />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FieldGroup label="Marque">
            <input value={form.brand ?? ''} onChange={e => set('brand', e.target.value)} className={inputClass} />
          </FieldGroup>
          <FieldGroup label="Modèle">
            <input value={form.model ?? ''} onChange={e => set('model', e.target.value)} className={inputClass} />
          </FieldGroup>
          <FieldGroup label="Année">
            <input type="number" value={form.year ?? ''} onChange={e => set('year', parseInt(e.target.value) || null)} className={inputClass} placeholder="2022" />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Carburant">
            <select value={form.fuel_type ?? ''} onChange={e => set('fuel_type', e.target.value || null)} className={inputClass}>
              <option value="">—</option>
              {(Object.entries(FUEL_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label="Crit'Air">
            <select value={form.critair ?? ''} onChange={e => set('critair', e.target.value || null)} className={inputClass}>
              <option value="">—</option>
              {['0','1','2','3','4','5','NC'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="PTAC (kg)" error={ptacError}>
            <input type="number" min={0} max={3500} value={form.ptac_kg ?? ''} onChange={e => { set('ptac_kg', parseInt(e.target.value) || null); setPtacError('') }} className={inputClass} />
          </FieldGroup>
          <FieldGroup label="Km compteur">
            <input type="number" min={0} value={form.mileage_km ?? 0} onChange={e => set('mileage_km', parseInt(e.target.value) || 0)} className={inputClass} />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Date d'achat">
            <input type="date" value={form.purchase_date ?? ''} onChange={e => set('purchase_date', e.target.value || null)} className={inputClass} />
          </FieldGroup>
          <FieldGroup label="Prix d'achat (€)">
            <input type="number" min={0} step={0.01}
              value={form.purchase_price_cts != null ? (form.purchase_price_cts / 100).toFixed(2) : ''}
              onChange={e => set('purchase_price_cts', Math.round(parseFloat(e.target.value || '0') * 100))}
              className={inputClass} />
          </FieldGroup>
        </div>

        <FieldGroup label="Notes">
          <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} className={`${inputClass} h-auto resize-none`} />
        </FieldGroup>

        <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
        </div>
      </div>
    </Drawer>
  )
}
