import { useState, useEffect, useCallback, useMemo } from 'react'
import { Copy, Loader2, Mail, CheckCircle } from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { KpiCard }     from '../../shared/ui/KpiCard'
import { Badge }       from '../../shared/ui/Badge'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { useToast }    from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
import { getOverdueInvoices, markRelanceSent, generateRelanceDraft } from './relances.queries'
import { buildRelancePrompt } from './relances.logic'
import type { RelanceRow, Palier } from './relances.types'

// ── Couleur des badges de palier ─────────────────────────────────────────────

const PALIER_COLOR: Record<Palier, 'muted' | 'warning' | 'danger'> = {
  'J+0':  'muted',
  'J+8':  'warning',
  'J+15': 'danger',
  'J+30': 'danger',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR')
}

// ── Composant principal ────────────────────────────────────────────────────────

export function Relances() {
  const { toast } = useToast()

  const [rows, setRows]       = useState<RelanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Relance active
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [draft, setDraft]         = useState<string | null>(null)
  const [drafting, setDrafting]   = useState(false)
  const [marking, setMarking]     = useState(false)

  // ── Chargement ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await getOverdueInvoices()
    if (error) setLoadError((error as { message?: string }).message ?? 'Erreur de chargement')
    else setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── KPIs ──────────────────────────────────────────────────────────────────────

  const totalCts = useMemo(() => rows.reduce((s, r) => s + r.effective_ttc_cts, 0), [rows])
  const uniqueClients = useMemo(() => new Set(rows.map(r => r.client_id)).size, [rows])

  // ── Ligne active ──────────────────────────────────────────────────────────────

  const activeRow = rows.find(r => r.id === activeId) ?? null

  // ── Préparer le brouillon ─────────────────────────────────────────────────────

  const handlePrepare = async (row: RelanceRow) => {
    if (activeId === row.id) {
      setActiveId(null)
      setDraft(null)
      return
    }
    setActiveId(row.id)
    setDraft(null)
    setDrafting(true)

    const prompt = buildRelancePrompt({
      client_name:   row.client_name,
      invoice_id:    row.pennylane_invoice_id,
      ttc_eur:       row.effective_ttc_cts / 100,
      echeance_date: row.echeance_date,
      jours_retard:  row.jours_retard,
      relance_count: row.relance_count,
    })

    const { data, error } = await generateRelanceDraft(prompt)
    setDrafting(false)

    if (error || !data?.ok) {
      toast(error?.message ?? data?.error ?? 'Erreur lors de la génération', 'error')
      return
    }
    setDraft(data?.data?.text ?? '')
  }

  // ── Copier le brouillon ───────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      toast('Brouillon copié')
    } catch {
      toast('Impossible de copier', 'error')
    }
  }

  // ── Lien mailto ───────────────────────────────────────────────────────────────

  function mailtoHref(row: RelanceRow, draftText: string): string {
    const subject = row.pennylane_invoice_id
      ? `Relance facture ${row.pennylane_invoice_id}`
      : 'Relance règlement en attente'
    const body = encodeURIComponent(draftText)
    return `mailto:${row.client_email ?? ''}?subject=${encodeURIComponent(subject)}&body=${body}`
  }

  // ── Marquer comme relancée ────────────────────────────────────────────────────

  const handleMarkSent = async () => {
    if (!activeRow) return
    setMarking(true)
    const { error } = await markRelanceSent(activeRow.id, activeRow.relance_count)
    setMarking(false)
    if (error) {
      toast((error as { message?: string }).message ?? 'Erreur', 'error')
      return
    }
    toast(`Relance enregistrée pour ${activeRow.client_name}`)
    setActiveId(null)
    setDraft(null)
    await load()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Shell pageTitle="Relances impayées">
      <div className="flex flex-col gap-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard label="Total en retard" value={formatMoney(totalCts)} accent />
          <KpiCard label="Factures échues" value={rows.length} sub="en attente de paiement" />
          <KpiCard label="Clients concernés" value={uniqueClients} />
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
            <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    {['Client', 'N° facture', 'TTC', 'Échéance', 'Retard', 'Palier', 'Relances', 'Dernière', ''].map(h => (
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
                        {!row.client_email && (
                          <span className="ml-1.5 text-[var(--warning)] text-[var(--fs-xs)]" title="Pas d'email">⚠</span>
                        )}
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
                      <td className="px-4 py-3 text-center text-[var(--text-muted)]">
                        {row.relance_count}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap text-[var(--fs-xs)]">
                        {row.last_relance_at ? fmtDatetime(row.last_relance_at) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="compact"
                          variant={activeId === row.id ? 'primary' : 'secondary'}
                          onClick={() => handlePrepare(row)}>
                          {activeId === row.id && drafting
                            ? <Loader2 size={12} className="animate-spin" />
                            : 'Préparer'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Panneau brouillon */}
            {activeRow && (
              <div className="rounded-[var(--r-lg)] border border-[var(--brand)]/30 bg-[var(--bg-card)] p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[var(--text)]">
                    Relance — <span className="text-[var(--brand)]">{activeRow.client_name}</span>
                  </p>
                  {!activeRow.client_email && (
                    <span className="text-[var(--fs-xs)] text-[var(--warning)]">
                      ⚠ Aucun email renseigné pour ce client
                    </span>
                  )}
                </div>

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

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button variant="secondary" onClick={handleCopy}>
                        <Copy size={13} />
                        Copier
                      </Button>

                      {activeRow.client_email ? (
                        <a
                          href={mailtoHref(activeRow, draft)}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--r-md)]
                            border border-[var(--border)] bg-[var(--bg)] text-[var(--fs-sm)] text-[var(--text)]
                            hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors">
                          <Mail size={13} />
                          Ouvrir dans ma messagerie
                        </a>
                      ) : (
                        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] italic">
                          Copiez le brouillon manuellement (email manquant).
                        </span>
                      )}

                      <Button
                        variant="primary"
                        onClick={handleMarkSent}
                        disabled={marking}
                        className="ml-auto">
                        <CheckCircle size={13} />
                        {marking ? 'Enregistrement…' : 'Marquer comme relancée'}
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
