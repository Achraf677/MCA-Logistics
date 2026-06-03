import { useState, useEffect, useCallback } from 'react'
import { UserCheck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { Drawer } from '../../shared/ui/Drawer'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { getTeamMembers, createTeamMember, updateTeamMember, deactivateTeamMember } from './equipe.queries'
import {
  CONTRACT_LABELS, getContractLabel, formatSalaryMonthly, formatSalaryAnnual, getMasseSalariale,
} from './equipe.logic'
import type { TeamMember, TeamMemberInsert, TeamFilters } from './equipe.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const inputClass = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)] transition-colors`

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

export function Equipe() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<TeamFilters>({ active: true })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [form, setForm] = useState<Partial<TeamMemberInsert>>({})
  const [saving, setSaving] = useState(false)

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
    setForm(m ? {
      full_name: m.full_name, role_label: m.role_label ?? '', idcc: m.idcc,
      coefficient: m.coefficient ?? undefined, contract_type: m.contract_type,
      salary_gross_cts: m.salary_gross_cts ?? undefined, start_date: m.start_date ?? '',
      end_date: m.end_date ?? '', phone: m.phone ?? '', email: m.email ?? '',
      license_type: m.license_type ?? '', active: m.active, company_id: m.company_id,
    } : { active: true, idcc: '16', company_id: companyId ?? '' })
    setDrawerOpen(true)
  }

  const set = (k: keyof TeamMemberInsert, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.full_name?.trim()) { toast('Le nom est requis', 'error'); return }
    setSaving(true)
    try {
      if (selected) {
        const { error } = await updateTeamMember(selected.id, form)
        if (error) throw error
        toast('Membre mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createTeamMember({ ...form, company_id: companyId } as TeamMemberInsert)
        if (error) throw error
        toast('Membre ajouté')
      }
      load(); setDrawerOpen(false)
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!selected) return
    if (!confirm(`Désactiver ${selected.full_name} ?`)) return
    const { error } = await deactivateTeamMember(selected.id)
    if (error) { toast(error.message, 'error'); return }
    toast(`${selected.full_name} désactivé`)
    load(); setDrawerOpen(false)
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openDrawer()
  }

  const masse = getMasseSalariale(members)
  const actifs = members.filter(m => m.active).length

  return (
    <Shell pageTitle="Équipe" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {loading ? <SkeletonKpis count={3} /> : <>
          <KpiCard label="Membres actifs" value={actifs} />
          <KpiCard label="Masse salariale / mois" value={formatSalaryMonthly(masse)} />
          <KpiCard label="Masse salariale / an" value={formatSalaryAnnual(masse)} />
        </>}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
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
      </div>

      {loading ? <SkeletonTable rows={4} />
        : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : members.length === 0 ? (
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
                    {['Nom', 'Fonction', 'Contrat', 'Salaire brut / mois', 'Salaire / an', 'Permis', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={m.id} onClick={() => openDrawer(m)}
                      className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors
                        ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}`}>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {m.full_name}
                        {!m.active && <span className="ml-2 text-[var(--text-disabled)] text-[var(--fs-xs)]">(inactif)</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{m.role_label ?? '—'}</td>
                      <td className="px-4 py-3">
                        {m.contract_type
                          ? <Badge color="info">{getContractLabel(m.contract_type)}</Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--text)]">{formatSalaryMonthly(m.salary_gross_cts)}</td>
                      <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{formatSalaryAnnual(m.salary_gross_cts)}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{m.license_type ?? '—'}</td>
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
              {members.map(m => (
                <button key={m.id} onClick={() => openDrawer(m)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-[var(--text)]">{m.full_name}</span>
                    {m.contract_type && <Badge color="info">{getContractLabel(m.contract_type)}</Badge>}
                  </div>
                  <div className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                    {m.role_label && <span>{m.role_label} · </span>}
                    {formatSalaryMonthly(m.salary_gross_cts)} / mois
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

      {/* Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title={selected ? selected.full_name : 'Nouveau membre'}>
        <div className="flex flex-col gap-4">
          <FieldGroup label="Nom complet *">
            <input value={form.full_name ?? ''} onChange={e => set('full_name', e.target.value)} className={inputClass} />
          </FieldGroup>
          <FieldGroup label="Fonction / Poste">
            <input value={form.role_label ?? ''} onChange={e => set('role_label', e.target.value)} className={inputClass} placeholder="ex. Chauffeur-livreur" />
          </FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Type de contrat">
              <select value={form.contract_type ?? ''} onChange={e => set('contract_type', e.target.value || null)} className={inputClass}>
                <option value="">—</option>
                {(Object.entries(CONTRACT_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FieldGroup>
            <FieldGroup label="Permis">
              <input value={form.license_type ?? ''} onChange={e => set('license_type', e.target.value)} className={inputClass} placeholder="B, C…" />
            </FieldGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Salaire brut / mois (€)">
              <input type="number" min={0} step={0.01}
                value={form.salary_gross_cts != null ? (form.salary_gross_cts / 100).toFixed(2) : ''}
                onChange={e => set('salary_gross_cts', Math.round(parseFloat(e.target.value || '0') * 100))}
                className={inputClass} placeholder="2 500,00" />
            </FieldGroup>
            <FieldGroup label="Coefficient">
              <input type="number" value={form.coefficient ?? ''} onChange={e => set('coefficient', parseInt(e.target.value) || null)} className={inputClass} />
            </FieldGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="IDCC">
              <input value={form.idcc ?? '16'} onChange={e => set('idcc', e.target.value)} className={inputClass} />
            </FieldGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Date début">
              <input type="date" value={form.start_date ?? ''} onChange={e => set('start_date', e.target.value || null)} className={inputClass} />
            </FieldGroup>
            <FieldGroup label="Date fin">
              <input type="date" value={form.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} className={inputClass} />
            </FieldGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="E-mail">
              <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} className={inputClass} />
            </FieldGroup>
            <FieldGroup label="Téléphone">
              <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputClass} />
            </FieldGroup>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
            <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Annuler</Button>
            {selected?.active && (
              <Button variant="ghost" onClick={handleDeactivate} className="ml-auto text-[var(--danger)]">Désactiver</Button>
            )}
          </div>
        </div>
      </Drawer>
    </Shell>
  )
}
