import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, Receipt, Euro, Wallet, Lock, Sparkles, AlertTriangle } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { DrawerCharge } from './DrawerCharge'
import { useToast } from '../../shared/ui/useToast'
import { useProfile, supabase } from '../../app/providers'
import { getCharges, exportChargesCSV, updateCharge, deleteCharge, ignorePennylaneDeletion } from './charges.queries'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useSync } from '../../app/SyncProvider'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatCents, categoryColor, kpiSummary } from './charges.logic'
import { getCategories } from '../../shared/lib/categories.queries'
import { downloadCSV } from '../../shared/lib/download'
import { suggestCategory } from '../../shared/lib/suggestCategorie'
import { parseSuggestionIa } from '../../shared/lib/suggestionIa'
import type { ChargeRow, ChargeFilters } from './charges.types'
import type { ChargeCategoryRow } from '../../shared/types/categories'
import type { ActionKey } from '../../shared/actions/ActionBar'

export function Charges() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const { companyId } = useProfile()
  const canCreate = can('finance.charges', 'create')
  const [rows, setRows]               = useState<ChargeRow[]>([])
  const [categories, setCategories]   = useState<ChargeCategoryRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [filters, setFilters]         = useState<ChargeFilters>({})
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [selected, setSelected]       = useState<ChargeRow | null>(null)
  const { syncState, syncIfStale } = useSync()
  // Suppression Pennylane : charge en attente de confirmation "Supprimer de l'app".
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingFlagged, setDeletingFlagged] = useState(false)
  // Filtre spécial via URL (?filtre=pennylane_supprimees) — clic depuis la cloche.
  const [searchParams, setSearchParams] = useSearchParams()
  const filtreSupprimees = searchParams.get('filtre') === 'pennylane_supprimees'

  // Chargement des catégories (une fois par companyId)
  useEffect(() => {
    if (!companyId) return
    getCategories(companyId).then(setCategories)
  }, [companyId])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getCharges(filters)
    if (error) setError(error.message)
    else setRows((data ?? []) as unknown as ChargeRow[])
    setLoading(false)
  }, [filters])

  useEffect(() => { syncIfStale('charges') }, [syncIfStale])
  useEffect(() => { load() }, [load, syncState.charges.lastSyncAt])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportChargesCSV(filters)
      downloadCSV(csv, 'charges.csv')
      toast('Export téléchargé')
    }
  }

  const handleCategoryChange = async (rowId: string, categoryId: string | null) => {
    const cat = categories.find(c => c.id === categoryId) ?? null
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, category_id: categoryId, charge_categories: cat } : r
    ))
    const { error } = await updateCharge(rowId, { category_id: categoryId })
    if (error) { toast(error.message, 'error'); load() }
  }

  // Seules les charges manuelles (sans pennylane_id) ouvrent le drawer d'édition
  const openRow = (row: ChargeRow) => {
    if (row.pennylane_id) return
    setSelected(row); setDrawerOpen(true)
  }

  // ── Suppressions Pennylane détectées ────────────────────────────────────────
  const handleDeleteFlagged = async () => {
    if (!confirmDeleteId) return
    setDeletingFlagged(true)
    const { error } = await deleteCharge(confirmDeleteId)
    setDeletingFlagged(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDeleteId(null)
    await load()
    toast('Charge supprimée de l\'app')
  }

  const handleIgnoreDeletion = async (id: string) => {
    const { error } = await ignorePennylaneDeletion(id)
    if (error) { toast(error.message, 'error'); return }
    await load()
    toast('Charge conservée — détachée de Pennylane')
  }

  // ── Suggestion IA (Mistral) — en COMPLÉMENT de l'heuristique F1 ─────────────
  // Jamais d'application automatique : l'utilisateur clique "Appliquer".
  const [iaSuggestions, setIaSuggestions] = useState<Map<string, string>>(new Map())
  const [iaLoadingId, setIaLoadingId]     = useState<string | null>(null)

  const handleSuggestIa = async (chargeId: string) => {
    setIaLoadingId(chargeId)
    try {
      const { data, error } = await supabase.functions.invoke('suggest-categorie-ia', {
        body: { charge_id: chargeId },
      })
      if (error || !data?.ok) {
        toast(data?.error ?? error?.message ?? 'Suggestion IA indisponible', 'error')
        return
      }
      const parsed = parseSuggestionIa(data.data, categories)
      if (!parsed.category_id) {
        toast('L\'IA n\'est pas sûre — aucune suggestion')
        return
      }
      setIaSuggestions(prev => new Map(prev).set(chargeId, parsed.category_id!))
    } finally {
      setIaLoadingId(null)
    }
  }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.category_id && filters.category_id !== 'all') ||
    filters.date_from || filters.date_to || filters.include_immobilisations
  )

  // Liste affichée : filtre "supprimées Pennylane" appliqué côté client.
  const displayRows = filtreSupprimees
    ? rows.filter(r => r.pennylane_deleted_at != null)
    : rows
  const nbSupprimees = rows.filter(r => r.pennylane_deleted_at != null).length

  // Suggestions déterministes de catégorie par fournisseur — calculées 1 fois
  // par rendu de rows. Historique = TOUTES les rows chargées (`getCharges` ne
  // paginant pas, la fenêtre est stable). Une charge non-catégorisée avec un
  // fournisseur qui a une catégorie dominante ≥ 60 % (min 2 occurrences)
  // reçoit une suggestion 1-clic. Aucun appel réseau ni écriture silencieuse.
  const suggestions = useMemo(() => {
    const history = rows.map(r => ({
      supplier_id: r.supplier_id,
      category_id: r.category_id,
    }))
    const map = new Map<string, string>()
    for (const r of rows) {
      if (r.category_id || !r.supplier_id) continue
      const cat = suggestCategory(r.supplier_id, history)
      if (cat) map.set(r.id, cat)
    }
    return map
  }, [rows])
  const categoryById = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories],
  )

  return (
    <Shell pageTitle="Charges" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          {[0,1,2].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Charges"   value={kpis.nb} tone="info" icon={<Receipt size={18} />} />
          <KpiCard label="Total HT"  value={formatCents(kpis.totalHtCts)} tone="warning" icon={<Euro size={18} />}
            sub={kpis.nbAvoirs > 0
              ? `dont ${kpis.nbAvoirs} avoir${kpis.nbAvoirs > 1 ? 's' : ''} ${formatCents(kpis.avoirsHtCts)}`
              : undefined}
          />
          <KpiCard label="Total TTC" value={formatCents(kpis.totalTtcCts)} tone="warning" icon={<Wallet size={18} />} />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4 glass rounded-[var(--r-xl)] px-4 py-3">
        <input
          type="date" value={filters.date_from ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          title="Date début" className={filterCls}
        />
        <input
          type="date" value={filters.date_to ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          title="Date fin" className={filterCls}
        />
        <select
          value={filters.category_id ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, category_id: (e.target.value || 'all') as ChargeFilters['category_id'] }))}
          className={filterCls}
        >
          <option value="all">Toutes catégories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button
          variant={filters.include_immobilisations ? 'primary' : 'secondary'}
          size="compact"
          onClick={() => setFilters(f => ({ ...f, include_immobilisations: !f.include_immobilisations }))}
        >
          Afficher les immobilisations
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="compact" onClick={() => setFilters({})}>
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Bandeau factures supprimées côté Pennylane */}
      {!loading && nbSupprimees > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-3 rounded-[var(--r-xl)]
          border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--fs-sm)]">
          <AlertTriangle size={16} className="text-[var(--danger)] shrink-0" />
          <span className="text-[var(--text)] flex-1">
            {nbSupprimees} facture{nbSupprimees > 1 ? 's' : ''} supprimée{nbSupprimees > 1 ? 's' : ''} dans Pennylane —
            à traiter (supprimer de l'app ou conserver).
          </span>
          {filtreSupprimees ? (
            <Button variant="ghost" size="compact" onClick={() => setSearchParams({})}>
              Voir toutes les charges
            </Button>
          ) : (
            <Button variant="secondary" size="compact"
              onClick={() => setSearchParams({ filtre: 'pennylane_supprimees' })}>
              Voir la liste
            </Button>
          )}
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={48} />}
          title="Aucune charge"
          description={hasFilters
            ? 'Aucun résultat pour ces filtres.'
            : 'Commencez à saisir vos charges.'}
          action={!hasFilters && canCreate
            ? { label: '+ Nouvelle charge', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Fournisseur', 'Libellé', 'Catégorie', 'Montant HT', 'TVA', 'Total TTC', 'Facture', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => {
                  const isPennylane = !!row.pennylane_id
                  const isAvoir = row.montant_ht_cts < 0
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openRow(row)}
                      className={`border-t border-[var(--border)] transition-colors
                        ${isPennylane ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--bg-card-hover)]'}
                        ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                    >
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] max-w-[140px] truncate">
                        {row.suppliers?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <span title={row.label} className="font-medium text-[var(--text)] truncate">{row.label}</span>
                          {row.est_immobilisation && <Badge color="purple">Immobilisation</Badge>}
                          {row.mode_paiement === 'note_de_frais' && !row.rembourse_le && (
                            <Badge color="warning">À rembourser</Badge>
                          )}
                        </div>
                        {row.pennylane_deleted_at && (
                          <div className="mt-1 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                            <Badge color="danger">Supprimée dans Pennylane</Badge>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(row.id)}
                              className="text-[var(--fs-xs)] text-[var(--danger)] underline hover:no-underline"
                            >
                              Supprimer de l'app
                            </button>
                            <button
                              type="button"
                              onClick={() => handleIgnoreDeletion(row.id)}
                              className="text-[var(--fs-xs)] text-[var(--text-muted)] underline hover:text-[var(--text)]"
                            >
                              Ignorer
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={row.category_id ?? ''}
                          onChange={e => handleCategoryChange(row.id, e.target.value || null)}
                          className={categoryCls}
                        >
                          <option value="">Non catégorisé</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {(() => {
                          const suggestedId = suggestions.get(row.id)
                          if (!suggestedId) return null
                          const cat = categoryById.get(suggestedId)
                          if (!cat) return null
                          return (
                            <div className="mt-1 flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                              <Sparkles size={10} className="text-[var(--brand)]" />
                              <span>Suggérée : <strong className="text-[var(--text)]">{cat.name}</strong></span>
                              <button
                                type="button"
                                onClick={() => handleCategoryChange(row.id, suggestedId)}
                                className="text-[var(--brand)] hover:underline"
                              >
                                Appliquer
                              </button>
                            </div>
                          )
                        })()}
                        {/* IA en second : uniquement si non catégorisée ET sans suggestion F1. */}
                        {!row.category_id && !suggestions.get(row.id) && (() => {
                          const iaId = iaSuggestions.get(row.id)
                          const iaCat = iaId ? categoryById.get(iaId) : null
                          if (iaCat && iaId) {
                            return (
                              <div className="mt-1 flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                                <Sparkles size={10} className="text-[var(--brand)]" />
                                <span>Catégorie suggérée (IA) : <strong className="text-[var(--text)]">{iaCat.name}</strong></span>
                                <button
                                  type="button"
                                  onClick={() => handleCategoryChange(row.id, iaId)}
                                  className="text-[var(--brand)] hover:underline"
                                >
                                  Appliquer
                                </button>
                              </div>
                            )
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleSuggestIa(row.id)}
                              disabled={iaLoadingId === row.id}
                              className="mt-1 text-[var(--fs-xs)] text-[var(--text-muted)] underline
                                hover:text-[var(--brand)] transition-colors disabled:opacity-50"
                            >
                              {iaLoadingId === row.id ? 'Analyse du justificatif…' : 'Suggérer via IA'}
                            </button>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <div className="flex items-center gap-1.5">
                          {formatCents(Math.abs(row.montant_ht_cts))}
                          {isAvoir && <Badge color="info">Avoir</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{row.tva_cts != null ? formatCents(Math.abs(row.tva_cts)) : '—'}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--text)]">
                        {row.montant_ttc_cts ? formatCents(Math.abs(row.montant_ttc_cts)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <FacturePdfLink pennylane_id={row.pennylane_id} receipt_url={row.receipt_url} />
                        {!row.receipt_url && !row.pennylane_id && <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPennylane ? (
                          <span title="Géré dans Pennylane"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)] text-[var(--text-disabled)]">
                            <Lock size={13} />
                          </span>
                        ) : (
                          <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openRow(row) }}>Voir</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {displayRows.map(row => {
              const isPennylane = !!row.pennylane_id
              const isAvoir = row.montant_ht_cts < 0
              const cat = row.charge_categories
              return (
                <div
                  key={row.id}
                  onClick={() => openRow(row)}
                  className={`w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 transition-colors
                    ${isPennylane ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--bg-card-hover)]'}`}
                >
                  {row.pennylane_deleted_at && (
                    <div className="mb-2 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                      <Badge color="danger">Supprimée dans Pennylane</Badge>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(row.id)}
                        className="text-[var(--fs-xs)] text-[var(--danger)] underline"
                      >
                        Supprimer de l'app
                      </button>
                      <button
                        type="button"
                        onClick={() => handleIgnoreDeletion(row.id)}
                        className="text-[var(--fs-xs)] text-[var(--text-muted)] underline"
                      >
                        Ignorer
                      </button>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span title={row.label} className="font-medium text-[var(--text)] truncate">{row.label}</span>
                      {row.est_immobilisation && <Badge color="purple">Immobilisation</Badge>}
                      {row.mode_paiement === 'note_de_frais' && !row.rembourse_le && (
                        <Badge color="warning">À rembourser</Badge>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {cat && <Badge color={categoryColor(cat.slug)}>{cat.name}</Badge>}
                        <select
                          value={row.category_id ?? ''}
                          onChange={e => handleCategoryChange(row.id, e.target.value || null)}
                          className={categoryCls}
                        >
                          <option value="">—</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      {(() => {
                        const suggestedId = suggestions.get(row.id)
                        if (!suggestedId) return null
                        const sCat = categoryById.get(suggestedId)
                        if (!sCat) return null
                        return (
                          <button
                            type="button"
                            onClick={() => handleCategoryChange(row.id, suggestedId)}
                            className="flex items-center gap-1 text-[var(--fs-xs)] text-[var(--brand)] hover:underline"
                          >
                            <Sparkles size={10} />
                            <span>Suggérée : {sCat.name}</span>
                          </button>
                        )
                      })()}
                      {/* IA en second (mobile) : non catégorisée, sans suggestion F1. */}
                      {!row.category_id && !suggestions.get(row.id) && (() => {
                        const iaId = iaSuggestions.get(row.id)
                        const iaCat = iaId ? categoryById.get(iaId) : null
                        if (iaCat && iaId) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleCategoryChange(row.id, iaId)}
                              className="flex items-center gap-1 text-[var(--fs-xs)] text-[var(--brand)] hover:underline"
                            >
                              <Sparkles size={10} />
                              <span>IA : {iaCat.name} — Appliquer</span>
                            </button>
                          )
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => handleSuggestIa(row.id)}
                            disabled={iaLoadingId === row.id}
                            className="text-[var(--fs-xs)] text-[var(--text-muted)] underline disabled:opacity-50"
                          >
                            {iaLoadingId === row.id ? 'Analyse…' : 'Suggérer via IA'}
                          </button>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                      {row.suppliers?.name && <span>{row.suppliers.name}</span>}
                      {isPennylane && (
                        <span className="inline-flex items-center gap-1 text-[var(--text-disabled)]">
                          <Lock size={10} /> Géré dans Pennylane
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono font-semibold text-[var(--text)] flex items-center gap-1.5">
                        {formatCents(Math.abs(row.montant_ht_cts))} HT
                        {isAvoir && <Badge color="info">Avoir</Badge>}
                      </span>
                      <FacturePdfLink
                        pennylane_id={row.pennylane_id}
                        receipt_url={row.receipt_url}
                        iconSize={10}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <DrawerCharge
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        charge={selected}
        onSaved={load}
        categories={categories}
      />

      {/* Confirmation "Supprimer de l'app" (charge dont la facture Pennylane a disparu) */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cette charge de l'app ?"
        message="La facture a été supprimée côté Pennylane. Supprimer la charge ici retire aussi ses rapprochements et allocations. Action irréversible."
        onConfirm={handleDeleteFlagged}
        onCancel={() => setConfirmDeleteId(null)}
        loading={deletingFlagged}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`

const categoryCls = `h-7 px-2 rounded-[var(--r-sm)] bg-[var(--bg-elevated)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-xs)] focus:outline-none focus:border-[var(--brand)]
  transition-colors cursor-pointer max-w-[140px]`
