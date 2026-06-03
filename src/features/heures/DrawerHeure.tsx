import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createWorkHour, updateWorkHour } from './heures.queries'
import { formatMinutes } from './heures.logic'
import type { WorkHourRow, WorkHourInsert } from './heures.types'

interface Props {
  open: boolean
  onClose: () => void
  workHour?: WorkHourRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }
type DeliveryLookup = { id: string; label: string }

const EMPTY_FORM = {
  date:          new Date().toISOString().slice(0, 10),
  member_id:     '',
  start_time:    '',
  end_time:      '',
  break_minutes: '0',
  delivery_id:   '',
  notes:         '',
}

function timeToMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function computeTotal(start: string, end: string, breakMin: number): number | null {
  if (!start || !end) return null
  const diff = timeToMinutes(end) - timeToMinutes(start)
  return diff > 0 ? diff - breakMin : null
}

export function DrawerHeure({ open, onClose, workHour, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!workHour

  const [form, setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [members, setMembers]     = useState<Lookup[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryLookup[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setMembers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
    supabase
      .from('deliveries')
      .select('id, date, clients!client_id(name)')
      .order('date', { ascending: false })
      .limit(50)
      .then(({ data }) =>
        setDeliveries((data ?? []).map(d => ({
          id: d.id,
          label: `${new Date(d.date).toLocaleDateString('fr-FR')} — ${(d.clients as unknown as { name: string } | null)?.name ?? '?'}`,
        })))
      )
  }, [open])

  useEffect(() => {
    if (workHour) {
      setForm({
        date:          workHour.date,
        member_id:     workHour.member_id,
        start_time:    workHour.start_time?.slice(0, 5) ?? '',
        end_time:      workHour.end_time?.slice(0, 5) ?? '',
        break_minutes: String(workHour.break_minutes ?? 0),
        delivery_id:   workHour.delivery_id ?? '',
        notes:         workHour.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [workHour, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const breakMin = parseInt(form.break_minutes || '0') || 0
  const previewTotal = computeTotal(form.start_time, form.end_time, breakMin)

  const handleSave = async () => {
    if (!form.member_id) { toast('Le chauffeur est requis', 'error'); return }
    if (!form.date)      { toast('La date est requise', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date:          form.date,
        member_id:     form.member_id,
        start_time:    form.start_time ? `${form.start_time}:00` : null,
        end_time:      form.end_time   ? `${form.end_time}:00`   : null,
        break_minutes: breakMin,
        delivery_id:   form.delivery_id || null,
        notes:         form.notes || null,
      }

      if (isEdit && workHour) {
        const { error } = await updateWorkHour(workHour.id, payload)
        if (error) throw error
        toast('Heures mises à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createWorkHour({ ...payload, company_id: companyId } as WorkHourInsert)
        if (error) throw error
        toast('Heures enregistrées')
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
    ? `Heures — ${workHour!.team_members?.full_name ?? '...'}`
    : 'Saisir des heures'

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle}>
      <div className="flex flex-col gap-4">

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>
          <Field label="Chauffeur *">
            <select value={form.member_id} onChange={e => set('member_id', e.target.value)} className={inputCls}>
              <option value="">— Sélectionner —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Horaires */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
          <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Horaires
          </span>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Début">
              <Input type="time" value={form.start_time} onChange={v => set('start_time', v)} />
            </Field>
            <Field label="Fin">
              <Input type="time" value={form.end_time} onChange={v => set('end_time', v)} />
            </Field>
            <Field label="Pause (min)">
              <Input type="number" value={form.break_minutes} onChange={v => set('break_minutes', v)} placeholder="0" />
            </Field>
          </div>

          {previewTotal != null && (
            <div className="flex items-center justify-between px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg-elevated)]">
              <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Durée nette</span>
              <span className="font-mono font-semibold text-[var(--brand)]">{formatMinutes(previewTotal)}</span>
            </div>
          )}
        </div>

        <Field label="Livraison associée">
          <select value={form.delivery_id} onChange={e => set('delivery_id', e.target.value)} className={inputCls}>
            <option value="">— Aucune —</option>
            {deliveries.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>

        <Field label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Observations…" className={`${inputCls} resize-none`} />
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
