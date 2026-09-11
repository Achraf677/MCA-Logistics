import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, FileText, ChevronLeft } from 'lucide-react'
import type { ChargePick } from '../types/charges'

const euros = (cts: number | null | undefined) =>
  cts == null
    ? '—'
    : (cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (charge: ChargePick) => void
  /** Charges au même montant TTC (filtre par défaut). */
  fetchCharges: () => Promise<ChargePick[]>
  /** Toutes les charges non liées (mode "autre montant"). Optionnel. */
  fetchAllCharges?: () => Promise<ChargePick[]>
  /**
   * Reste dû par charge (id → centimes). Quand il diffère du montant total,
   * la facture est réglée en plusieurs fois : on affiche le solde, car c'est
   * lui qui décide si le débit courant la solde ou non.
   */
  resteParCharge?: Map<string, number>
}

export function SelecteurCharge({
  open, onClose, onSelect, fetchCharges, fetchAllCharges, resteParCharge,
}: Props) {
  const [charges, setCharges]       = useState<ChargePick[]>([])
  const [allCharges, setAllCharges] = useState<ChargePick[]>([])
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [showAll, setShowAll]       = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSearch(''); setShowAll(false); setAllCharges([])
    setLoading(true)
    fetchCharges().then(data => {
      setCharges(data)
      setLoading(false)
    })
    setTimeout(() => inputRef.current?.focus(), 80)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchCharges est stable par construction (ref ne change pas)
  }, [open])

  const handleToggleAll = () => {
    if (showAll) { setShowAll(false); return }
    if (allCharges.length > 0) { setShowAll(true); return }
    if (!fetchAllCharges) return
    setLoadingAll(true)
    fetchAllCharges().then(data => {
      setAllCharges(data)
      setLoadingAll(false)
      setShowAll(true)
    })
  }

  if (!open) return null

  const list = showAll ? allCharges : charges
  const q = search.toLowerCase()
  const filtered = list.filter(c =>
    (c.label ?? '').toLowerCase().includes(q) ||
    (c.suppliers?.name ?? '').toLowerCase().includes(q)
  )

  // Portail vers <body> : même raison que ConfirmDialog et Drawer — un ancêtre
  // portant `backdrop-filter` / `transform` deviendrait le référentiel de ce
  // `position: fixed`, et la fenêtre serait dimensionnée dans la carte au lieu
  // de l'écran, puis rognée. Le portail rend ce cas impossible.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--r-xl)] shadow-2xl flex flex-col max-h-[78vh]">

        {/* Barre de recherche */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
          <Search size={15} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une charge (libellé, fournisseur…)"
            className="flex-1 bg-transparent text-[var(--text)] text-[var(--fs-sm)] outline-none placeholder:text-[var(--text-disabled)]"
          />
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Indicateur mode élargi */}
        {showAll && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--warn-soft,#fffbeb)] border-b border-[var(--border)] shrink-0">
            <button
              onClick={handleToggleAll}
              className="flex items-center gap-1 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <ChevronLeft size={12} />
              Solde exact uniquement
            </button>
            <span className="text-[var(--fs-xs)] text-[var(--warn)] ml-auto">Factures non soldées</span>
          </div>
        )}

        {/* Liste */}
        <div className="overflow-y-auto flex-1">
          {(loading || loadingAll) ? (
            <div className="px-4 py-10 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[var(--text-muted)] text-[var(--fs-sm)]">
              {search
                ? 'Aucun résultat pour cette recherche.'
                : showAll
                  ? 'Toutes les factures sont soldées.'
                  : 'Aucune facture dont le solde tombe sur ce montant — voir « Autre montant » pour un règlement partiel.'}
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); onClose() }}
                className="w-full text-left px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-[var(--text)] text-[var(--fs-sm)] truncate">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(c.date).toLocaleDateString('fr-FR')}</span>
                    {c.suppliers?.name && <span>· {c.suppliers.name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.receipt_url && <FileText size={13} className="text-[var(--text-muted)]" />}
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[var(--fs-sm)] font-semibold text-[var(--text)]">
                      {euros(c.montant_ttc_cts)}
                    </span>
                    {(() => {
                      const reste = resteParCharge?.get(c.id)
                      if (reste == null || reste === c.montant_ttc_cts) return null
                      return (
                        <span className="font-mono text-[var(--fs-xs)] text-[var(--gold)]">
                          reste {euros(reste)}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Toggle "Autre montant" */}
        {fetchAllCharges && !showAll && (
          <div className="px-4 py-2.5 border-t border-[var(--border)] shrink-0">
            <button
              onClick={handleToggleAll}
              disabled={loadingAll}
              className="text-[var(--fs-xs)] text-[var(--brand)] hover:underline disabled:opacity-50 transition-colors"
            >
              {loadingAll ? 'Chargement…' : 'Autre montant (paiement net/partiel) →'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
