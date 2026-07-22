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
import { prepareCategorieCreation } from '../lib/categories'
import { createCategory } from '../lib/categories.queries'
import {
  listAllocationsForCharge, addAllocation, removeAllocation, listChargeCategories,
  type AllocationRow,
} from '../lib/allocations.queries'
import { useToast } from './useToast'
import { useProfile } from '../../app/providers'

/** Sentinelle du select — jamais un id réel de charge_categories. */
const NOUVELLE_CATEGORIE = '__nouvelle__'

interface Props {
  chargeId: string
  /** Montant total de la charge en centimes (ex : montant_ttc_cts). */
  chargeAmountCts: number
  /** Type pré-rempli pour une catégorie créée depuis ce contexte (ex : 'entretien'). */
  categoryType?: string
  onChanged?: () => void
}

export function VentilationFacture({ chargeId, chargeAmountCts, categoryType, onChanged }: Props) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const [lignes, setLignes]         = useState<AllocationRow[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([])
  const [loading, setLoading]       = useState(true)
  const [busy, setBusy]             = useState(false)

  // Ligne en cours de saisie.
  const [adding, setAdding]         = useState(false)
  const [draftMontant, setDraftMontant] = useState('')
  const [draftCategorie, setDraftCategorie] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftError, setDraftError] = useState('')

  // Création de catégorie inline depuis le select ("+ Nouvelle catégorie…").
  const [creatingCategorie, setCreatingCategorie] = useState(false)
  const [newCategorieName, setNewCategorieName] = useState('')
  const [newCategorieType, setNewCategorieType] = useState(categoryType ?? '')
  const [newCategorieError, setNewCategorieError] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)

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
    resetNewCategorie()
  }

  const resetNewCategorie = () => {
    setCreatingCategorie(false); setNewCategorieName(''); setNewCategorieType(categoryType ?? ''); setNewCategorieError('')
  }

  const handleCategorieSelectChange = (value: string) => {
    if (value === NOUVELLE_CATEGORIE) { setCreatingCategorie(true); return }
    setDraftCategorie(value)
  }

  const handleCreateCategorie = async () => {
    const check = prepareCategorieCreation({ name: newCategorieName, type: newCategorieType || null }, categories)
    if (!check.ok) { setNewCategorieError(check.error ?? 'Nom invalide'); return }
    if (!companyId) { setNewCategorieError('Profil non chargé'); return }

    setCreatingBusy(true)
    const { data, error } = await createCategory(companyId, check.name!, newCategorieType || null)
    setCreatingBusy(false)
    if (error) { setNewCategorieError(error.message); return }

    const created = { id: data.id as string, name: data.name as string, slug: data.slug as string }
    setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
    setDraftCategorie(created.id)
    resetNewCategorie()
    toast(`Catégorie « ${created.name} » créée`)
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
                <select
                  value={draftCategorie}
                  onChange={e => handleCategorieSelectChange(e.target.value)}
                  className={inputCls}
                  disabled={creatingCategorie}
                >
                  <option value="">— Aucune —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value={NOUVELLE_CATEGORIE}>+ Nouvelle catégorie…</option>
                </select>
              </label>
            </div>

            {creatingCategorie && (
              <div className="rounded-[var(--r-md)] border border-dashed border-[var(--brand)] p-2.5 flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">Nom de la catégorie</span>
                  <input
                    type="text" value={newCategorieName}
                    onChange={e => { setNewCategorieName(e.target.value); setNewCategorieError('') }}
                    placeholder="Ex. AdBlue" className={inputCls} autoFocus
                  />
                </label>
                {newCategorieError && <p className="text-[var(--danger)] text-[var(--fs-xs)]">{newCategorieError}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button" onClick={handleCreateCategorie} disabled={creatingBusy}
                    className="px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--brand)] text-white text-[var(--fs-xs)]
                      font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {creatingBusy ? 'Création…' : 'Créer'}
                  </button>
                  <button
                    type="button" onClick={resetNewCategorie} disabled={creatingBusy}
                    className="px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] text-[var(--fs-xs)]
                      text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

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
                type="button" onClick={handleAdd} disabled={busy || creatingCategorie}
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
