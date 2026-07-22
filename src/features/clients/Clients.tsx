import { useState, useEffect, useCallback } from 'react'
import { Users } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { SyncButton } from '../../shared/ui/SyncButton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { TabActions } from '../../shared/ui/TabbedSection'
import { DrawerClient } from './DrawerClient'
import { useToast } from '../../shared/ui/useToast'
import { getClients, exportClientsCSV, getFacturedDeliveries, getDeliveriesForTiersColumns, syncPennylaneClients } from './clients.queries'
import { getSyncState } from '../../shared/lib/syncState'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, countByType,
  computeEncours, computeCaFactureCts, lastDeliveryDate,
} from './clients.logic'
import { formatMoney } from '../../shared/lib/money'
import { downloadCSV } from '../../shared/lib/download'
import type { Client, ClientFilters, DeliveryForEncours, DeliveryForTiersColumns } from './clients.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

interface ClientEncours {
  total_cts: number
  overdue_cts: number
  count: number
}

export function Clients() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const canCreate = can('tiers.clients', 'create')
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ClientFilters>({ active: true })
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  // Encours data: map clientId -> encours
  const [encoursByClient, setEncoursByClient] = useState<Map<string, ClientEncours>>(new Map())
  const [encoursLoading, setEncoursLoading] = useState(true)
  // Colonnes Tiers (CA facturé + dernière livraison) — Σ deliveries livrées/facturées/payées.
  const [caByClient, setCaByClient] = useState<Map<string, number>>(new Map())
  const [lastDeliveryByClient, setLastDeliveryByClient] = useState<Map<string, string | null>>(new Map())

  const loadEncours = useCallback(async (clientList: Client[]) => {
    setEncoursLoading(true)
    const { data } = await getFacturedDeliveries()
    if (!data) { setEncoursLoading(false); return }

    const clientMap = new Map(clientList.map(c => [c.id, c.payment_terms]))
    const byClient = new Map<string, DeliveryForEncours[]>()

    for (const d of data) {
      const clientId = (d as DeliveryForEncours & { client_id: string }).client_id
      if (!clientId) continue
      const paymentTerms = clientMap.get(clientId) ?? 30
      const enriched: DeliveryForEncours = { ...d, payment_terms: paymentTerms }
      const arr = byClient.get(clientId) ?? []
      arr.push(enriched)
      byClient.set(clientId, arr)
    }

    const result = new Map<string, ClientEncours>()
    for (const [clientId, deliveries] of byClient) {
      result.set(clientId, computeEncours(deliveries))
    }
    setEncoursByClient(result)
    setEncoursLoading(false)
  }, [])

  const loadTiersColumns = useCallback(async () => {
    const { data } = await getDeliveriesForTiersColumns()
    if (!data) return

    const byClient = new Map<string, DeliveryForTiersColumns[]>()
    for (const d of data) {
      if (!d.client_id) continue
      const arr = byClient.get(d.client_id) ?? []
      arr.push(d)
      byClient.set(d.client_id, arr)
    }

    const ca = new Map<string, number>()
    const lastDate = new Map<string, string | null>()
    for (const [clientId, deliveries] of byClient) {
      ca.set(clientId, computeCaFactureCts(deliveries))
      lastDate.set(clientId, lastDeliveryDate(deliveries))
    }
    setCaByClient(ca)
    setLastDeliveryByClient(lastDate)
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getClients({ ...filters, search: search || undefined })
    if (error) { setError(error.message); setLoading(false); return }
    const clientList = data ?? []
    setClients(clientList)
    setLoading(false)
    loadEncours(clientList)
    loadTiersColumns()
  }, [filters, search, loadEncours, loadTiersColumns])

  const fetchLastSync = useCallback(async () => {
    const ts = await getSyncState('pennylane_clients')
    setLastSyncAt(ts)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchLastSync() }, [fetchLastSync])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportClientsCSV({ ...filters, search: search || undefined })
      downloadCSV(csv, 'clients.csv')
      toast('Export téléchargé')
    }
  }

  const openClient = (c: Client) => { setSelected(c); setDrawerOpen(true) }

  const byType = countByType(clients)
  const actifs = clients.filter(c => c.active).length

  // Totaux encours pour KPIs
  let kpiTotal = 0
  let kpiOverdue = 0
  for (const e of encoursByClient.values()) {
    kpiTotal += e.total_cts
    kpiOverdue += e.overdue_cts
  }

  // Filtre "avec encours" appliqué côté client
  const displayedClients = filters.withEncours
    ? clients.filter(c => (encoursByClient.get(c.id)?.total_cts ?? 0) > 0)
    : clients

  return (
    <Shell pageTitle="Clients" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      <TabActions>
        <SyncButton
          label="Synchroniser clients Pennylane"
          lastSyncAt={lastSyncAt}
          onSync={async () => {
            const { data, error } = await syncPennylaneClients()
            if (error || data?.ok === false) {
              return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la synchronisation clients' }
            }
            const errors: string[] = data?.data?.errors ?? []
            if (errors.length > 0) {
              return { ok: false, message: errors[0] }
            }
            const n = data?.data?.clients_upserts ?? 0
            await load()
            await fetchLastSync()
            return { ok: true, message: n > 0 ? `${n} client(s) synchronisé(s)` : 'Aucun nouveau client' }
          }}
        />
      </TabActions>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-5 mb-6 [&>*]:min-w-0">
        {loading
          ? <SkeletonKpis count={6} />
          : <>
            <KpiCard label="Clients actifs" value={actifs} />
            <KpiCard label="Médical" value={byType.medical ?? 0} />
            <KpiCard label="E-commerce" value={byType.ecommerce ?? 0} />
            <KpiCard label="Retail / Autres" value={(byType.retail ?? 0) + (byType.particulier ?? 0)} />
            <KpiCard
              label="Encours total"
              value={encoursLoading ? '…' : formatMoney(kpiTotal)}
            />
            <KpiCard
              label="Dont en retard"
              value={encoursLoading ? '…' : formatMoney(kpiOverdue)}
            />
          </>
        }
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4 glass rounded-[var(--r-xl)] px-4 py-3">
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors w-48"
        />
        <select
          value={filters.type ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, type: (e.target.value || 'all') as ClientFilters['type'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Tous types</option>
          {(Object.entries(CLIENT_TYPE_LABELS) as [string, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Button
          variant={filters.active === true ? 'primary' : 'secondary'}
          size="compact"
          onClick={() => setFilters(f => ({ ...f, active: f.active === true ? undefined : true }))}
        >
          Actifs uniquement
        </Button>
        <Button
          variant={filters.withEncours ? 'primary' : 'secondary'}
          size="compact"
          onClick={() => setFilters(f => ({ ...f, withEncours: !f.withEncours }))}
        >
          Avec encours
        </Button>
      </div>

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : displayedClients.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="Aucun client"
          description={filters.withEncours ? 'Aucun client avec encours.' : 'Commencez par ajouter votre premier client.'}
          action={!filters.withEncours && canCreate ? { label: '+ Nouveau client', onClick: () => { setSelected(null); setDrawerOpen(true) } } : undefined}
        />
      ) : (
        <>
          {/* Desktop : tableau */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Nom', 'Type', 'CA facturé', 'Encours', 'Dernière livraison', 'Statut paiement', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedClients.map((c, i) => {
                  const enc = encoursByClient.get(c.id)
                  const hasOverdue = (enc?.overdue_cts ?? 0) > 0
                  const payStatus: 'a_jour' | 'du' | 'en_retard' =
                    !enc || enc.count === 0 ? 'a_jour' :
                    hasOverdue ? 'en_retard' : 'du'
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openClient(c)}
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                        ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}`}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text)] uppercase">
                        {c.name}
                        {!c.active && <span className="ml-2 text-[var(--text-disabled)] text-[var(--fs-xs)] normal-case">(inactif)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.type
                          ? <Badge color={CLIENT_TYPE_COLORS[c.type] as 'info' | 'success' | 'warning' | 'muted' | 'purple'}>
                              {CLIENT_TYPE_LABELS[c.type]}
                            </Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {formatMoney(caByClient.get(c.id) ?? 0)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {encoursLoading ? '…' : enc ? formatMoney(enc.total_cts) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-[var(--fs-xs)]">
                        {formatDeliveryDate(lastDeliveryByClient.get(c.id))}
                      </td>
                      <td className="px-4 py-3">
                        {encoursLoading ? '…' : <PaymentStatusBadge status={payStatus} hasEncours={!!enc && enc.count > 0} />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openClient(c) }}>
                          Voir
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes empilées */}
          <div className="md:hidden flex flex-col gap-3">
            {displayedClients.map(c => {
              const enc = encoursByClient.get(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => openClient(c)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-[var(--text)] uppercase">{c.name}</span>
                    {encoursLoading
                      ? <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">…</span>
                      : <PaymentStatusBadge
                          status={!enc || enc.count === 0 ? 'a_jour' : (enc.overdue_cts ?? 0) > 0 ? 'en_retard' : 'du'}
                          hasEncours={!!enc && enc.count > 0}
                        />}
                  </div>
                  <div className="flex flex-col gap-1 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {enc && enc.count > 0 && (
                      <span className={enc.overdue_cts > 0 ? 'text-[var(--danger)]' : ''}>
                        Encours : {formatMoney(enc.total_cts)}
                        {enc.overdue_cts > 0 && ` (${formatMoney(enc.overdue_cts)} en retard)`}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      <DrawerClient
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        client={selected}
        onSaved={load}
      />
    </Shell>
  )
}

function PaymentStatusBadge({ status, hasEncours }: { status: 'a_jour' | 'du' | 'en_retard'; hasEncours: boolean }) {
  if (!hasEncours) return <span className="text-[var(--text-disabled)]">—</span>
  if (status === 'en_retard') return <Badge color="danger">En retard</Badge>
  if (status === 'du') return <Badge color="warning">Dû</Badge>
  return <Badge color="success">À jour</Badge>
}

function formatDeliveryDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
