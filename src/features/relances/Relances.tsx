import { useState, useEffect, useCallback, useMemo } from 'react'
import { Copy, Loader2, CheckCircle, AlertTriangle, FileText, Users, CheckCheck } from 'lucide-react'
import { Shell }        from '../../app/Shell'
import { KpiCard }      from '../../shared/ui/KpiCard'
import { Badge }        from '../../shared/ui/Badge'
import { Button }       from '../../shared/ui/Button'
import { EmptyState }   from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { SyncButton }   from '../../shared/ui/SyncButton'
import { useToast }     from '../../shared/ui/useToast'
import { formatMoney }  from '../../shared/lib/money'
import { getOverdueInvoices, checkPayments, generateRelanceDraft } from './relances.queries'
import { buildRelancePrompt } from './relances.logic'
import type { RelanceRow, Palier } from './relances.types'

const PALIER_COLOR: Record<Palier, 'muted' | 'warning' | 'danger'> = {
  'J+0':  'muted',
  'J+8':  'warning',
  'J+15': 'danger',
  'J+30': 'danger',
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

export function Relances() {
  const { toast } = useToast()

  const [rows, setRows]           = useState<RelanceRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Brouillon IA (lecture seule, zéro écriture DB)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft]       = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)

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

  const activeRow = rows.find(r => r.id === activeId) ?? null

  const handlePrepare = async (row: RelanceRow) => {
    if (activeId === row.id) { setActiveId(null); setDraft(null); return }
    setActiveId(row.id)
    setDraft(null)
    setDrafting(true)
    const prompt = buildRelancePrompt({
      client_name:   row.client_name,
      invoice_id:    row.pennylane_invoice_id,
      ttc_eur:       row.effective_ttc_cts / 100,
      echeance_date: row.echeance_date,
      jours_retard:  row.jours_retard,
    })
    const { data, error } = await generateRelanceDraft(prompt)
    setDrafting(false)
    if (error || !data?.ok) { toast(error?.message ?? data?.error ?? 'Erreur lors de la génération', 'error'); return }
    setDraft(data?.data?.text ?? '')
  }

  const handleCopy = async () => {
    if (!draft) return
    try { await navigator.clipboard.writeText(draft); toast('Brouillon copié') }
    catch { toast('Impossible de copier', 'error') }
  }

  return (
    <Shell pageTitle="Relances impayées">
      <div className="flex flex-col gap-5">

        {/* Note + SyncButton */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] flex-1">
            Pennylane gère les relances automatiques. Cette vue contrôle les impayés&nbsp;;
            le statut payé est mis à jour via «&nbsp;Vérifier les paiements&nbsp;».
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
          <div className="flex flex-col gap-4">
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
                    <tr key={row.id}
                      className={`transition-colors ${activeId === row.id ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--bg-card-hover)]'}`}>
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
                      <td className="px-4 py-3">
                        <Button
                          size="compact"
                          variant={activeId === row.id ? 'primary' : 'secondary'}
                          onClick={() => handlePrepare(row)}>
                          {activeId === row.id && drafting
                            ? <Loader2 size={12} className="animate-spin" />
                            : 'Brouillon IA'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Panneau brouillon IA — lecture seule, texte à copier */}
            {activeRow && (
              <div className="rounded-[var(--r-lg)] border border-[var(--brand)]/30 bg-[var(--bg-card)] p-5 flex flex-col gap-4">
                <p className="font-medium text-[var(--text)]">
                  Brouillon — <span className="text-[var(--brand)]">{activeRow.client_name}</span>
                </p>
                {drafting ? (
                  <div className="flex items-center gap-2 text-[var(--text-muted)] text-[var(--fs-sm)]">
                    <Loader2 size={16} className="animate-spin" />
                    Génération du brouillon…
                  </div>
                ) : draft !== null && (
                  <>
                    <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3
                      text-[var(--fs-sm)] text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                      {draft}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="secondary" onClick={handleCopy}>
                        <Copy size={13} />
                        Copier
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  )
}
