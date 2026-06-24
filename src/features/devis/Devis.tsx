import { useState, useEffect, useCallback } from 'react'
import { FileText } from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { Badge }       from '../../shared/ui/Badge'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { useToast }    from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
import { listQuotes }  from './devis.queries'
import { STATUS_LABELS, STATUS_COLORS, isExpiredDisplay } from './devis.logic'
import { DrawerDevis } from './DrawerDevis'
import type { Quote }  from './devis.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

// ── Composant principal ────────────────────────────────────────────────────────

export function Devis() {
  const { toast } = useToast()

  const [quotes, setQuotes]     = useState<Quote[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]   = useState<Quote | null>(null)

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await listQuotes()
    if (error) {
      setLoadError((error as { message?: string }).message ?? 'Erreur de chargement')
      toast('Erreur de chargement des devis', 'error')
    } else {
      setQuotes(data ?? [])
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNew = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  const openEdit = (q: Quote) => {
    setSelected(q)
    setDrawerOpen(true)
  }

  const handleSaved = () => load()

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openNew()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Shell pageTitle="Devis" actions={['nouveau']} onAction={handleAction}>
      <div className="flex flex-col gap-5">

        {loading ? (
          <SkeletonTable />
        ) : loadError ? (
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{loadError}</p>
        ) : quotes.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="Aucun devis"
            description="Créez votre premier devis pour commencer."
          />
        ) : (
          <>
            {/* Table (desktop) */}
            <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    {['Date', 'N° devis', 'Client', 'Description', 'TTC', 'Validité', 'Statut', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {quotes.map(q => {
                    const expired = isExpiredDisplay(q.valid_until, q.statut)
                    return (
                      <tr key={q.id}
                        className="hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                        onClick={() => openEdit(q)}>
                        <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                          {fmtDate(q.date)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--fs-xs)] whitespace-nowrap">
                          {q.pennylane_quote_number
                            ? <span className="text-[var(--text)]">{q.pennylane_quote_number}</span>
                            : <span className="text-[var(--text-disabled)]">—</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)] whitespace-nowrap">
                          {q.clients?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] max-w-xs truncate">
                          {q.description ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">
                          {q.amount_ttc_cts != null ? formatMoney(q.amount_ttc_cts) : '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                          {q.valid_until ? fmtDate(q.valid_until) : '—'}
                          {expired && (
                            <span className="ml-1 text-[var(--warning)] text-[var(--fs-xs)]">⚠</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={STATUS_COLORS[q.statut]}>
                            {STATUS_LABELS[q.statut]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="compact" variant="secondary"
                            onClick={e => { e.stopPropagation(); openEdit(q) }}>
                            Ouvrir
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cartes (mobile) */}
            <div className="flex flex-col gap-3 md:hidden">
              {quotes.map(q => {
                const expired = isExpiredDisplay(q.valid_until, q.statut)
                return (
                  <div key={q.id}
                    className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-2 cursor-pointer hover:border-[var(--brand)]/40 transition-colors"
                    onClick={() => openEdit(q)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text)]">{q.clients?.name ?? '—'}</span>
                      <Badge color={STATUS_COLORS[q.statut]}>{STATUS_LABELS[q.statut]}</Badge>
                    </div>
                    <p className="text-[var(--fs-sm)] text-[var(--text-muted)] truncate">
                      {q.description ?? '—'}
                    </p>
                    <div className="flex items-center justify-between text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <span>{fmtDate(q.date)}</span>
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {q.amount_ttc_cts != null ? formatMoney(q.amount_ttc_cts) : '—'}
                      </span>
                    </div>
                    {q.valid_until && (
                      <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                        Valable jusqu'au {fmtDate(q.valid_until)}
                        {expired && <span className="ml-1 text-[var(--warning)]">⚠ Expiré</span>}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <DrawerDevis
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        quote={selected}
        onSaved={handleSaved}
      />
    </Shell>
  )
}
