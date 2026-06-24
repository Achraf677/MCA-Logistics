import { useState, useEffect, useCallback, useMemo } from 'react'
import { CheckCircle, AlertTriangle, FileText, Users, CheckCheck, ExternalLink } from 'lucide-react'
import { Shell }        from '../../app/Shell'
import { KpiCard }      from '../../shared/ui/KpiCard'
import { Badge }        from '../../shared/ui/Badge'
import { EmptyState }   from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { SyncButton }   from '../../shared/ui/SyncButton'
import { formatMoney }  from '../../shared/lib/money'
import { getOverdueInvoices, checkPayments } from './relances.queries'
import type { RelanceRow, Palier } from './relances.types'

const PALIER_COLOR: Record<Palier, 'muted' | 'warning' | 'danger'> = {
  'J+0':  'muted',
  'J+8':  'warning',
  'J+15': 'danger',
  'J+30': 'danger',
}

const PL_INVOICES = 'https://app.pennylane.com/companies/23200904/customer_invoices'

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

export function Relances() {
  const [rows, setRows]           = useState<RelanceRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await getOverdueInvoices()
    if (error) setLoadError((error as { message?: string }).message ?? 'Erreur de chargement')
    else setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const totalCts      = useMemo(() => rows.reduce((s, r) => s + r.effective_ttc_cts, 0), [rows])
  const uniqueClients = useMemo(() => new Set(rows.map(r => r.client_id)).size, [rows])

  return (
    <Shell pageTitle="Relances impayées">
      <div className="flex flex-col gap-5">

        {/* Note + SyncButton */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] flex-1">
            Les relances sont gérées dans Pennylane (séquences automatiques). Cette vue est un radar des impayés.
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
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 [&>*]:min-w-0">
          <KpiCard label="Total en retard"   value={formatMoney(totalCts)} tone="danger"  icon={<AlertTriangle size={18} />} />
          <KpiCard label="Factures échues"   value={rows.length} sub="en attente de paiement" tone="warning" icon={<FileText size={18} />} />
          <KpiCard label="Clients concernés" value={uniqueClients} tone="info" icon={<Users size={18} />} />
        </div>

        {/* Corps */}
        {loading ? (
          <SkeletonTable />
        ) : loadError ? (
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{loadError}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle size={40} />}
            title="Aucune facture en retard"
            description="Toutes les factures sont dans les délais ou déjà payées."
          />
        ) : (
          <div className="overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                  {['Client', 'N° facture', 'TTC', 'Échéance', 'Retard', 'Palier', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map(row => (
                  <tr key={row.id} className="transition-colors hover:bg-[var(--bg-card-hover)]">
                    <td className="px-4 py-3 font-medium text-[var(--text)] whitespace-nowrap">
                      {row.client_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)] text-[var(--fs-xs)]">
                      {row.pennylane_invoice_id ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">
                      {formatMoney(row.effective_ttc_cts)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                      {fmtDate(row.echeance_date)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--danger)] whitespace-nowrap">
                      +{row.jours_retard}j
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={PALIER_COLOR[row.palier]}>{row.palier}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={PL_INVOICES}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--brand)] text-[var(--fs-xs)] hover:underline whitespace-nowrap">
                        Gérer dans Pennylane
                        <ExternalLink size={11} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  )
}
