// Panneau de ventilation — répartit UNE cible (débit Qonto, plein carburant,
// entretien) sur PLUSIEURS montants catégorisés via charge_allocations.
//
// Réutilisable : la feature appelante fournit target_table + target_id +
// montant total + un fetchCharges pour le picker. Le panneau gère :
//   - « Reste à couvrir : X € » décroissant en live,
//   - la liste des allocations existantes (montant + catégorie + note + retirer),
//   - l'ajout : charge existante → montant (≤ reste) → catégorie → note,
//   - le blocage du dépassement (somme > montant cible impossible),
//   - l'état « entièrement ventilée » quand reste = 0.
//
// Rétrocompat : n'interfère pas avec le rapprochement 1-clic (charge_id sur
// la table cible) — la ventilation est un mécanisme additif.

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Loader2, CheckCircle2 } from 'lucide-react'
import { formatMoney } from '../lib/money'
import { resteCibleCts, validerMontantAllocation } from '../lib/ventilation'
import {
  listAllocationsForTarget, addAllocation, removeAllocation, listChargeCategories,
  type AllocationRow, type AllocationTargetTable,
} from '../lib/allocations.queries'
import { SelecteurCharge } from './SelecteurCharge'
import { useToast } from './useToast'
import type { ChargePick } from '../types/charges'

interface Props {
  targetTable: AllocationTargetTable
  targetId: string
  /** Montant total de la cible en centimes (ex : amount_cts du débit Qonto). */
  targetAmountCts: number
  /** Charges proposées dans le picker (mêmes helpers que le rapprochement 1-clic). */
  fetchCharges: () => Promise<ChargePick[]>
  /** Rappel après ajout / retrait (rechargement parent optionnel). */
  onChanged?: () => void
}

export function PanneauVentilation({
  targetTable, targetId, targetAmountCts, fetchCharges, onChanged,
}: Props) {
  const { toast } = useToast()
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [categories, setCategories]   = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]         = useState(true)
  const [busy, setBusy]               = useState(false)

  // Ajout en cours : charge choisie + montant + catégorie + note.
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [draftCharge, setDraftCharge] = useState<ChargePick | null>(null)
  const [draftMontant, setDraftMontant] = useState('')
  const [draftCategorie, setDraftCategorie] = useState('')
  const [draftNote, setDraftNote]     = useState('')
  const [draftError, setDraftError]   = useState('')

  const reste = resteCibleCts(targetAmountCts, allocations)
  const complete = reste === 0 && allocations.length > 0

  const reload = useCallback(async () => {
    const { data, error } = await listAllocationsForTarget(targetTable, targetId)
    if (error) toast(error.message, 'error')
    setAllocations(data)
    setLoading(false)
  }, [targetTable, targetId, toast])

  useEffect(() => {
    setLoading(true)
    reload()
    listChargeCategories().then(setCategories)
  }, [reload])

  // Choix d'une charge dans le picker : pré-remplit montant (min(reste, TTC charge))
  // et catégorie (celle de la charge — modifiable).
  const handlePick = (charge: ChargePick) => {
    setDraftCharge(charge)
    const suggested = Math.min(
      reste,
      charge.montant_ttc_cts != null && charge.montant_ttc_cts > 0 ? charge.montant_ttc_cts : reste,
    )
    setDraftMontant((suggested / 100).toFixed(2).replace('.', ','))
    setDraftCategorie(charge.category_id ?? '')
    setDraftNote('')
    setDraftError('')
  }

  const resetDraft = () => {
    setDraftCharge(null); setDraftMontant(''); setDraftCategorie(''); setDraftNote(''); setDraftError('')
  }

  const handleAdd = async () => {
    if (!draftCharge) return
    const v = validerMontantAllocation(draftMontant, reste)
    if (!v.ok) { setDraftError(v.error ?? 'Montant invalide'); return }
    setBusy(true)
    const { error } = await addAllocation({
      charge_id:    draftCharge.id,
      target_table: targetTable,
      target_id:    targetId,
      amount_cts:   v.cts!,
      category_id:  draftCategorie || null,
      note:         draftNote.trim() || null,
    })
    setBusy(false)
    if (error) { toast((error as Error).message ?? 'Ajout échoué', 'error'); return }
    resetDraft()
    await reload()
    onChanged?.()
    toast('Allocation ajoutée')
  }

  const handleRemove = async (id: string) => {
    setBusy(true)
    const { error } = await removeAllocation(id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    await reload()
    onChanged?.()
    toast('Allocation retirée')
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
      {/* Reste à couvrir */}
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
            <span className="text-[var(--text-muted)]">Reste à couvrir</span>
            <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(reste)}</span>
          </>
        )}
      </div>

      {/* Allocations existantes */}
      {allocations.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)]">
          {allocations.map(a => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-[var(--fs-sm)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text)] truncate">{a.charges?.label ?? 'Charge'}</span>
                  {a.charge_categories?.name && (
                    <span className="px-1.5 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--brand-soft,#eff6ff)] text-[var(--brand)] shrink-0">
                      {a.charge_categories.name}
                    </span>
                  )}
                </div>
                {a.note && <p className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{a.note}</p>}
              </div>
              <span className="font-mono font-medium text-[var(--text)] shrink-0">{formatMoney(a.amount_cts)}</span>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                disabled={busy}
                aria-label="Retirer l'allocation"
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
        draftCharge ? (
          <div className="rounded-[var(--r-md)] border border-[var(--border)] p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 text-[var(--fs-sm)]">
              <span className="text-[var(--text)] font-medium truncate">{draftCharge.label}</span>
              <button type="button" onClick={resetDraft}
                className="text-[var(--fs-xs)] text-[var(--text-muted)] underline hover:text-[var(--text)]">
                Changer
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">Montant (€)</span>
                <input
                  type="text" inputMode="decimal"
                  value={draftMontant}
                  onChange={e => { setDraftMontant(e.target.value); setDraftError('') }}
                  placeholder="0,00"
                  className={inputCls}
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
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">Note</span>
              <input
                type="text" value={draftNote} onChange={e => setDraftNote(e.target.value)}
                placeholder="Ex. 10 € AdBlue" className={inputCls}
              />
            </label>
            {draftError && <p className="text-[var(--danger)] text-[var(--fs-xs)]">{draftError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={handleAdd} disabled={busy}
                className="px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--brand)] text-white text-[var(--fs-xs)]
                  font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {busy ? 'Ajout…' : 'Ajouter l\'allocation'}
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
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] border border-dashed
              border-[var(--border)] text-[var(--fs-sm)] text-[var(--text-muted)]
              hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors self-start"
          >
            <Plus size={14} /> Ajouter une allocation
          </button>
        )
      )}

      <SelecteurCharge
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePick}
        fetchCharges={fetchCharges}
      />
    </div>
  )
}

const inputCls = `w-full h-8 px-2.5 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50`
