import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Clock, Car, UserCheck, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getAlertesData } from './alertes.queries'
import { MAINTENANCE_TYPE_LABELS } from '../entretiens/entretiens.logic'
import type { MaintenanceType } from '../entretiens/entretiens.types'

function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function daysUntil(dateStr: string): number {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

type Level = 'danger' | 'warning' | 'info'

const LEVEL_STYLES: Record<Level, { border: string; header: string }> = {
  danger:  { border: 'border-[var(--danger)]/30',  header: 'bg-[var(--danger)]/10 text-[var(--danger)]' },
  warning: { border: 'border-[var(--warning)]/30', header: 'bg-[var(--warning)]/10 text-[var(--warning)]' },
  info:    { border: 'border-[var(--info)]/30',    header: 'bg-[var(--info)]/10 text-[var(--info)]' },
}

interface AlertGroupProps {
  level: Level
  title: string
  icon: React.ReactNode
  count: number
  link: string
  children: React.ReactNode
}

function AlertGroupCard({ level, title, icon, count, link, children }: AlertGroupProps) {
  const navigate = useNavigate()
  const style = LEVEL_STYLES[level]
  return (
    <div className={`rounded-[var(--r-lg)] border overflow-hidden ${style.border}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 ${style.header}`}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-[var(--fs-sm)]">{title}</span>
          <span className="text-[var(--fs-xs)] opacity-70">({count})</span>
        </div>
        <Button variant="ghost" size="compact"
          onClick={() => navigate(link)}
          className="text-current opacity-70 hover:opacity-100">
          Voir →
        </Button>
      </div>
      <div className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
        {children}
      </div>
    </div>
  )
}

export function Alertes() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAlertesData>> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setData(await getAlertesData())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <Shell pageTitle="Alertes">
        <div className="space-y-4 max-w-2xl">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </Shell>
    )
  }

  const overdueMaintenances = data?.overdueMaintenances ?? []
  const oldInvoiced         = data?.oldInvoiced ?? []
  const maintenanceVehicles = data?.maintenanceVehicles ?? []
  const expiringContracts   = data?.expiringContracts ?? []

  const totalAlerts =
    overdueMaintenances.length + oldInvoiced.length +
    maintenanceVehicles.length + expiringContracts.length

  return (
    <Shell pageTitle="Alertes">
      <div className="max-w-2xl space-y-4">

        <div className="flex items-center justify-between mb-2">
          <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">
            {totalAlerts === 0
              ? 'Aucune alerte active'
              : `${totalAlerts} alerte${totalAlerts > 1 ? 's' : ''} active${totalAlerts > 1 ? 's' : ''}`}
          </span>
          <Button variant="ghost" size="compact" onClick={load}>Actualiser</Button>
        </div>

        {totalAlerts === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-[var(--text-muted)]">
            <CheckCircle size={48} className="text-[var(--success)]" />
            <div className="text-center">
              <p className="font-semibold text-[var(--text)]">Tout est en ordre</p>
              <p className="text-[var(--fs-sm)] mt-1">Aucune alerte à signaler pour le moment.</p>
            </div>
          </div>
        )}

        {overdueMaintenances.length > 0 && (
          <AlertGroupCard level="danger" title="Entretiens en retard"
            icon={<AlertTriangle size={16} />} count={overdueMaintenances.length} link="/entretiens">
            {overdueMaintenances.map((m, i) => {
              const veh = m.vehicles as unknown as { label: string; plate: string } | null
              return (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{veh?.label ?? '—'}</span>
                    <span className="ml-2 text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {m.type ? MAINTENANCE_TYPE_LABELS[m.type as MaintenanceType] : ''}
                    </span>
                    <p className="text-[var(--fs-xs)] text-[var(--danger)]">
                      Échéance : {new Date(m.next_due_date as string).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <span className="text-[var(--fs-xs)] text-[var(--danger)] font-mono shrink-0">
                    +{daysAgo(m.next_due_date as string)} j
                  </span>
                </div>
              )
            })}
          </AlertGroupCard>
        )}

        {oldInvoiced.length > 0 && (
          <AlertGroupCard level="warning" title="Factures impayées (> 30 j)"
            icon={<Clock size={16} />} count={oldInvoiced.length} link="/livraisons">
            {oldInvoiced.map((d, i) => {
              const client = d.clients as unknown as { name: string } | null
              return (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{client?.name ?? '—'}</span>
                    <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                      Facturée le {new Date(d.date as string).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-[var(--fs-sm)] text-[var(--text)]">
                      {formatCents(d.montant_ttc_cts as number)}
                    </p>
                    <p className="text-[var(--fs-xs)] text-[var(--warning)]">+{daysAgo(d.date as string)} j</p>
                  </div>
                </div>
              )
            })}
          </AlertGroupCard>
        )}

        {maintenanceVehicles.length > 0 && (
          <AlertGroupCard level="warning" title="Véhicules en maintenance"
            icon={<Car size={16} />} count={maintenanceVehicles.length} link="/vehicules">
            {maintenanceVehicles.map((v, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{v.label as string}</span>
                <span className="font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{v.plate as string}</span>
              </div>
            ))}
          </AlertGroupCard>
        )}

        {expiringContracts.length > 0 && (
          <AlertGroupCard level="info" title="CDD expirant dans 30 jours"
            icon={<UserCheck size={16} />} count={expiringContracts.length} link="/equipe">
            {expiringContracts.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{m.full_name as string}</span>
                <div className="text-right shrink-0">
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {new Date(m.end_date as string).toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-[var(--fs-xs)] text-[var(--info)]">
                    Dans {daysUntil(m.end_date as string)} j
                  </p>
                </div>
              </div>
            ))}
          </AlertGroupCard>
        )}
      </div>
    </Shell>
  )
}
