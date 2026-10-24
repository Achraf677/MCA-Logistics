import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ShieldAlert, UserCheck, Users, Wallet, CalendarRange } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { useProfile } from '../../app/providers'
import { useToast } from '../../shared/ui/useToast'
import { downloadCSV } from '../../shared/lib/download'
import { toLocalISO } from '../../shared/lib/dates'
import { getTeamMembers } from './equipe.queries'
import {
  CONTRACT_LABELS, ROLE_LABELS, getContractLabel, formatSalaryMonthly, formatSalaryAnnual,
  masseSalariale, aptitude, memberEcheances, isDriverRole, membresCsv,
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
  // Permis et visite ne se suivent que pour un rôle qui conduit.
  if (!isDriverRole(member.role)) return <span className="text-[var(--text-disabled)]">—</span>
  const status = aptitude(member)
  if (status === 'apte') return <Badge color="success">Apte</Badge>
  if (status === 'a_completer') return <Badge color="warning">À compléter</Badge>
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
  const { toast } = useToast()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<TeamFilters>({ active: true })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [search, setSearch] = useState('')

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
    if (key === 'export') {
      if (displayedMembers.length === 0) { toast('Aucun membre à exporter', 'error'); return }
      downloadCSV(membresCsv(displayedMembers), `equipe-${toLocalISO(new Date())}.csv`)
    }
  }

  const today = new Date()
  const masse = masseSalariale(members)
  const actifs = members.filter(m => m.active).length
  const aRegulariser = members.filter(m =>
    isDriverRole(m.role) && aptitude(m, today) === 'a_regulariser'
  ).length

  const mot = search.trim().toLowerCase()
  const displayedMembers = members
    .filter(m => filters.echeance !== 'urgent' || (isDriverRole(m.role) && aptitude(m, today) === 'a_regulariser'))
    .filter(m => !mot || `${m.full_name} ${m.role ? ROLE_LABELS[m.role] : (m.role_label ?? '')}`.toLowerCase().includes(mot))
  const filtresActifs = search !== '' || (filters.role && filters.role !== 'all') || (filters.contract_type && filters.contract_type !== 'all') || filters.echeance === 'urgent'

  return (
    <Shell pageTitle="Équipe" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* Tuiles */}
      {loading ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"><SkeletonKpis count={4} /></div> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ChiffreCarte libelle="Membres actifs" icone={<Users size={13} />} valeur={String(actifs)} detail="dans l'équipe" titre="Tous les membres actifs"
            actif={filters.echeance !== 'urgent'} onClick={() => setFilters(f => ({ ...f, echeance: undefined }))} />
          <ChiffreCarte libelle="Masse salariale / mois" icone={<Wallet size={13} />} valeur={formatSalaryMonthly(masse)} detail="brut" titre="Masse salariale mensuelle"
            actif={false} onClick={() => setFilters(f => ({ ...f, echeance: undefined }))} />
          <ChiffreCarte libelle="Masse salariale / an" icone={<CalendarRange size={13} />} valeur={formatSalaryAnnual(masse)} detail="brut" titre="Masse salariale annuelle"
            actif={false} onClick={() => setFilters(f => ({ ...f, echeance: undefined }))} />
          <ChiffreCarte libelle="À régulariser" icone={<ShieldAlert size={13} />} valeur={String(aRegulariser)} ton={aRegulariser > 0 ? 'danger' : undefined}
            detail="permis ou visite à revoir" titre="Membres à régulariser"
            actif={filters.echeance === 'urgent'} onClick={() => setFilters(f => ({ ...f, echeance: f.echeance === 'urgent' ? undefined : 'urgent' }))} />
        </div>
      )}

      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BarreRecherche value={search} onChange={setSearch} placeholder="Chercher un membre : nom, rôle…" ariaLabel="Rechercher un membre"
          raccourci className="flex-1 min-w-[14rem] max-w-xl" compteur={`${displayedMembers.length} résultat${displayedMembers.length > 1 ? 's' : ''}`} />
        <div className="w-44">
          <ListeDeroulante valeur={filters.role ?? 'all'} ariaLabel="Rôle" recherche={false}
            onChange={v => setFilters(f => ({ ...f, role: v as TeamFilters['role'] }))}
            options={[{ valeur: 'all', libelle: 'Tous les rôles' }, ...(Object.entries(ROLE_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))]} />
        </div>
        <div className="w-52">
          <ListeDeroulante valeur={filters.contract_type ?? 'all'} ariaLabel="Contrat" recherche={false}
            onChange={v => setFilters(f => ({ ...f, contract_type: v as TeamFilters['contract_type'] }))}
            options={[{ valeur: 'all', libelle: 'Tous les contrats' }, ...(Object.entries(CONTRACT_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))]} />
        </div>
        <PastilleFiltre actif={filters.active === true} onClick={() => setFilters(f => ({ ...f, active: f.active === true ? undefined : true }))}>Actifs uniquement</PastilleFiltre>
        {filtresActifs && (
          <button type="button" onClick={() => { setSearch(''); setFilters({ active: true }) }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] underline-offset-2 hover:underline">Tout réinitialiser</button>
        )}
      </div>

      {loading ? <SkeletonTable rows={4} />
        : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-sm">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : displayedMembers.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={48} />}
            title="Aucun membre"
            description={filtresActifs ? 'Aucun membre ne correspond à ces filtres.' : 'Ajoutez les membres de votre équipe.'}
            action={!filtresActifs ? { label: '+ Ajouter un membre', onClick: () => openDrawer() } : undefined}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                    {['Membre', 'Rôle', 'Contrat', 'Salaire brut / mois', 'Aptitude', ''].map(h => (
                      <th key={h} className={`px-4 py-2.5 font-medium ${h.startsWith('Salaire') ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedMembers.map(m => (
                    <tr key={m.id} onClick={() => openDrawer(m)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') openDrawer(m) }}
                      className="group border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-3 min-w-0">
                          <AvatarInitiales nom={m.full_name} discret={!m.active} />
                          <span className="min-w-0">
                            <span className={`flex items-center gap-2 font-medium ${m.active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                              <span className="truncate">{m.full_name}</span>
                              <EcheancePastille member={m} />
                            </span>
                            {!m.active && <span className="block text-xs text-[var(--text-muted)]">Inactif</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">
                        {m.role ? ROLE_LABELS[m.role] : (m.role_label ?? '—')}
                      </td>
                      <td className="px-4 py-2.5">
                        {m.contract_type
                          ? <Badge color="info">{getContractLabel(m.contract_type)}</Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text)]">{formatSalaryMonthly(m.salary_gross_cts)}</td>
                      <td className="px-4 py-2.5">
                        <AptitudeBadge member={m} />
                      </td>
                      <td className="pr-3 text-[var(--text-disabled)] group-hover:text-[var(--text-muted)]"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-2.5">
              {displayedMembers.map(m => (
                <button key={m.id} onClick={() => openDrawer(m)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-3.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <AvatarInitiales nom={m.full_name} discret={!m.active} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-[var(--text)] truncate">{m.full_name}</span>
                        <EcheancePastille member={m} />
                      </span>
                      <AptitudeBadge member={m} />
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] truncate">
                      {(m.role ? ROLE_LABELS[m.role] : m.role_label) ?? '—'}{m.contract_type ? ` · ${getContractLabel(m.contract_type)}` : ''}
                    </span>
                  </span>
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
