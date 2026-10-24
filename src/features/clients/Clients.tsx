import { useState, useEffect, useCallback } from 'react'
import { AlarmClock, ChevronRight, Landmark, User, Users, UserCheck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { DrawerClient } from './DrawerClient'
import { useToast } from '../../shared/ui/useToast'
import { getClients, exportClientsCSV, getFacturedDeliveries, getDeliveriesForTiersColumns } from './clients.queries'
import { useSync } from '../../app/SyncProvider'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS,
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
  // Tous les clients (sans filtre) : les tuiles du haut comptent sur l'ensemble, pas sur la liste filtrée.
  const [tous, setTous] = useState<Client[]>([])
  const [enRetardSeul, setEnRetardSeul] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
  const { syncState, syncIfStale } = useSync()

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
    void getClients({}).then(r => setTous(r.data ?? []))
    loadEncours(clientList)
    loadTiersColumns()
  }, [filters, search, loadEncours, loadTiersColumns])

  useEffect(() => { syncIfStale('clients') }, [syncIfStale])
  useEffect(() => { load() }, [load, syncState.clients.lastSyncAt])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportClientsCSV({ ...filters, search: search || undefined })
      downloadCSV(csv, 'clients.csv')
      toast('Export téléchargé')
    }
  }

  const openClient = (c: Client) => { setSelected(c); setDrawerOpen(true) }

  const actifs = tous.filter(c => c.active)
  const nbPros = actifs.filter(c => c.type === 'professionnel').length
  const nbParticuliers = actifs.filter(c => c.type === 'particulier').length

  // Totaux encours pour les tuiles
  let kpiTotal = 0
  let kpiOverdue = 0
  for (const e of encoursByClient.values()) {
    kpiTotal += e.total_cts
    kpiOverdue += e.overdue_cts
  }

  // Filtres « avec encours » / « en retard » appliqués côté client
  const displayedClients = clients.filter(c => {
    const enc = encoursByClient.get(c.id)
    if (filters.withEncours && !((enc?.total_cts ?? 0) > 0)) return false
    if (enRetardSeul && !((enc?.overdue_cts ?? 0) > 0)) return false
    return true
  })

  const basculeType = (t: NonNullable<Client['type']>) => setFilters(f => ({ ...f, type: f.type === t ? 'all' : t }))
  const filtresActifs = search !== '' || (filters.type && filters.type !== 'all') || !!filters.withEncours || enRetardSeul

  return (
    <Shell pageTitle="Clients" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* Tuiles cliquables : chaque geste filtre la liste */}
      {loading && tous.length === 0
        ? <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5"><SkeletonKpis count={5} /></div>
        : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <ChiffreCarte libelle="Clients actifs" icone={<Users size={13} />} valeur={String(actifs.length)} detail={`sur ${tous.length} au total`}
              titre="Tous les clients actifs" actif={filters.active === true && (!filters.type || filters.type === 'all') && !filters.withEncours && !enRetardSeul}
              onClick={() => { setFilters({ active: true }); setEnRetardSeul(false) }} />
            <ChiffreCarte libelle="Professionnels" icone={<Landmark size={13} />} valeur={String(nbPros)} detail="entreprises" titre="Clients professionnels"
              actif={filters.type === 'professionnel'} onClick={() => basculeType('professionnel')} />
            <ChiffreCarte libelle="Particuliers" icone={<User size={13} />} valeur={String(nbParticuliers)} detail="personnes" titre="Clients particuliers"
              actif={filters.type === 'particulier'} onClick={() => basculeType('particulier')} />
            <ChiffreCarte libelle="Encours total" icone={<UserCheck size={13} />} valeur={encoursLoading ? '…' : formatMoney(kpiTotal)} detail="facturé, pas encore payé"
              titre="Clients avec encours" actif={!!filters.withEncours} onClick={() => setFilters(f => ({ ...f, withEncours: !f.withEncours }))} />
            <ChiffreCarte libelle="Dont en retard" icone={<AlarmClock size={13} />} valeur={encoursLoading ? '…' : formatMoney(kpiOverdue)}
              ton={kpiOverdue > 0 ? 'danger' : undefined} detail="échéance dépassée" titre="Clients en retard de paiement"
              actif={enRetardSeul} onClick={() => setEnRetardSeul(v => !v)} />
          </div>
        )}

      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BarreRecherche value={search} onChange={setSearch} placeholder="Chercher un client : nom, SIRET, e-mail…" ariaLabel="Rechercher un client"
          raccourci className="flex-1 min-w-[14rem] max-w-xl" compteur={`${displayedClients.length} résultat${displayedClients.length > 1 ? 's' : ''}`} />
        <div className="w-44">
          <ListeDeroulante valeur={filters.type ?? 'all'} ariaLabel="Type de client" recherche={false}
            onChange={v => setFilters(f => ({ ...f, type: v as ClientFilters['type'] }))}
            options={[{ valeur: 'all', libelle: 'Tous les types' }, ...(Object.entries(CLIENT_TYPE_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))]} />
        </div>
        <PastilleFiltre actif={filters.active === true} onClick={() => setFilters(f => ({ ...f, active: f.active === true ? undefined : true }))}>Actifs uniquement</PastilleFiltre>
        <PastilleFiltre actif={!!filters.withEncours} onClick={() => setFilters(f => ({ ...f, withEncours: !f.withEncours }))}>Avec encours</PastilleFiltre>
        {filtresActifs && (
          <button type="button" onClick={() => { setSearch(''); setFilters({ active: true }); setEnRetardSeul(false) }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] underline-offset-2 hover:underline">Tout réinitialiser</button>
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
      ) : displayedClients.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="Aucun client"
          description={filters.withEncours || enRetardSeul || search ? 'Aucun client ne correspond à ces filtres.' : 'Commencez par ajouter votre premier client.'}
          action={!filters.withEncours && !enRetardSeul && !search && canCreate ? { label: '+ Nouveau client', onClick: () => { setSelected(null); setDrawerOpen(true) } } : undefined}
        />
      ) : (
        <>
          {/* Desktop : tableau */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                  {['Client', 'Type', 'CA facturé', 'Encours', 'Dernière livraison', 'Paiement', ''].map(h => (
                    <th key={h} className={`px-4 py-2.5 font-medium ${h === 'CA facturé' || h === 'Encours' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedClients.map(c => {
                  const enc = encoursByClient.get(c.id)
                  const hasOverdue = (enc?.overdue_cts ?? 0) > 0
                  const payStatus: 'a_jour' | 'du' | 'en_retard' =
                    !enc || enc.count === 0 ? 'a_jour' :
                    hasOverdue ? 'en_retard' : 'du'
                  return (
                    <tr key={c.id} onClick={() => openClient(c)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') openClient(c) }}
                      className="group border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-3 min-w-0">
                          <AvatarInitiales nom={c.name} discret={!c.active} />
                          <span className="min-w-0">
                            <span className={`block truncate font-medium ${c.active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{c.name}</span>
                            <span className="block truncate text-xs text-[var(--text-muted)]">{!c.active ? 'Inactif' : (c.email || c.phone || '—')}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {c.type
                          ? <Badge color={CLIENT_TYPE_COLORS[c.type] as 'info' | 'success' | 'warning' | 'muted' | 'purple'}>
                              {CLIENT_TYPE_LABELS[c.type]}
                            </Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-muted)]">
                        {formatMoney(caByClient.get(c.id) ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-[var(--text)]">
                        {encoursLoading ? '…' : enc ? formatMoney(enc.total_cts) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {formatDeliveryDate(lastDeliveryByClient.get(c.id))}
                      </td>
                      <td className="px-4 py-2.5">
                        {encoursLoading ? '…' : <PaymentStatusBadge status={payStatus} hasEncours={!!enc && enc.count > 0} />}
                      </td>
                      <td className="pr-3 text-[var(--text-disabled)] group-hover:text-[var(--text-muted)]"><ChevronRight size={16} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes empilées */}
          <div className="md:hidden flex flex-col gap-2.5">
            {displayedClients.map(c => {
              const enc = encoursByClient.get(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => openClient(c)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-3.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <AvatarInitiales nom={c.name} discret={!c.active} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium text-[var(--text)] truncate">{c.name}</span>
                      {encoursLoading
                        ? <span className="text-xs text-[var(--text-muted)]">…</span>
                        : <PaymentStatusBadge
                            status={!enc || enc.count === 0 ? 'a_jour' : (enc.overdue_cts ?? 0) > 0 ? 'en_retard' : 'du'}
                            hasEncours={!!enc && enc.count > 0}
                          />}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] truncate">
                      {enc && enc.count > 0
                        ? <span className={enc.overdue_cts > 0 ? 'text-[var(--danger)]' : ''}>Encours : {formatMoney(enc.total_cts)}{enc.overdue_cts > 0 && ` (${formatMoney(enc.overdue_cts)} en retard)`}</span>
                        : (c.email || c.phone || (c.type ? CLIENT_TYPE_LABELS[c.type] : '—'))}
                    </span>
                  </span>
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
