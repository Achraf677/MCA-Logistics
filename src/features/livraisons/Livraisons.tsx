import { useState, useEffect, useCallback } from 'react'
import { Package, RefreshCw, Loader2, Trash2, FileText } from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { KpiCard }     from '../../shared/ui/KpiCard'
import { Badge }       from '../../shared/ui/Badge'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { DrawerLivraison } from './DrawerLivraison'
import { useToast }    from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { downloadCSV } from '../../shared/lib/download'
import { getDeliveries, exportDeliveriesCSV, getPendingSyncDeliveries, resyncPending, deleteDeliveries } from './livraisons.queries'
import {
  STATUS_LABELS, STATUS_COLORS, TYPE_LABELS,
  kpiSummary, formatCents, effectiveTtcCts,
} from './livraisons.logic'
import type { DeliveryRow, DeliveryFilters, DeliveryStatus } from './livraisons.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const V2_STATUSES: DeliveryStatus[] = ['planifiee', 'en_cours', 'livree', 'facturee', 'payee', 'annulee']

// Supprimable = jamais facturée ni payée (lien Pennylane)
const isDeletable = (row: DeliveryRow) => !['facturee', 'payee'].includes(row.statut)

// Facturable via la sélection multiple : livrée, non encore synchro Pennylane, montant saisi
const isInvoiceable = (row: DeliveryRow) =>
  row.statut === 'livree' &&
  row.pennylane_invoice_id === null &&
  (row.amount_ht_cts ?? 0) > 0

export function Livraisons() {
  const { toast } = useToast()

  const { can } = usePermissions()
  const canCreate = can('livraisons.livraisons', 'create')
  const canDelete = can('livraisons.livraisons', 'delete')

  // ── État principal ─────────────────────────────────────────────────────────
  const [rows, setRows]         = useState<DeliveryRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<DeliveryFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [pendingSync, setPendingSync] = useState(0)
  const [resyncing, setResyncing] = useState(false)

  // ── Sélection suppression (président) ─────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // ── Sélection facturation (tous rôles, lignes facturables) ─────────────────
  const [invoiceIds, setInvoiceIds]         = useState<Set<string>>(new Set())
  const [invoiceClientId, setInvoiceClientId] = useState<string | null>(null)
  const [confirmInvoice, setConfirmInvoice] = useState(false)
  const [invoicing, setInvoicing]           = useState(false)

  // ── Chargement ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    // Vide les deux sélections à chaque rechargement
    setSelectedIds(new Set())
    setInvoiceIds(new Set())
    setInvoiceClientId(null)
    const { data, error: err } = await getDeliveries(filters)
    if (err) setError(err.message)
    else setRows((data as unknown as DeliveryRow[]) ?? [])
    setLoading(false)
  }, [filters])

  const loadPendingSync = useCallback(async () => {
    const { data } = await getPendingSyncDeliveries()
    setPendingSync((data as unknown[] | null)?.length ?? 0)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadPendingSync() }, [loadPendingSync])

  // ── Resync Pennylane ────────────────────────────────────────────────────────
  const handleResync = async () => {
    setResyncing(true)
    const { resynced, failed } = await resyncPending()
    await Promise.all([load(), loadPendingSync()])
    setResyncing(false)
    toast(
      `${resynced} resynchronisée(s)${failed > 0 ? `, ${failed} encore en échec` : ''}`,
      failed > 0 ? 'error' : 'success',
    )
  }

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportDeliveriesCSV(filters)
      downloadCSV(csv, 'livraisons.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  // ── Suppression multiple (président) ──────────────────────────────────────
  const deletableRows = rows.filter(isDeletable)
  const allDeletableSelected = deletableRows.length > 0 && deletableRows.every(r => selectedIds.has(r.id))

  const toggleOne = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const toggleAll = () => setSelectedIds(
    allDeletableSelected ? new Set() : new Set(deletableRows.map(r => r.id)),
  )

  const handleBulkDelete = async () => {
    const ids = deletableRows.filter(r => selectedIds.has(r.id)).map(r => r.id)
    if (ids.length === 0) { setConfirmBulk(false); return }
    setBulkDeleting(true)
    const { error } = await deleteDeliveries(ids)
    setBulkDeleting(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmBulk(false)
    await load()
    toast(`${ids.length} livraison(s) supprimée(s)`)
  }

  // ── Facturation groupée ────────────────────────────────────────────────────
  const invoiceSelectedRows = rows.filter(r => invoiceIds.has(r.id))
  const invoiceClientName   = invoiceSelectedRows[0]?.clients?.name ?? ''
  const invoiceTotalHtCts   = invoiceSelectedRows.reduce((s, r) => s + (r.amount_ht_cts ?? 0), 0)
  const invoiceTotalTtcCts  = invoiceSelectedRows.reduce((s, r) => s + effectiveTtcCts(r), 0)

  const clearInvoiceSelection = () => { setInvoiceIds(new Set()); setInvoiceClientId(null) }

  const toggleInvoice = (row: DeliveryRow) => {
    const next = new Set(invoiceIds)
    if (next.has(row.id)) next.delete(row.id)
    else next.add(row.id)
    setInvoiceIds(next)
    // Verrouille sur le client de la première sélection ; libère si tout vide
    const remaining = rows.filter(r => next.has(r.id))
    setInvoiceClientId(remaining.length > 0 ? remaining[0].client_id : null)
  }

  const handleInvoice = async () => {
    const ids = [...invoiceIds]
    setInvoicing(true)
    try {
      const { data, error } = await supabase.functions.invoke('pennylane-invoice', {
        body: { delivery_ids: ids },
      })
      if (error || !data?.ok) {
        toast(data?.error ?? error?.message ?? 'Erreur de facturation Pennylane.', 'error')
        return
      }
      setConfirmInvoice(false)
      clearInvoiceSelection()
      await load()
      toast(`Facture créée — ${ids.length} course(s)`, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setInvoicing(false)
    }
  }

  // ── Filtres ─────────────────────────────────────────────────────────────────
  const hasFilters = !!(
    filters.date_from || filters.date_to ||
    (filters.status && filters.status !== 'all')
  )

  const kpis = kpiSummary(rows)

  return (
    <Shell pageTitle="Livraisons" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Ce mois"     value={kpis.nbMois} />
          <KpiCard label="CA facturé"  value={formatCents(kpis.caFactureCts)} accent />
          <KpiCard label="À facturer"  value={kpis.enAttenteFacturation} />
          <KpiCard label="En att. paiement" value={formatCents(kpis.enAttentePaiementCts)} />
        </div>
      )}

      {/* Bandeau resync Pennylane */}
      {pendingSync > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3
          rounded-[var(--r-lg)] border border-[var(--warning)]/30 bg-[var(--warning)]/10">
          <span className="text-[var(--fs-sm)] text-[var(--text)]">
            {pendingSync} livraison(s) en attente de synchronisation Pennylane
          </span>
          <Button variant="secondary" size="compact" onClick={handleResync} disabled={resyncing}>
            {resyncing
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            Resynchroniser
          </Button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="date" value={filters.date_from ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          title="Date début" className={filterCls} />
        <input type="date" value={filters.date_to ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          title="Date fin" className={filterCls} />
        <select
          value={filters.status ?? 'all'}
          onChange={e => setFilters(f => ({
            ...f, status: (e.target.value || 'all') as DeliveryFilters['status'],
          }))}
          className={filterCls}
        >
          <option value="all">Tous statuts</option>
          {V2_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="compact" onClick={() => setFilters({})}>
            Réinitialiser
          </Button>
        )}
      </div>

      {/* ── Barre d'action facturation groupée (≥ 1 cochée) ─────────────────── */}
      {invoiceIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-2.5
          rounded-[var(--r-lg)] border border-[var(--brand)]/40 bg-[var(--brand)]/8">
          <div className="flex flex-wrap items-center gap-3 text-[var(--fs-sm)] text-[var(--text)]">
            <span>
              <b>{invoiceIds.size}</b> course(s) · <b>{invoiceClientName}</b>
              {' '}· {formatCents(invoiceTotalHtCts)} HT / {formatCents(invoiceTotalTtcCts)} TTC
            </span>
            <button
              onClick={clearInvoiceSelection}
              className="text-[var(--fs-xs)] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)] transition-colors"
            >
              Tout désélectionner
            </button>
          </div>
          <Button variant="primary" size="compact" onClick={() => setConfirmInvoice(true)}>
            <FileText size={14} />
            Facturer ({invoiceIds.size})
          </Button>
        </div>
      )}

      {/* Barre d'action suppression (≥ 1 sélectionnée, si droit delete) */}
      {canDelete && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-2.5
          rounded-[var(--r-lg)] border border-[var(--danger)]/30 bg-[var(--danger)]/10">
          <span className="text-[var(--fs-sm)] text-[var(--text)]">
            {selectedIds.size} sélectionnée(s)
          </span>
          <Button variant="primary" size="compact" onClick={() => setConfirmBulk(true)}
            className="!bg-[var(--danger)] hover:!bg-[var(--danger)]/90">
            <Trash2 size={14} />
            Supprimer la sélection
          </Button>
        </div>
      )}

      {/* ── Contenu principal ───────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Package size={48} />}
          title="Aucune livraison"
          description={hasFilters
            ? 'Aucune livraison ne correspond aux filtres.'
            : 'Commencez par saisir votre première course.'}
          action={!hasFilters && canCreate
            ? { label: '+ Nouvelle livraison', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop : tableau */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">

                  {/* Colonne case facturation — visible si au moins 1 ligne facturable */}
                  <th className="px-3 py-2.5 w-9" title="Sélectionner pour facturer">
                    {invoiceIds.size > 0 && (
                      <span className="text-[var(--fs-xs)] text-[var(--brand)] font-semibold">✓</span>
                    )}
                  </th>

                  {/* Colonne case suppression (si droit delete) */}
                  {canDelete && (
                    <th className="px-3 py-2.5 w-9">
                      <input
                        type="checkbox"
                        checked={allDeletableSelected}
                        onChange={toggleAll}
                        disabled={deletableRows.length === 0}
                        aria-label="Tout sélectionner"
                        className="accent-[var(--brand)] w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </th>
                  )}

                  {['Date', 'Client', 'Chauffeur', 'Montant TTC', 'km', 'Statut', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const invoiceable = isInvoiceable(row)
                  const invoiceBlocked = invoiceable && invoiceClientId !== null && row.client_id !== invoiceClientId
                  return (
                    <tr key={row.id} onClick={() => openRow(row)}
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors
                        hover:bg-[var(--bg-card-hover)]
                        ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}
                        ${invoiceBlocked ? 'opacity-50' : ''}`}
                    >

                      {/* Case à cocher facturation */}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        {invoiceable && (
                          <input
                            type="checkbox"
                            checked={invoiceIds.has(row.id)}
                            onChange={() => toggleInvoice(row)}
                            disabled={invoiceBlocked}
                            title={invoiceBlocked
                              ? `Autre client sélectionné (${invoiceClientName}) — désélectionnez d'abord`
                              : 'Sélectionner pour facturer'}
                            aria-label="Sélectionner pour facturer"
                            className="accent-[var(--brand)] w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        )}
                      </td>

                      {/* Case à cocher suppression */}
                      {canDelete && (
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isDeletable(row) && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleOne(row.id)}
                              aria-label="Sélectionner pour supprimer"
                              className="accent-[var(--brand)] w-4 h-4 cursor-pointer"
                            />
                          )}
                        </td>
                      )}

                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.clients?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {row.team_members?.full_name
                          ? <span className="inline-flex items-center gap-2">
                              <DriverAvatar name={row.team_members.full_name} />
                              {row.team_members.full_name}
                            </span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--text)]">
                        {effectiveTtcCts(row) > 0 ? formatCents(effectiveTtcCts(row)) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {row.km != null ? `${row.km} km` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>
                            {STATUS_LABELS[row.statut] ?? row.statut}
                          </Badge>
                          {row.pod_captured_at && (
                            <Badge color="success">Preuve ✓</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="compact"
                          onClick={e => { e.stopPropagation(); openRow(row) }}>
                          Voir
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes */}
          <div className="md:hidden flex flex-col gap-3">
            {rows.map(row => {
              const invoiceable = isInvoiceable(row)
              const invoiceBlocked = invoiceable && invoiceClientId !== null && row.client_id !== invoiceClientId
              return (
                <div key={row.id} className={`flex items-center gap-2 ${invoiceBlocked ? 'opacity-50' : ''}`}>
                  {/* Case facturation */}
                  {invoiceable ? (
                    <input
                      type="checkbox"
                      checked={invoiceIds.has(row.id)}
                      onChange={() => toggleInvoice(row)}
                      disabled={invoiceBlocked}
                      aria-label="Sélectionner pour facturer"
                      className="accent-[var(--brand)] w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
                    />
                  ) : (
                    /* Case suppression si pas facturable et droit delete */
                    canDelete && isDeletable(row) ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        aria-label="Sélectionner pour supprimer"
                        className="accent-[var(--brand)] w-4 h-4 cursor-pointer shrink-0"
                      />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )
                  )}

                  <button onClick={() => openRow(row)}
                    className="flex-1 text-left bg-[var(--bg-card)] rounded-[var(--r-lg)]
                      border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>
                          {STATUS_LABELS[row.statut] ?? row.statut}
                        </Badge>
                        {row.pod_captured_at && (
                          <Badge color="success">Preuve ✓</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                        <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                        {row.team_members?.full_name && <span>{row.team_members.full_name}</span>}
                        {row.type && <span>{TYPE_LABELS[row.type] ?? row.type}</span>}
                      </div>
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {effectiveTtcCts(row) > 0 ? formatCents(effectiveTtcCts(row)) : '—'}
                      </span>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Drawers & dialogs ──────────────────────────────────────────────── */}
      <DrawerLivraison
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        delivery={selected}
        onSaved={load}
      />

      <ConfirmDialog
        open={confirmBulk}
        title={`Supprimer ${selectedIds.size} livraison(s) ?`}
        message="Action irréversible."
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulk(false)}
        loading={bulkDeleting}
      />

      {/* ── Modal de confirmation facturation groupée ──────────────────────── */}
      {confirmInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!invoicing) setConfirmInvoice(false) }}
        >
          <div
            className="w-full max-w-lg bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)] shadow-xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-semibold text-[var(--text)]">Confirmer la facturation</h2>

            {/* Liste des courses */}
            <div className="rounded-[var(--r-lg)] overflow-hidden border border-[var(--border)]">
              <div className="bg-[var(--bg-elevated)] px-4 py-2 text-[var(--fs-xs)] uppercase tracking-wide
                text-[var(--text-muted)] grid grid-cols-[80px_1fr_auto] gap-3">
                <span>Date</span><span>Description</span><span>TTC</span>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-[var(--border)]">
                {invoiceSelectedRows.map(row => (
                  <div key={row.id}
                    className="px-4 py-2.5 grid grid-cols-[80px_1fr_auto] gap-3 text-[var(--fs-sm)]">
                    <span className="font-mono text-[var(--text-muted)] text-[var(--fs-xs)] self-center">
                      {new Date(row.date).toLocaleDateString('fr-FR')}
                    </span>
                    <span className="text-[var(--text)] truncate self-center">
                      {row.description?.trim() || row.delivery_address || '—'}
                    </span>
                    <span className="font-mono text-[var(--text)] text-right self-center">
                      {formatCents(effectiveTtcCts(row))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-[var(--bg-elevated)] px-4 py-2.5 flex justify-between
                text-[var(--fs-sm)] font-semibold border-t border-[var(--border)]">
                <span>{invoiceSelectedRows.length} course(s)</span>
                <span className="font-mono">
                  {formatCents(invoiceTotalHtCts)} HT · {formatCents(invoiceTotalTtcCts)} TTC
                </span>
              </div>
            </div>

            <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
              Une facture Pennylane unique sera créée au nom de <b>{invoiceClientName}</b>.
            </p>

            <div className="flex gap-3">
              <Button variant="primary" onClick={handleInvoice} disabled={invoicing}>
                {invoicing && <Loader2 size={14} className="animate-spin" />}
                {invoicing ? 'Création…' : 'Confirmer et facturer'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmInvoice(false)} disabled={invoicing}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
