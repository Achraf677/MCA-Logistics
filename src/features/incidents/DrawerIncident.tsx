import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createIncident, updateIncident, deleteIncident } from './incidents.queries'
import {
  TYPE_LABELS, TYPE_COLOR, STATUS_LABELS, STATUS_COLOR, formatCents,
} from './incidents.logic'
import type { IncidentRow, IncidentInsert, IncidentType, IncidentStatus } from './incidents.types'

interface Props {
  open: boolean
  onClose: () => void
  incident?: IncidentRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }

const TYPES: IncidentType[] = ['accident', 'panne', 'vol', 'vandalisme', 'infraction', 'autre']
const STATUSES: IncidentStatus[] = ['ouvert', 'en_cours', 'clos']

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vehicle_id: '',
  driver_id: '',
  type: '',
  description: '',
  location: '',
  damage: '',
  at_fault: '',
  status: 'ouvert' as IncidentStatus,
  police_report: false,
  insurance_ref: '',
  notes: '',
}

export function DrawerIncident({ open, onClose, incident, onSaved }: Props) {
  const { companyId, profile } = useProfile()
  const { toast } = useToast()
  const isEdit = !!incident
  const isPresident = profile?.role === 'president'

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
    if (incident) {
      setForm({
        date:         incident.date,
        vehicle_id:   incident.vehicle_id ?? '',
        driver_id:    incident.driver_id ?? '',
        type:         incident.type ?? '',
        description:  incident.description ?? '',
        location:     incident.location ?? '',
        damage:       incident.damage_cts != null ? (incident.damage_cts / 100).toFixed(2) : '',
        at_fault:     incident.at_fault == null ? '' : String(incident.at_fault),
        status:       incident.status,
        police_report: incident.police_report,
        insurance_ref: incident.insurance_ref ?? '',
        notes:        incident.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [incident, open])

  const set = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const damageCts = form.damage ? Math.round(parseFloat(form.damage) * 100) : null

  const handleSave = async () => {
    if (!form.date) { toast('La date est requise', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date:         form.date,
        vehicle_id:   form.vehicle_id || null,
        driver_id:    form.driver_id || null,
        type:         (form.type || null) as IncidentType | null,
        description:  form.description || null,
        location:     form.location || null,
        damage_cts:   damageCts,
        at_fault:     form.at_fault === '' ? null : form.at_fault === 'true',
        status:       form.status,
        police_report: form.police_report,
        insurance_ref: form.insurance_ref || null,
        notes:        form.notes || null,
      }

      if (isEdit && incident) {
        const { error } = await updateIncident(incident.id, payload)
        if (error) throw error
        toast('Incident mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createIncident({ ...payload, company_id: companyId } as IncidentInsert)
        if (error) throw error
        toast('Incident enregistré')
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
    if (!incident) return
    const { error } = await deleteIncident(incident.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Incident supprimé', 'success')
    setConfirmDelete(false)
    onSaved()
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Incident — ${incident!.vehicles?.label ?? '...'}` : 'Signaler un incident'}
    >
      <div className="flex flex-col gap-4">
        {isEdit && incident.type && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={TYPE_COLOR[incident.type]}>{TYPE_LABELS[incident.type]}</Badge>
            <Badge color={STATUS_COLOR[incident.status]}>{STATUS_LABELS[incident.status]}</Badge>
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(incident.date).toLocaleDateString('fr-FR')}
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
              {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Véhicule">
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Chauffeur">
            <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <Input value={form.description} onChange={v => set('description', v)} placeholder="Circonstances de l'incident…" />
        </Field>

        <Field label="Lieu">
          <Input value={form.location} onChange={v => set('location', v)} placeholder="Rue, ville, autoroute…" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Dommages estimés (€)">
            <Input type="number" value={form.damage} onChange={v => set('damage', v)} placeholder="0.00" />
          </Field>
          <Field label="Responsabilité">
            <select value={form.at_fault} onChange={e => set('at_fault', e.target.value)} className={inputCls}>
              <option value="">— Non définie —</option>
              <option value="true">Responsable</option>
              <option value="false">Non responsable</option>
            </select>
          </Field>
        </div>

        {damageCts != null && damageCts > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
            <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Dommages estimés</span>
            <span className="font-mono font-semibold text-[var(--danger)]">{formatCents(damageCts)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Statut">
            <select value={form.status} onChange={e => set('status', e.target.value as IncidentStatus)} className={inputCls}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="Référence assurance">
            <Input value={form.insurance_ref} onChange={v => set('insurance_ref', v)} placeholder="CLM-2024-001" />
          </Field>
        </div>

        {/* Déclaration police */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.police_report}
            onChange={e => set('police_report', e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--brand)]"
          />
          <span className="text-[var(--fs-sm)] text-[var(--text)]">Déclaration de police effectuée</span>
        </label>

        <Field label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Observations complémentaires…" className={`${inputCls} resize-none`} />
        </Field>

        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          {isEdit && isPresident && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="ml-auto text-[var(--danger)]">
              <Trash2 size={14} />
              Supprimer
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer l'incident"
        message="Cette action est irréversible. L'incident sera définitivement supprimé."
        confirmLabel="Supprimer"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={false}
      />
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
