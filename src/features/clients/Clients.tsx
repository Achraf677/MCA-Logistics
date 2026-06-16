import { useState, useEffect, useCallback } from 'react'
import { Users } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { DrawerClient } from './DrawerClient'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { getClients, exportClientsCSV, getFacturedDeliveries } from './clients.queries'
import {
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, countByType,
  computeEncours, getTariffLabel,
} from './clients.logic'
import { formatMoney } from '../../shared/lib/money'
import { downloadCSV } from '../../shared/lib/download'
import type { Client, ClientFilters, DeliveryForEncours } from './clients.types'
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

  // Encours data: map clientId -> encours
  const [encoursByClient, setEncoursByClient] = useState<Map<string, ClientEncours>>(new Map())
  const [encoursLoading, setEncoursLoading] = useState(true)

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

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getClients({ ...filters, search: search || undefined })
    if (error) { setError(error.message); setLoading(false); return }
    const clientList = data ?? []
    setClients(clientList)
    setLoading(false)
    loadEncours(clientList)
  }, [filters, search, loadEncours])

  useEffect(() => { load() }, [load])

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
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
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
      <div className="flex flex-wrap gap-2 mb-4">
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
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Nom', 'Type', 'Tarif', 'Délai', 'Encours', 'Statut paiement', ''].map(h => (
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
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {c.name}
                        {!c.active && <span className="ml-2 text-[var(--text-disabled)] text-[var(--fs-xs)]">(inactif)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.type
                          ? <Badge color={CLIENT_TYPE_COLORS[c.type] as 'info' | 'success' | 'warning' | 'muted'}>
                              {CLIENT_TYPE_LABELS[c.type]}
                            </Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-[var(--fs-xs)]">
                        {getTariffLabel(c)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{c.payment_terms} j</td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {encoursLoading ? '…' : enc ? formatMoney(enc.total_cts) : '—'}
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
                    <span className="font-medium text-[var(--text)]">{c.name}</span>
                    {c.type && (
                      <Badge color={CLIENT_TYPE_COLORS[c.type] as 'info' | 'success' | 'warning' | 'muted'}>
                        {CLIENT_TYPE_LABELS[c.type]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    <span>Délai : {c.payment_terms} j · {getTariffLabel(c)}</span>
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
