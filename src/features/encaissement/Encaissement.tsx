import { useState, useEffect, useCallback } from 'react'
import { CheckCheck, Euro, FileText, Banknote } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { SyncButton } from '../../shared/ui/SyncButton'
import { useToast } from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { getEncaissements, checkPayments, exportEncaissementsCSV, getAutresEntrees } from './encaissement.queries'
import { formatCents, kpiSummary, autreEntreeLabel, autresEntreesTotal } from './encaissement.logic'
import { downloadCSV } from '../../shared/lib/download'
import type { EncaissementRow, EncaissementFilters, AutreEntreeRow } from './encaissement.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type ClientLookup = { id: string; label: string }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function Encaissement() {
  const { toast } = useToast()
  const [rows, setRows]             = useState<EncaissementRow[]>([])
  const [autres, setAutres]         = useState<AutreEntreeRow[]>([])
  const [clients, setClients]       = useState<ClientLookup[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [filters, setFilters]       = useState<EncaissementFilters>({})

  useEffect(() => {
    supabase.from('clients').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setClients((data ?? []).map(c => ({ id: c.id, label: c.name }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [enc, ae] = await Promise.all([
      getEncaissements(filters),
      getAutresEntrees({ date_from: filters.date_from, date_to: filters.date_to }),
    ])
    if (enc.error) setError((enc.error as Error).message)
    else setRows(enc.data ?? [])
    setAutres(ae.data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'export') {
      const csv = await exportEncaissementsCSV(filters)
      downloadCSV(csv, 'encaissements.csv')
      toast('Export téléchargé')
    }
  }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.client_id && filters.client_id !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Encaissement" actions={['export']} onAction={handleAction}>
      <div className="flex flex-col gap-5">

        {/* Note + SyncButton */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] flex-1">
            Le statut payé provient de Pennylane&nbsp;; la saisie manuelle a été retirée.
          </p>
          <SyncButton
            label="Vérifier les paiements"
            icon={<CheckCheck size={13} />}
            onSync={async () => {
              const { data, error } = await checkPayments()
              if (error || data?.ok === false)
                return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la vérification' }
              const marked = data?.data?.marked_payee ?? 0
              await load()
              return { ok: true, message: marked > 0 ? `${marked} livraison(s) marquée(s) payée(s)` : 'Aucun nouveau paiement détecté' }
            }}
          />
        </div>

        {/* KPIs */}
        {loading ? (
          <div className="grid grid-cols-2 gap-5 [&>*]:min-w-0">
            {[0, 1].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 [&>*]:min-w-0">
            <KpiCard label="Encaissements" value={kpis.nb}                              tone="info"    icon={<FileText size={18} />} />
            <KpiCard label="Total encaissé" value={formatCents(kpis.totalEncaisseCts)}  tone="success" icon={<Euro size={18} />} />
          </div>
        )}

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3 glass rounded-[var(--r-xl)] px-4 py-3">
          <input type="date" value={filters.date_from ?? ''}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
            title="Date début" className={filterCls} />
          <input type="date" value={filters.date_to ?? ''}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
            title="Date fin" className={filterCls} />
          <select value={filters.client_id ?? 'all'}
            onChange={e => setFilters(f => ({ ...f, client_id: e.target.value || 'all' }))}
            className={filterCls}>
            <option value="all">Tous clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {hasFilters && (
            <Button variant="ghost" size="compact" onClick={() => setFilters({})}>Réinitialiser</Button>
          )}
        </div>

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
            icon={<Banknote size={48} />}
            title="Aucun encaissement"
            description={hasFilters
              ? 'Aucun résultat pour ces filtres.'
              : 'Les factures réglées (rapprochées dans Pennylane) apparaîtront ici automatiquement.'}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                    {['Date encaissement', 'Client', 'Montant TTC', 'N° facture'].map(h => (
                      <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map(row => (
                    <tr key={row.id} className="transition-colors hover:bg-[var(--bg-card-hover)]">
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
                        {fmtDate(row.paid_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{row.client_name}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--text)] whitespace-nowrap">
                        {formatCents(row.effective_ttc_cts)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {row.pennylane_invoice_id ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              {rows.map(row => (
                <div key={row.id}
                  className="glass rounded-[var(--r-lg)] p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-[var(--text)]">{row.client_name}</span>
                    <span className="font-mono font-semibold text-[var(--text)]">{formatCents(row.effective_ttc_cts)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{fmtDate(row.paid_at)}</span>
                    <span className="font-mono">{row.pennylane_invoice_id ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {/* Autres entrées — crédits Qonto hors CA */}
        <div className="glass rounded-[var(--r-xl)] overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-[var(--border)]">
            <p className="font-semibold text-[var(--text)] text-[var(--fs-sm)]">Autres entrées</p>
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mt-0.5">
              Apports CCA, remboursements — hors chiffre d'affaires
            </p>
          </div>

          {loading ? (
            <div className="p-5"><SkeletonTable rows={3} /></div>
          ) : autres.length === 0 ? (
            <div className="px-5 py-8 text-center text-[var(--fs-xs)] text-[var(--text-muted)]">
              Aucune autre entrée sur la période.
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[var(--fs-sm)]">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                      {['Date', 'Libellé', 'Montant', 'Nature'].map(h => (
                        <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {autres.map(r => (
                      <tr key={r.qonto_id} className="transition-colors hover:bg-[var(--bg-card-hover)]">
                        <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
                          {fmtDate(r.settled_at)}
                        </td>
                        <td className="px-4 py-3 text-[var(--text)] max-w-xs truncate">{r.label ?? '—'}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-[var(--success,#16a34a)] whitespace-nowrap">
                          +{formatCents(r.amount_cts)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={r.justif_type ? 'info' : 'warning'}>
                            {autreEntreeLabel(r.justif_type)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {/* Sous-total */}
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-elevated)]">
                      <td colSpan={2} className="px-4 py-2.5 text-[var(--fs-xs)] text-[var(--text-muted)] font-medium">
                        Sous-total
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-[var(--success,#16a34a)] whitespace-nowrap">
                        +{formatCents(autresEntreesTotal(autres))}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden flex flex-col divide-y divide-[var(--border)]">
                {autres.map(r => (
                  <div key={r.qonto_id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--text)] text-[var(--fs-sm)] truncate">{r.label ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{fmtDate(r.settled_at)}</span>
                        <Badge color={r.justif_type ? 'info' : 'warning'}>
                          {autreEntreeLabel(r.justif_type)}
                        </Badge>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[var(--success,#16a34a)] whitespace-nowrap shrink-0">
                      +{formatCents(r.amount_cts)}
                    </span>
                  </div>
                ))}
                <div className="px-4 py-2.5 flex items-center justify-between bg-[var(--bg-elevated)]">
                  <span className="text-[var(--fs-xs)] text-[var(--text-muted)] font-medium">Sous-total</span>
                  <span className="font-mono font-bold text-[var(--success,#16a34a)]">
                    +{formatCents(autresEntreesTotal(autres))}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
