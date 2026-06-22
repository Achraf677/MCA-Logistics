import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Trash2, Lock } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { createCharge, updateCharge, deleteCharge } from './charges.queries'
import { categoryColor, formatCents } from './charges.logic'
import { fromHtAndRate, fromHtAndManualTva } from '../../shared/lib/montants'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import type { ChargeRow, ChargeInsert, ChargeCategoryRow } from './charges.types'

interface Props {
  open: boolean
  onClose: () => void
  charge?: ChargeRow | null
  onSaved: () => void
  categories: ChargeCategoryRow[]
}

type Lookup = { id: string; label: string }


const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  label: '',
  category_id: '',
  supplier_id: '',
  montant_ht: '',
  tva_rate: '20',
  tva_amount: '',
  notes: '',
}

export function DrawerCharge({ open, onClose, charge, onSaved, categories }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!charge
  const isPennylane = !!charge?.pennylane_id
  const { can } = usePermissions()

  const [form, setForm] = useState(EMPTY_FORM)
  const [isAvoir, setIsAvoir] = useState(false)
  const [tvaTouched, setTvaTouched] = useState(false)
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
      const negative = charge.montant_ht_cts < 0
      setIsAvoir(negative)
      setTvaTouched(charge.tva_cts != null)
      setForm({
        date: charge.date,
        label: charge.label,
        category_id: charge.category_id ?? '',
        supplier_id: charge.supplier_id ?? '',
        montant_ht: (Math.abs(charge.montant_ht_cts) / 100).toFixed(2),
        tva_rate: String(charge.tva_rate ?? 20),
        tva_amount: charge.tva_cts != null
          ? (Math.abs(charge.tva_cts) / 100).toFixed(2) : '',
        notes: charge.notes ?? '',
      })
    } else {
      setIsAvoir(false)
      setTvaTouched(false)
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [charge, open])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // L'utilisateur saisit toujours positif ; le signe est appliqué à l'enregistrement
  const absHtCts = Math.round(parseFloat(form.montant_ht || '0') * 100)
  const tvaRate = parseFloat(form.tva_rate || '20')
  const tvaAmtCts = Math.round(parseFloat(form.tva_amount || '0') * 100)
  const sign = isAvoir ? -1 : 1

  const montants = tvaTouched && tvaAmtCts > 0
    ? fromHtAndManualTva(absHtCts, tvaAmtCts)
    : fromHtAndRate(absHtCts, tvaRate)

  const htCts = sign * montants.ht_cts
  const tvaCts = sign * montants.tva_cts
  const ttcCts = sign * montants.ttc_cts

  // Auto-suggère la TVA quand HT ou taux changent et que l'utilisateur n'a pas surchargé la TVA
  useEffect(() => {
    if (tvaTouched) return
    const ht = Math.round(parseFloat(form.montant_ht || '0') * 100)
    const rate = parseFloat(form.tva_rate || '20')
    if (ht <= 0) { setForm(p => ({ ...p, tva_amount: '' })); return }
    const suggested = fromHtAndRate(ht, rate).tva_cts
    setForm(p => ({ ...p, tva_amount: (suggested / 100).toFixed(2) }))
  }, [form.montant_ht, form.tva_rate, tvaTouched])

  const handleSave = async () => {
    if (!form.label.trim()) { toast('Le libellé est requis', 'error'); return }
    if (!form.date) { toast('La date est requise', 'error'); return }
    if (absHtCts <= 0) { toast('Le montant HT doit être supérieur à 0', 'error'); return }

    setSaving(true)
    try {
      const payload: Omit<ChargeInsert, 'company_id'> = {
        date: form.date,
        label: form.label.trim(),
        category_id: form.category_id || null,
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

  const currentCat = charge?.charge_categories ?? null

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
            <FacturePdfLink
              pennylane_id={charge?.pennylane_id}
              receipt_url={charge?.receipt_url}
              label="Voir la facture"
              className="ml-auto inline-flex items-center gap-1 text-[var(--info)] hover:underline text-[var(--fs-xs)] disabled:opacity-50"
            />
          </div>
        )}

        {isEdit && currentCat && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={categoryColor(currentCat.slug)}>{currentCat.name}</Badge>
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(charge!.date).toLocaleDateString('fr-FR')}
            </span>
          </div>
        )}

        {/* Toggle Charge / Avoir — masqué pour les charges Pennylane */}
        {!isPennylane && (
          <div className="flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden text-[var(--fs-sm)] self-start">
            <button
              type="button"
              onClick={() => setIsAvoir(false)}
              className={`px-4 py-1.5 transition-colors ${!isAvoir
                ? 'bg-[var(--brand)] text-white font-medium'
                : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}
            >
              Charge
            </button>
            <button
              type="button"
              onClick={() => setIsAvoir(true)}
              className={`px-4 py-1.5 transition-colors ${isAvoir
                ? 'bg-[var(--loss)] text-white font-medium'
                : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}
            >
              Avoir
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>
          <Field label="Catégorie">
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
              <option value="">— Aucune —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <TvaRateInput
              value={parseFloat(form.tva_rate || '20')}
              onChange={r => { set('tva_rate', String(r)); setTvaTouched(false) }}
              disabled={isPennylane}
            />
          </Field>
        </div>

        <Field label={`Montant TVA (€)${tvaTouched ? ' ✎' : ' — auto'}`}>
          <Input
            type="number"
            value={form.tva_amount}
            onChange={v => { set('tva_amount', v); setTvaTouched(true) }}
            placeholder="0.00"
            disabled={isPennylane}
          />
        </Field>

        {absHtCts > 0 && (
          <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
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
