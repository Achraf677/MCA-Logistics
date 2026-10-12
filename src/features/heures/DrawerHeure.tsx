import { useState, useEffect } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createWorkHour, updateWorkHour } from './heures.queries'
import { formatMinutes, dureeNetteMinutes, passeMinuit } from './heures.logic'
import { toLocalISO } from '../../shared/lib/dates'
import type { WorkHourRow, WorkHourInsert } from './heures.types'
import { Field } from '../../shared/ui/Field'

interface Props {
  open: boolean
  onClose: () => void
  workHour?: WorkHourRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }
type DeliveryLookup = { id: string; label: string }

const EMPTY_FORM = {
  date:          '',
  member_id:     '',
  start_time:    '',
  end_time:      '',
  break_minutes: '0',
  delivery_id:   '',
  notes:         '',
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
  }, [open])

  // Livraisons du salarié CE jour-là (et pas les 50 dernières de toute la société).
  useEffect(() => {
    if (!open || !form.member_id || !form.date) { setDeliveries([]); return }
    let annule = false
    supabase
      .from('deliveries')
      .select('id, delivery_address, clients!client_id(name)')
      .eq('driver_id', form.member_id)
      .eq('date', form.date)
      // Relevés de messagerie et forfaits : pas des courses où l'on pointe des heures.
      .or('prestation.is.null,prestation.not.in.(messagerie,forfait)')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (annule) return
        setDeliveries((data ?? []).map(d => {
          const client = (d.clients as unknown as { name: string } | null)?.name ?? 'Client ?'
          return { id: d.id, label: d.delivery_address ? `${client} — ${d.delivery_address}` : client }
        }))
      })
    return () => { annule = true }
  }, [open, form.member_id, form.date])

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
      // Date du jour LOCALE (toISOString donnerait la veille avant 2 h).
      setForm({ ...EMPTY_FORM, date: toLocalISO(new Date()) })
    }
  }, [workHour, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const breakMin = parseInt(form.break_minutes || '0') || 0
  const previewTotal = dureeNetteMinutes(form.start_time, form.end_time, breakMin)
  const nuit = passeMinuit(form.start_time, form.end_time)
  // Livraison déjà liée mais hors de la liste (autre jour / autre salarié) : on la garde visible.
  const lieeHorsListe = !!form.delivery_id && !deliveries.some(d => d.id === form.delivery_id)

  const handleSave = async () => {
    if (!form.member_id) { toast('Le salarié est requis', 'error'); return }
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
          <Field label="Salarié *">
            <select value={form.member_id} onChange={e => set('member_id', e.target.value)} className={inputCls}>
              <option value="">— Sélectionner —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Horaires */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
          <span className="text-[length:var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
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
              <span className="text-sm text-[var(--text-muted)]">Durée nette{nuit ? ' (passe minuit)' : ''}</span>
              <span className="font-mono font-semibold text-[var(--brand)]">{formatMinutes(previewTotal)}</span>
            </div>
          )}
        </div>

        <Field label="Livraison associée">
          <select value={form.delivery_id} onChange={e => set('delivery_id', e.target.value)} className={inputCls}>
            <option value="">— Aucune —</option>
            {lieeHorsListe && <option value={form.delivery_id}>Livraison déjà liée (autre jour ou autre salarié)</option>}
            {deliveries.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          {(!form.member_id || !form.date)
            ? <span className="text-xs text-[var(--text-muted)]">Choisis le salarié et le jour pour voir ses livraisons.</span>
            : deliveries.length === 0 && <span className="text-xs text-[var(--text-muted)]">Aucune livraison de ce salarié ce jour-là.</span>}
        </Field>

        <Field label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Observations…" className={`${inputCls} field-area resize-none`} />
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

const inputCls = 'field'
function Input({ type = 'text', value, onChange, placeholder }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

