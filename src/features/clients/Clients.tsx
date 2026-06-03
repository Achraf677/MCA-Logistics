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
import { getClients, exportClientsCSV } from './clients.queries'
import { CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, countByType } from './clients.logic'
import { downloadCSV } from '../../shared/lib/download'
import type { Client, ClientFilters } from './clients.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

export function Clients() {
  const { toast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ClientFilters>({ active: true })
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getClients({ ...filters, search: search || undefined })
    if (error) setError(error.message)
    else setClients(data ?? [])
    setLoading(false)
  }, [filters, search])

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

  return (
    <Shell pageTitle="Clients" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading
          ? <SkeletonKpis count={4} />
          : <>
            <KpiCard label="Clients actifs" value={actifs} />
            <KpiCard label="Médical" value={byType.medical ?? 0} />
            <KpiCard label="E-commerce" value={byType.ecommerce ?? 0} />
            <KpiCard label="Retail / Autres" value={(byType.retail ?? 0) + (byType.particulier ?? 0)} />
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
      </div>

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="Aucun client"
          description="Commencez par ajouter votre premier client."
          action={{ label: '+ Nouveau client', onClick: () => { setSelected(null); setDrawerOpen(true) } }}
        />
      ) : (
        <>
          {/* Desktop : tableau */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Nom', 'Type', 'SIRET', 'E-mail', 'Téléphone', 'Délai', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => (
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
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{c.siret ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{c.payment_terms} j</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openClient(c) }}>
                        Voir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes empilées */}
          <div className="md:hidden flex flex-col gap-3">
            {clients.map(c => (
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
                  <span>Délai : {c.payment_terms} j</span>
                </div>
              </button>
            ))}
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
