import { useState, useEffect, useCallback, useMemo } from 'react'
import { FileText, Search, X } from 'lucide-react'
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
import type { Quote, QuoteStatus }  from './devis.types'
import { PRESTATION_LABELS } from '../../shared/lib/prestations'
import type { ActionKey } from '../../shared/actions/ActionBar'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { toLocalISO } from '../../shared/lib/dates'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

// ── Composant principal ────────────────────────────────────────────────────────

export function Devis() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutCreer = can('livraisons.devis', 'create')

  const [quotes, setQuotes]     = useState<Quote[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]   = useState<Quote | null>(null)
  // Filtres : mêmes gestes que la liste des livraisons (recherche, statut, client).
  const [saisie, setSaisie]       = useState('')
  const [statut, setStatut]       = useState<QuoteStatus | 'all'>('all')
  const [clientId, setClientId]   = useState('')

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

  const clientsListe = useMemo(() => {
    const m = new Map<string, string>()
    for (const q of quotes) if (q.clients?.name) m.set(q.client_id, q.clients.name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [quotes])

  const visibles = useMemo(() => {
    const t = saisie.trim().toLowerCase()
    return quotes.filter(q =>
      (statut === 'all' || q.statut === statut)
      && (!clientId || q.client_id === clientId)
      && (!t || [q.clients?.name, q.description, q.pennylane_quote_number, q.reference_client]
        .some(v => v?.toLowerCase().includes(t))))
  }, [quotes, saisie, statut, clientId])

  // En attente de réponse : brouillons et envoyés (TTC).
  const enAttente = useMemo(() => quotes
    .filter(q => q.statut === 'brouillon' || q.statut === 'envoye')
    .reduce((s, q) => s + (q.amount_ttc_cts ?? 0), 0), [quotes])

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau' && peutCreer) openNew()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Shell pageTitle="Devis" actions={peutCreer ? ['nouveau'] : []} onAction={handleAction}>
      <div className="flex flex-col gap-3">
        {!loading && !loadError && quotes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[12rem] basis-full sm:basis-auto">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] pointer-events-none" />
              <input value={saisie} onChange={e => setSaisie(e.target.value)}
                placeholder="Client, libellé, n° devis, référence…" aria-label="Rechercher un devis"
                className={`${champCls} w-full pl-8 pr-7`} />
              {saisie && (
                <button type="button" onClick={() => setSaisie('')} aria-label="Effacer la recherche" title="Effacer la recherche"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]">
                  <X size={13} />
                </button>
              )}
            </label>
            <select value={statut} onChange={e => setStatut(e.target.value as QuoteStatus | 'all')}
              aria-label="Statut" className={`${champCls} sm:w-[9rem]`}>
              <option value="all">Tous statuts</option>
              {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              aria-label="Client" className={`${champCls} sm:w-[11rem]`}>
              <option value="">Tous clients</option>
              {clientsListe.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
            <span className="text-xs text-[var(--text-muted)] sm:ml-auto">
              {visibles.length} devis · en attente de réponse : <span className="font-mono">{formatMoney(enAttente)}</span> TTC
            </span>
          </div>
        )}

        {loading ? (
          <SkeletonTable />
        ) : loadError ? (
          <p className="text-[var(--danger)] text-sm">{loadError}</p>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    {['Date', 'N° devis', 'Client', 'Prestation', 'Libellé', 'TTC', 'Validité', 'Statut', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {visibles.map(q => {
                    const expired = isExpiredDisplay(q.valid_until, q.statut, toLocalISO(new Date()))
                    return (
                      <tr key={q.id}
                        className="hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                        onClick={() => openEdit(q)}>
                        <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                          {fmtDate(q.date)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                          {q.pennylane_quote_number
                            ? <span className="text-[var(--text)]">{q.pennylane_quote_number}</span>
                            : <span className="text-[var(--text-disabled)]">—</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)] whitespace-nowrap">
                          {q.clients?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                          {q.prestation ? PRESTATION_LABELS[q.prestation] : '—'}
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
                            <span className="ml-1 text-[var(--warning)] text-xs">dépassée</span>
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
              {visibles.map(q => {
                const expired = isExpiredDisplay(q.valid_until, q.statut, toLocalISO(new Date()))
                return (
                  <div key={q.id}
                    className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-2 cursor-pointer hover:border-[var(--brand)]/40 transition-colors"
                    onClick={() => openEdit(q)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text)]">{q.clients?.name ?? '—'}</span>
                      <Badge color={STATUS_COLORS[q.statut]}>{STATUS_LABELS[q.statut]}</Badge>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] truncate">
                      {q.description ?? '—'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>{fmtDate(q.date)}</span>
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {q.amount_ttc_cts != null ? formatMoney(q.amount_ttc_cts) : '—'}
                      </span>
                    </div>
                    {q.valid_until && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Valable jusqu'au {fmtDate(q.valid_until)}
                        {expired && <span className="ml-1 text-[var(--warning)]">(dépassée)</span>}
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

// Même champ que la liste des livraisons.
const champCls = `h-8 min-w-0 px-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-xs placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--brand)] transition-colors`
