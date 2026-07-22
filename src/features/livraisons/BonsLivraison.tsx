import { useState, useEffect, useCallback } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerLivraison } from './DrawerLivraison'
import { getDeliveriesWithLv } from './livraisons.queries'
import type { DeliveryRow, DeliveryFilters } from './livraisons.types'

type BlFilters = Pick<DeliveryFilters, 'date_from' | 'date_to'>

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function BonsLivraison() {
  const [rows, setRows]         = useState<DeliveryRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<BlFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await getDeliveriesWithLv(filters)
    if (err) setError((err as Error).message)
    else setRows((data as unknown as DeliveryRow[]) ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const openRow = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  const hasFilters = !!(filters.date_from || filters.date_to)

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 glass rounded-[var(--r-xl)] px-4 py-3">
        <input type="date" value={filters.date_from ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          title="Date début" className={filterCls} />
        <input type="date" value={filters.date_to ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          title="Date fin" className={filterCls} />
        {hasFilters && (
          <Button variant="ghost" size="compact" onClick={() => setFilters({})}>
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} />}
          title="Aucun bon de livraison"
          description="Les BL générés depuis l'onglet « Lettre de voiture » d'une livraison apparaîtront ici."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['N° BL', 'Date', 'Client', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => openRow(row)}
                    className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                      ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}`}
                  >
                    <td className="px-4 py-3 font-mono text-[var(--text)]">{row.lv_numero}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDate(row.date)}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.clients?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {row.lv_pdf_url ? (
                        <Button variant="ghost" size="compact"
                          onClick={() => window.open(row.lv_pdf_url!, '_blank', 'noopener,noreferrer')}>
                          Voir PDF
                        </Button>
                      ) : (
                        <Button variant="secondary" size="compact" onClick={() => openRow(row)}>
                          Regénérer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {rows.map(row => (
              <button
                key={row.id}
                onClick={() => openRow(row)}
                className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono font-medium text-[var(--text)]">{row.lv_numero}</span>
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{row.clients?.name ?? '—'}</span>
                  </div>
                  <span className="text-[var(--fs-xs)] text-[var(--brand)]">Voir</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerLivraison
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        delivery={selected}
        onSaved={load}
        initialTab="lv"
      />
    </div>
  )
}
