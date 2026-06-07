import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createPayment, updatePayment } from './encaissement.queries'
import { METHOD_LABELS, METHOD_COLOR, formatCents } from './encaissement.logic'
import { effectiveTtcCts } from '../../shared/lib/money'
import type { PaymentRow, PaymentInsert, PaymentMethod } from './encaissement.types'

interface Props {
  open: boolean
  onClose: () => void
  payment?: PaymentRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }
type DeliveryLookup = { id: string; label: string; amount_cts: number }

const METHODS: PaymentMethod[] = ['virement', 'cb', 'especes', 'cheque', 'autre']

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  client_id: '',
  delivery_id: '',
  amount: '',
  method: '',
  reference: '',
  notes: '',
}

export function DrawerEncaissement({ open, onClose, payment, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!payment

  const [form, setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [clients, setClients]     = useState<Lookup[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryLookup[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('clients').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setClients((data ?? []).map(c => ({ id: c.id, label: c.name }))))
  }, [open])

  // Charge les livraisons facturées/non payées du client sélectionné
  useEffect(() => {
    if (!form.client_id) { setDeliveries([]); return }
    supabase
      .from('deliveries')
      .select('id, date, amount_ttc_cts, montant_ttc_cts')
      .eq('client_id', form.client_id)
      .in('statut', ['facturee'])
      .order('date', { ascending: false })
      .then(({ data }) =>
        setDeliveries((data ?? []).map(d => ({
          id: d.id,
          label: new Date(d.date).toLocaleDateString('fr-FR'),
          amount_cts: effectiveTtcCts(d),
        })))
      )
  }, [form.client_id])

  useEffect(() => {
    if (payment) {
      setForm({
        date:        payment.date,
        client_id:   payment.client_id ?? '',
        delivery_id: payment.delivery_id ?? '',
        amount:      (payment.amount_cts / 100).toFixed(2),
        method:      payment.method ?? '',
        reference:   payment.reference ?? '',
        notes:       payment.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [payment, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const amountCts = Math.round(parseFloat(form.amount || '0') * 100)

  // Auto-remplir le montant depuis la livraison sélectionnée
  const handleDeliveryChange = (deliveryId: string) => {
    set('delivery_id', deliveryId)
    if (deliveryId) {
      const d = deliveries.find(d => d.id === deliveryId)
      if (d) set('amount', (d.amount_cts / 100).toFixed(2))
    }
  }

  const handleSave = async () => {
    if (!form.client_id) { toast('Le client est requis', 'error'); return }
    if (!form.date) { toast('La date est requise', 'error'); return }
    if (amountCts <= 0) { toast('Le montant doit être supérieur à 0', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date:        form.date,
        client_id:   form.client_id || null,
        delivery_id: form.delivery_id || null,
        amount_cts:  amountCts,
        method:      (form.method || null) as PaymentMethod | null,
        reference:   form.reference || null,
        qonto_tx_id: null,
        notes:       form.notes || null,
      }

      if (isEdit && payment) {
        const { error } = await updatePayment(payment.id, payload)
        if (error) throw error
        toast('Paiement mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createPayment({ ...payload, company_id: companyId } as PaymentInsert)
        if (error) throw error
        toast('Paiement enregistré')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Paiement — ${payment!.clients?.name ?? '...'}` : 'Nouveau paiement'}
    >
      <div className="flex flex-col gap-4">
        {isEdit && payment?.method && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={METHOD_COLOR[payment.method]}>{METHOD_LABELS[payment.method]}</Badge>
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(payment.date).toLocaleDateString('fr-FR')}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>
          <Field label="Mode de paiement">
            <select value={form.method} onChange={e => set('method', e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Client *">
          <select value={form.client_id} onChange={e => set('client_id', e.target.value)} className={inputCls}>
            <option value="">— Sélectionner un client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>

        {form.client_id && (
          <Field label="Livraison liée (facturées)">
            <select value={form.delivery_id} onChange={e => handleDeliveryChange(e.target.value)} className={inputCls}>
              <option value="">— Aucune —</option>
              {deliveries.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label} — {formatCents(d.amount_cts)} TTC
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Montant (€) *">
          <Input type="number" value={form.amount} onChange={v => set('amount', v)} placeholder="0.00" />
        </Field>

        {amountCts > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
            <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Montant encaissé</span>
            <span className="font-mono font-semibold text-[var(--brand)]">{formatCents(amountCts)}</span>
          </div>
        )}

        <Field label="Référence / N° de chèque">
          <Input value={form.reference} onChange={v => set('reference', v)} placeholder="REF-2024-001" />
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
