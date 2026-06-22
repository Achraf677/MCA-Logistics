import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link2 } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createFuelLog, updateFuelLog, deleteFuelLog } from './carburant.queries'
import { SelecteurCharge } from '../../shared/ui/SelecteurCharge'
import { LinkedChargeCard } from '../../shared/ui/LinkedChargeCard'
import { DeleteButton } from '../../shared/ui/DeleteButton'
import { getUnlinkedChargesFor } from '../../shared/lib/rapprochement'
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLOR, formatCents } from './carburant.logic'
import type { FuelLogRow, FuelLogInsert, FuelType, ChargePick } from './carburant.types'

interface Props {
  open: boolean
  onClose: () => void
  fuelLog?: FuelLogRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }

const FUEL_TYPES: FuelType[] = ['diesel', 'essence', 'electric', 'hybrid', 'lpg']
const TVA_OPTIONS = ['0', '5.5', '20']
const TODAY = new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  date: TODAY,
  vehicle_id: '',
  driver_id: '',
  liters: '',
  price_per_liter: '',
  total_ttc: '',
  fuel_type: '',
  mileage_km: '',
  station: '',
  tva_rate: '20',
  tva_deductible_pct: '100',
  chargeId: '',
}

export function DrawerCarburant({ open, onClose, fuelLog, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!fuelLog

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers]   = useState<Lookup[]>([])
  const [selectorOpen, setSelectorOpen] = useState(false)
  // linkedCharge : charge sélectionnée (nouveau) ou déjà liée (édition)
  const [linkedCharge, setLinkedCharge] = useState<ChargePick | null>(null)

  useEffect(() => {
    if (!open) return
    supabase.from('vehicles').select('id, label').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [open])

  useEffect(() => {
    if (fuelLog) {
      setForm({
        date: fuelLog.date,
        vehicle_id: fuelLog.vehicle_id,
        driver_id: fuelLog.driver_id ?? '',
        liters: String(fuelLog.liters),
        price_per_liter: (fuelLog.price_per_liter_cts / 100).toFixed(3),
        total_ttc: (fuelLog.total_cts / 100).toFixed(2),
        fuel_type: fuelLog.fuel_type ?? '',
        mileage_km: fuelLog.mileage_km != null ? String(fuelLog.mileage_km) : '',
        station: fuelLog.station ?? '',
        tva_rate: String(fuelLog.tva_rate ?? 20),
        tva_deductible_pct: String(fuelLog.tva_deductible_pct ?? 100),
        chargeId: fuelLog.charge_id ?? '',
      })
      // Peuple linkedCharge depuis le join
      if (fuelLog.charges) {
        setLinkedCharge({
          id: fuelLog.charges.id,
          label: fuelLog.charges.label,
          montant_ht_cts: 0,
          montant_ttc_cts: fuelLog.charges.montant_ttc_cts,
          tva_cts: null as number | null,
          tva_rate: 0,
          receipt_url: fuelLog.charges.receipt_url,
          supplier_id: null as string | null,
          category: null as string | null,
          suppliers: null,
        } as ChargePick)
      } else {
        setLinkedCharge(null)
      }
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
      setLinkedCharge(null)
    }
  }, [fuelLog, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleChargeSelect = (charge: ChargePick) => {
    setLinkedCharge(charge)
    setForm(prev => ({
      ...prev,
      chargeId: charge.id,
      date: charge.date,
      total_ttc: charge.montant_ttc_cts != null
        ? (charge.montant_ttc_cts / 100).toFixed(2)
        : prev.total_ttc,
      tva_rate: String(charge.tva_rate ?? 20),
    }))
  }

  const handleDetach = () => {
    setLinkedCharge(null)
    set('chargeId', '')
  }

  // Auto-calcul du total quand litres ou prix/L changent
  const liters = parseFloat(form.liters || '0')
  const pricePerLiterCts = Math.round(parseFloat(form.price_per_liter || '0') * 100)
  const autoTotalCts = liters > 0 && pricePerLiterCts > 0
    ? Math.round(liters * pricePerLiterCts)
    : null

  const totalCts = form.total_ttc
    ? Math.round(parseFloat(form.total_ttc) * 100)
    : (autoTotalCts ?? 0)

  const handleLitersOrPriceChange = (k: 'liters' | 'price_per_liter', v: string) => {
    setForm(p => {
      const newForm = { ...p, [k]: v }
      const l   = parseFloat(k === 'liters' ? v : p.liters || '0')
      const ppl = parseFloat(k === 'price_per_liter' ? v : p.price_per_liter || '0')
      if (l > 0 && ppl > 0) newForm.total_ttc = (l * ppl).toFixed(2)
      return newForm
    })
  }

  const handleSave = async () => {
    if (!form.vehicle_id) { toast('Le véhicule est requis', 'error'); return }
    if (!form.date)        { toast('La date est requise', 'error'); return }
    if (liters <= 0)       { toast('Le nombre de litres doit être supérieur à 0', 'error'); return }
    if (totalCts <= 0)     { toast('Le montant total doit être supérieur à 0', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || null,
        liters,
        price_per_liter_cts: pricePerLiterCts || Math.round(totalCts / liters),
        total_cts: totalCts,
        fuel_type: (form.fuel_type || null) as FuelType | null,
        mileage_km: form.mileage_km ? parseInt(form.mileage_km) : null,
        station: form.station || null,
        tva_rate: parseFloat(form.tva_rate || '20'),
        tva_deductible_pct: parseFloat(form.tva_deductible_pct || '100'),
        receipt_url: linkedCharge?.receipt_url ?? (isEdit ? fuelLog?.receipt_url ?? null : null),
        supplier_id: null,
        charge_id: form.chargeId || null,
      }

      if (isEdit && fuelLog) {
        const { error } = await updateFuelLog(fuelLog.id, payload)
        if (error) throw error
        toast('Plein mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createFuelLog({ ...payload, company_id: companyId } as FuelLogInsert)
        if (error) throw error
        toast('Plein enregistré')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const { error } = await deleteFuelLog(fuelLog!.id)
    if (error) throw error
    toast('Plein supprimé')
    onSaved()
    onClose()
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={isEdit ? `Plein — ${fuelLog!.vehicles?.label ?? '...'}` : 'Nouveau plein'}
      >
        <div className="flex flex-col gap-4">
          {/* Statut véhicule */}
          {isEdit && fuelLog?.fuel_type && (
            <div className="flex items-center gap-2 mb-1">
              <Badge color={FUEL_TYPE_COLOR[fuelLog.fuel_type]}>{FUEL_TYPE_LABELS[fuelLog.fuel_type]}</Badge>
              {fuelLog.charges && <Badge color="success">Facturé</Badge>}
              <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                {new Date(fuelLog.date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}

          {/* ── Rapprochement charge ────────────────────────────────────────── */}
          {linkedCharge ? (
            <LinkedChargeCard charge={linkedCharge} onDetach={handleDetach} />
          ) : (
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors text-[var(--fs-sm)]"
            >
              <Link2 size={14} />
              Rapprocher une facture Pennylane
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <Input type="date" value={form.date} onChange={v => set('date', v)} />
            </Field>
            <Field label="Type de carburant">
              <select value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)} className={inputCls}>
                <option value="">— Aucun —</option>
                {FUEL_TYPES.map(t => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Véhicule *">
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={inputCls}>
              <option value="">— Sélectionner un véhicule —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </Field>

          <Field label="Chauffeur">
            <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Litres *">
              <Input type="number" value={form.liters}
                onChange={v => handleLitersOrPriceChange('liters', v)}
                placeholder="50.00" />
            </Field>
            <Field label="Prix/L (€)">
              <Input type="number" value={form.price_per_liter}
                onChange={v => handleLitersOrPriceChange('price_per_liter', v)}
                placeholder="1.850" />
            </Field>
          </div>

          <Field label={linkedCharge ? 'Total TTC (€) — pré-rempli depuis la facture' : 'Total TTC (€) *'}>
            <Input type="number" value={form.total_ttc}
              onChange={v => set('total_ttc', v)}
              placeholder="92.50" />
          </Field>

          {totalCts > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
              <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Total TTC</span>
              <span className="font-mono font-semibold text-[var(--text)]">{formatCents(totalCts)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kilométrage">
              <Input type="number" value={form.mileage_km}
                onChange={v => set('mileage_km', v)} placeholder="125000" />
            </Field>
            <Field label="Station">
              <Input value={form.station} onChange={v => set('station', v)} placeholder="Total, BP…" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="TVA (%)">
              <select value={form.tva_rate} onChange={e => set('tva_rate', e.target.value)} className={inputCls}>
                {TVA_OPTIONS.map(v => <option key={v} value={v}>{v} %</option>)}
              </select>
            </Field>
            <Field label="TVA déductible (%)">
              <select value={form.tva_deductible_pct} onChange={e => set('tva_deductible_pct', e.target.value)} className={inputCls}>
                <option value="100">100 %</option>
                <option value="80">80 %</option>
                <option value="0">0 %</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            {isEdit && (
              <DeleteButton
                onDelete={handleDelete}
                confirmTitle="Supprimer ce plein ?"
                confirmMessage="La charge liée ne sera pas supprimée. Action irréversible."
                className="ml-auto"
              />
            )}
          </div>
        </div>
      </Drawer>

      <SelecteurCharge
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleChargeSelect}
        fetchCharges={() => getUnlinkedChargesFor('fuel_logs')}
      />
    </>
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
