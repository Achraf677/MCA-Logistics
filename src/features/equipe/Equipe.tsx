import { useState, useEffect, useCallback } from 'react'
import { UserCheck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { useProfile } from '../../app/providers'
import { getTeamMembers } from './equipe.queries'
import {
  CONTRACT_LABELS, ROLE_LABELS, getContractLabel, formatSalaryMonthly, formatSalaryAnnual,
  masseSalariale, aptitude, memberEcheances, isDriverRole,
} from './equipe.logic'
import { DrawerMembre } from './DrawerMembre'
import type { TeamMember, TeamFilters } from './equipe.types'
import type { ActionKey } from '../../shared/actions/ActionBar'
import type { EcheanceStatus } from '../../shared/lib/echeances'

const PASTILLE: Record<EcheanceStatus, string | null> = {
  ok:      'bg-[var(--success)]',
  soon:    'bg-[var(--warning)]',
  overdue: 'bg-[var(--danger)]',
  none:    null,
}

function AptitudeBadge({ member }: { member: TeamMember }) {
  const status = aptitude(member)
  if (status === 'apte') {
    return <Badge color="success">Apte</Badge>
  }
  return <Badge color="danger">À régulariser</Badge>
}

function worstEcheanceStatus(member: TeamMember): EcheanceStatus {
  const echeances = memberEcheances(member)
  if (echeances.some(e => e.status === 'overdue')) return 'overdue'
  if (echeances.some(e => e.status === 'soon'))    return 'soon'
  if (echeances.some(e => e.status === 'ok'))      return 'ok'
  return 'none'
}

function EcheancePastille({ member }: { member: TeamMember }) {
  if (!isDriverRole(member.role)) return null
  const worst = worstEcheanceStatus(member)
  const style = PASTILLE[worst]
  if (!style) return null
  const title = worst === 'overdue' ? 'Validité dépassée' : worst === 'soon' ? 'Validité proche' : 'Validités OK'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${style}`} title={title} />
}

export function Equipe() {
  useProfile()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<TeamFilters>({ active: true })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<TeamMember | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getTeamMembers(filters)
    if (error) setError(error.message)
    else setMembers(data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const openDrawer = (m?: TeamMember) => {
    setSelected(m ?? null)
    setDrawerOpen(true)
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openDrawer()
  }

  const today = new Date()
  const masse = masseSalariale(members)
  const actifs = members.filter(m => m.active).length
  const aRegulariser = members.filter(m =>
    isDriverRole(m.role) && aptitude(m, today) === 'a_regulariser'
  ).length

  const displayedMembers = filters.echeance === 'urgent'
    ? members.filter(m => isDriverRole(m.role) && aptitude(m, today) === 'a_regulariser')
    : members

  return (
    <Shell pageTitle="Équipe" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading ? <SkeletonKpis count={4} /> : <>
          <KpiCard label="Membres actifs" value={actifs} />
          <KpiCard label="Masse salariale / mois" value={formatSalaryMonthly(masse)} />
          <KpiCard label="Masse salariale / an" value={formatSalaryAnnual(masse)} />
          <KpiCard label="À régulariser" value={aRegulariser} accent={aRegulariser > 0} />
        </>}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filters.role ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, role: (e.target.value || 'all') as TeamFilters['role'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Tous rôles</option>
          {(Object.entries(ROLE_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filters.contract_type ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, contract_type: (e.target.value || 'all') as TeamFilters['contract_type'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Tous contrats</option>
          {(Object.entries(CONTRACT_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Button
          variant={filters.active === true ? 'primary' : 'secondary'} size="compact"
          onClick={() => setFilters(f => ({ ...f, active: f.active === true ? undefined : true }))}
        >Actifs uniquement</Button>
        <Button
          variant={filters.echeance === 'urgent' ? 'primary' : 'secondary'} size="compact"
          onClick={() => setFilters(f => ({ ...f, echeance: f.echeance === 'urgent' ? undefined : 'urgent' }))}
        >À régulariser</Button>
      </div>

      {loading ? <SkeletonTable rows={4} />
        : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : displayedMembers.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={48} />}
            title="Aucun membre"
            description="Ajoutez les membres de votre équipe."
            action={{ label: '+ Ajouter un membre', onClick: () => openDrawer() }}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                    {['Nom', 'Rôle', 'Contrat', 'Salaire brut / mois', 'Aptitude', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedMembers.map((m, i) => (
                    <tr key={m.id} onClick={() => openDrawer(m)}
                      className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors
                        ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}`}>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <div className="flex items-center gap-2">
                          <EcheancePastille member={m} />
                          {m.full_name}
                          {!m.active && <span className="text-[var(--text-disabled)] text-[var(--fs-xs)]">(inactif)</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {m.role ? ROLE_LABELS[m.role] : (m.role_label ?? '—')}
                      </td>
                      <td className="px-4 py-3">
                        {m.contract_type
                          ? <Badge color="info">{getContractLabel(m.contract_type)}</Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--text)]">{formatSalaryMonthly(m.salary_gross_cts)}</td>
                      <td className="px-4 py-3">
                        <AptitudeBadge member={m} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openDrawer(m) }}>Voir</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              {displayedMembers.map(m => (
                <button key={m.id} onClick={() => openDrawer(m)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <EcheancePastille member={m} />
                      <span className="font-medium text-[var(--text)]">{m.full_name}</span>
                    </div>
                    <AptitudeBadge member={m} />
                  </div>
                  <div className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {(m.role ? ROLE_LABELS[m.role] : m.role_label) && (
                      <span>{m.role ? ROLE_LABELS[m.role] : m.role_label} · </span>
                    )}
                    {m.contract_type && <Badge color="info">{getContractLabel(m.contract_type)}</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

      <DrawerMembre
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        member={selected}
        onSaved={load}
      />
    </Shell>
  )
}
