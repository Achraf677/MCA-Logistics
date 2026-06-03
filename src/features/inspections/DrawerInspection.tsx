import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createInspection, updateInspection } from './inspections.queries'
import {
  TYPE_LABELS, STATUS_LABELS, STATUS_COLOR, CHECKLIST_LABELS, computeStatus,
} from './inspections.logic'
import type { InspectionRow, InspectionInsert, InspectionType, InspectionStatus } from './inspections.types'

interface Props {
  open: boolean
  onClose: () => void
  inspection?: InspectionRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }

const CHECKLIST_KEYS = ['exterior_ok', 'lights_ok', 'tires_ok', 'brakes_ok', 'fluids_ok', 'docs_ok', 'cleanliness_ok'] as const
type ChecklistKey = typeof CHECKLIST_KEYS[number]

const EMPTY_CHECKLIST: Record<ChecklistKey, boolean> = {
  exterior_ok: true, lights_ok: true, tires_ok: true,
  brakes_ok: true, fluids_ok: true, docs_ok: true, cleanliness_ok: true,
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vehicle_id: '',
  driver_id: '',
  type: '' as InspectionType | '',
  mileage_km: '',
  status: 'ok' as InspectionStatus,
  defects: '',
  notes: '',
  signed_by: '',
}

export function DrawerInspection({ open, onClose, inspection, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!inspection

  const [form, setForm]         = useState(EMPTY_FORM)
  const [checklist, setChecklist] = useState<Record<ChecklistKey, boolean>>(EMPTY_CHECKLIST)
  const [saving, setSaving]     = useState(false)
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers]   = useState<Lookup[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('vehicles').select('id, label').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [open])

  useEffect(() => {
    if (inspection) {
      setForm({
        date:       inspection.date,
        vehicle_id: inspection.vehicle_id,
        driver_id:  inspection.driver_id ?? '',
        type:       inspection.type ?? '',
        mileage_km: inspection.mileage_km != null ? String(inspection.mileage_km) : '',
        status:     inspection.status,
        defects:    inspection.defects ?? '',
        notes:      inspection.notes ?? '',
        signed_by:  inspection.signed_by ?? '',
      })
      setChecklist({
        exterior_ok:    inspection.exterior_ok,
        lights_ok:      inspection.lights_ok,
        tires_ok:       inspection.tires_ok,
        brakes_ok:      inspection.brakes_ok,
        fluids_ok:      inspection.fluids_ok,
        docs_ok:        inspection.docs_ok,
        cleanliness_ok: inspection.cleanliness_ok,
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
      setChecklist({ ...EMPTY_CHECKLIST })
    }
  }, [inspection, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const toggleCheck = (key: ChecklistKey) => {
    setChecklist(p => {
      const next = { ...p, [key]: !p[key] }
      const autoStatus = computeStatus(next)
      setForm(f => ({ ...f, status: f.status === 'refuse' ? 'refuse' : autoStatus }))
      return next
    })
  }

  const handleSave = async () => {
    if (!form.vehicle_id) { toast('Le véhicule est requis', 'error'); return }
    if (!form.date)       { toast('La date est requise', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date:           form.date,
        vehicle_id:     form.vehicle_id,
        driver_id:      form.driver_id || null,
        type:           (form.type || null) as InspectionType | null,
        mileage_km:     form.mileage_km ? parseInt(form.mileage_km) : null,
        ...checklist,
        status:         form.status,
        defects:        form.defects || null,
        notes:          form.notes || null,
        signed_by:      form.signed_by || null,
      }

      if (isEdit && inspection) {
        const { error } = await updateInspection(inspection.id, payload)
        if (error) throw error
        toast('Inspection mise à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createInspection({ ...payload, company_id: companyId } as InspectionInsert)
        if (error) throw error
        toast('Inspection enregistrée')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const nokCount = CHECKLIST_KEYS.filter(k => !checklist[k]).length

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Inspection — ${inspection!.vehicles?.label ?? '...'}` : 'Nouvelle inspection'}
    >
      <div className="flex flex-col gap-4">
        {isEdit && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={STATUS_COLOR[inspection!.status]}>{STATUS_LABELS[inspection!.status]}</Badge>
            {inspection!.type && <Badge color="muted">{TYPE_LABELS[inspection!.type]}</Badge>}
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(inspection!.date).toLocaleDateString('fr-FR')}
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
              {(['pre_trajet','post_trajet','periodique'] as InspectionType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Véhicule *">
          <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={inputCls}>
            <option value="">— Sélectionner un véhicule —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Chauffeur">
            <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Kilométrage">
            <Input type="number" value={form.mileage_km} onChange={v => set('mileage_km', v)} placeholder="125000" />
          </Field>
        </div>

        {/* Checklist */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
            <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Points de contrôle
            </span>
            <span className={`text-[var(--fs-xs)] font-mono font-semibold ${nokCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
              {7 - nokCount}/7 OK
            </span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {CHECKLIST_KEYS.map(key => {
              const ok = checklist[key]
              return (
                <button key={key}
                  onClick={() => toggleCheck(key)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors
                    ${ok ? '' : 'bg-[var(--danger)]/5'}`}>
                  <span className={`text-[var(--fs-sm)] ${ok ? 'text-[var(--text)]' : 'text-[var(--danger)]'}`}>
                    {CHECKLIST_LABELS[key]}
                  </span>
                  {ok
                    ? <CheckCircle size={16} className="text-[var(--success)] shrink-0" />
                    : <XCircle size={16} className="text-[var(--danger)] shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Statut final">
            <select value={form.status}
              onChange={e => set('status', e.target.value)}
              className={inputCls}>
              {(['ok','defauts','refuse'] as InspectionStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Signé par">
            <Input value={form.signed_by} onChange={v => set('signed_by', v)} placeholder="Nom du chauffeur" />
          </Field>
        </div>

        {(nokCount > 0 || form.defects) && (
          <Field label="Description des défauts">
            <textarea value={form.defects} onChange={e => set('defects', e.target.value)}
              rows={2} placeholder="Détailler les anomalies constatées…" className={`${inputCls} resize-none`} />
          </Field>
        )}

        <Field label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Observations complémentaires…" className={`${inputCls} resize-none`} />
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

function Input({ type = 'text', value, onChange, placeholder }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
