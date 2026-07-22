// Ventilation d'UNE facture (charge) en sous-lignes catégorisées — DÉCOMPOSE
// un montant unique (ex : 30 € Éléphant Bleu = 10 € AdBlue + 20 € lave-glace),
// à ne pas confondre avec PanneauVentilation (qui rattache N charges à 1 cible
// Qonto/fuel/entretien). Ici : 1 charge → N lignes { montant, catégorie, libellé },
// stockées dans charge_allocations avec target_table/target_id = NULL (voir
// migration 20260723090000). `note` sert de libellé libre pour la sous-ligne.

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Loader2, CheckCircle2 } from 'lucide-react'
import { formatMoney } from '../lib/money'
import { chargeResteCts } from '../lib/allocations'
import { validerMontantAllocation } from '../lib/ventilation'
import {
  listAllocationsForCharge, addAllocation, removeAllocation, listChargeCategories,
  type AllocationRow,
} from '../lib/allocations.queries'
import { useToast } from './useToast'

interface Props {
  chargeId: string
  /** Montant total de la charge en centimes (ex : montant_ttc_cts). */
  chargeAmountCts: number
  onChanged?: () => void
}

export function VentilationFacture({ chargeId, chargeAmountCts, onChanged }: Props) {
  const { toast } = useToast()
  const [lignes, setLignes]         = useState<AllocationRow[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]       = useState(true)
  const [busy, setBusy]             = useState(false)

  // Ligne en cours de saisie.
  const [adding, setAdding]         = useState(false)
  const [draftMontant, setDraftMontant] = useState('')
  const [draftCategorie, setDraftCategorie] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftError, setDraftError] = useState('')

  const reste = chargeResteCts(chargeAmountCts, lignes)
  const complete = reste === 0 && lignes.length > 0

  const reload = useCallback(async () => {
    const { data, error } = await listAllocationsForCharge(chargeId)
    if (error) toast(error.message, 'error')
    setLignes(data)
    setLoading(false)
  }, [chargeId, toast])

  useEffect(() => {
    setLoading(true)
    reload()
    listChargeCategories().then(setCategories)
  }, [reload])

  const resetDraft = () => {
    setAdding(false); setDraftMontant(''); setDraftCategorie(''); setDraftLabel(''); setDraftError('')
  }

  const handleAdd = async () => {
    const v = validerMontantAllocation(draftMontant, reste)
    if (!v.ok) { setDraftError(v.error ?? 'Montant invalide'); return }
    setBusy(true)
    const { error } = await addAllocation({
      charge_id:   chargeId,
      amount_cts:  v.cts!,
      category_id: draftCategorie || null,
      note:        draftLabel.trim() || null,
    })
    setBusy(false)
    if (error) { toast((error as Error).message ?? 'Ajout échoué', 'error'); return }
    resetDraft()
    await reload()
    onChanged?.()
    toast('Ligne ajoutée')
  }

  const handleRemove = async (id: string) => {
    setBusy(true)
    const { error } = await removeAllocation(id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    await reload()
    onChanged?.()
    toast('Ligne retirée')
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[var(--fs-sm)] text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Chargement de la ventilation…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-sm)]">
        <span className="text-[var(--text-muted)]">Montant total de la facture</span>
        <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(chargeAmountCts)}</span>
      </div>

      {/* Reste à ventiler */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-[var(--r-md)] border text-[var(--fs-sm)]
        ${complete
          ? 'border-[var(--success)]/40 bg-[var(--success)]/10'
          : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}>
        {complete ? (
          <span className="flex items-center gap-2 text-[var(--success)] font-medium">
            <CheckCircle2 size={14} /> Entièrement ventilée
          </span>
        ) : (
          <>
            <span className="text-[var(--text-muted)]">Reste à ventiler</span>
            <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(reste)}</span>
          </>
        )}
      </div>

      {/* Lignes existantes */}
      {lignes.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)]">
          {lignes.map(l => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-[var(--fs-sm)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text)] truncate">{l.note ?? 'Sans libellé'}</span>
                  {l.charge_categories?.name && (
                    <span className="px-1.5 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--brand-soft,#eff6ff)] text-[var(--brand)] shrink-0">
                      {l.charge_categories.name}
                    </span>
                  )}
                </div>
              </div>
              <span className="font-mono font-medium text-[var(--text)] shrink-0">{formatMoney(l.amount_cts)}</span>
              <button
                type="button"
                onClick={() => handleRemove(l.id)}
                disabled={busy}
                aria-label="Retirer la ligne"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)]
                  hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-40"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Formulaire d'ajout */}
      {!complete && (
        adding ? (
          <div className="rounded-[var(--r-md)] border border-[var(--border)] p-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">Montant (€)</span>
                <input
                  type="text" inputMode="decimal"
                  value={draftMontant}
                  onChange={e => { setDraftMontant(e.target.value); setDraftError('') }}
                  placeholder="0,00"
                  className={inputCls}
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">Catégorie</span>
                <select value={draftCategorie} onChange={e => setDraftCategorie(e.target.value)} className={inputCls}>
                  <option value="">— Aucune —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">Libellé</span>
              <input
                type="text" value={draftLabel} onChange={e => setDraftLabel(e.target.value)}
                placeholder="Ex. AdBlue" className={inputCls}
              />
            </label>
            {draftError && <p className="text-[var(--danger)] text-[var(--fs-xs)]">{draftError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={handleAdd} disabled={busy}
                className="px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--brand)] text-white text-[var(--fs-xs)]
                  font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {busy ? 'Ajout…' : 'Ajouter la ligne'}
              </button>
              <button
                type="button" onClick={resetDraft} disabled={busy}
                className="px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] text-[var(--fs-xs)]
                  text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] border border-dashed
              border-[var(--border)] text-[var(--fs-sm)] text-[var(--text-muted)]
              hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors self-start"
          >
            <Plus size={14} /> Ajouter une ligne
          </button>
        )
      )}
    </div>
  )
}

const inputCls = `w-full h-8 px-2.5 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50`
