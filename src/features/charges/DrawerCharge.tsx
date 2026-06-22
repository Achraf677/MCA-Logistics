import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Trash2, Lock, ExternalLink } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { createCharge, updateCharge, deleteCharge } from './charges.queries'
import { CHARGE_CATEGORIES, CATEGORY_LABELS, CATEGORY_COLOR, formatCents, computeTtcCts } from './charges.logic'
import type { ChargeRow, ChargeInsert, ChargeCategory } from './charges.types'

interface Props {
  open: boolean
  onClose: () => void
  charge?: ChargeRow | null
  onSaved: () => void
}

type Lookup = { id: string; label: string }

const TVA_OPTIONS = ['0', '5.5', '10', '20']

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  label: '',
  category: '',
  supplier_id: '',
  montant_ht: '',
  tva_rate: '20',
  notes: '',
}

export function DrawerCharge({ open, onClose, charge, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!charge
  const isPennylane = !!charge?.pennylane_id
  const { can } = usePermissions()

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [suppliers, setSuppliers] = useState<Lookup[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setSuppliers((data ?? []).map(s => ({ id: s.id, label: s.name }))))
  }, [open])

  useEffect(() => {
    if (charge) {
      setForm({
        date: charge.date,
        label: charge.label,
        category: charge.category ?? '',
        supplier_id: charge.supplier_id ?? '',
        montant_ht: (charge.montant_ht_cts / 100).toFixed(2),
        tva_rate: String(charge.tva_rate ?? 20),
        notes: charge.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [charge, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const htCts = Math.round(parseFloat(form.montant_ht || '0') * 100)
  const tvaRate = parseFloat(form.tva_rate || '20')
  const ttcCts = computeTtcCts(htCts, tvaRate)
  const tvaCts = ttcCts - htCts

  const handleSave = async () => {
    if (!form.label.trim()) { toast('Le libellé est requis', 'error'); return }
    if (!form.date) { toast('La date est requise', 'error'); return }
    if (htCts <= 0) { toast('Le montant HT doit être supérieur à 0', 'error'); return }

    setSaving(true)
    try {
      const payload: Omit<ChargeInsert, 'company_id'> = {
        date: form.date,
        label: form.label.trim(),
        category: (form.category || null) as ChargeCategory | null,
        supplier_id: form.supplier_id || null,
        montant_ht_cts: htCts,
        tva_rate: tvaRate,
        tva_cts: tvaCts,
        montant_ttc_cts: ttcCts,
        receipt_url: null,
        notes: form.notes || null,
      }

      if (isEdit && charge) {
        const { error } = await updateCharge(charge.id, payload)
        if (error) throw error
        toast('Charge mise à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createCharge({ ...payload, company_id: companyId })
        if (error) throw error
        toast('Charge créée')
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
    if (!charge) return
    setDeleting(true)
    const { error } = await deleteCharge(charge.id)
    setDeleting(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDelete(false)
    toast('Charge supprimée')
    onSaved()
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Charge — ${charge!.label}` : 'Nouvelle charge'}
    >
      <div className="flex flex-col gap-4">
        {/* Bandeau verrouillage Pennylane */}
        {isPennylane && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text-muted)]">
            <Lock size={14} className="shrink-0" />
            <span>Géré dans Pennylane — lecture seule</span>
            {charge?.receipt_url && (
              <a
                href={charge.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[var(--info)] hover:underline text-[var(--fs-xs)]"
              >
                <ExternalLink size={11} />
                Voir la facture
              </a>
            )}
          </div>
        )}

        {isEdit && charge?.category && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={CATEGORY_COLOR[charge.category]}>{CATEGORY_LABELS[charge.category]}</Badge>
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(charge.date).toLocaleDateString('fr-FR')}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>
          <Field label="Catégorie">
            <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
              <option value="">— Aucune —</option>
              {CHARGE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Libellé *">
          <Input value={form.label} onChange={v => set('label', v)} placeholder="Description de la charge…" />
        </Field>

        <Field label="Fournisseur">
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={inputCls}>
            <option value="">— Aucun —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant HT (€) *">
            <Input type="number" value={form.montant_ht} onChange={v => set('montant_ht', v)} placeholder="0.00" />
          </Field>
          <Field label="TVA (%)">
            <select value={form.tva_rate} onChange={e => set('tva_rate', e.target.value)} className={inputCls}>
              {TVA_OPTIONS.map(v => <option key={v} value={v}>{v} %</option>)}
            </select>
          </Field>
        </div>

        {htCts > 0 && (
          <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">TVA ({tvaRate} %)</span>
              <span className="font-mono text-[var(--fs-sm)]">{formatCents(tvaCts)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Total TTC</span>
              <span className="font-mono font-semibold text-[var(--text)]">{formatCents(ttcCts)}</span>
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Notes internes…"
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
          {!isPennylane && can('finance.charges', isEdit ? 'update' : 'create') && (
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          {isEdit && !isPennylane && can('finance.charges', 'delete') && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="ml-auto text-[var(--danger)]">
              <Trash2 size={14} />
              Supprimer
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette charge ?"
        message="Action irréversible."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
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
