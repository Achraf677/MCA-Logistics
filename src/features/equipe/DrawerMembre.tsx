import { useState, useEffect } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { createTeamMember, updateTeamMember, deactivateTeamMember, getMemberRecentDeliveries } from './equipe.queries'
import {
  CONTRACT_LABELS, ROLE_LABELS, memberEcheances, isDriverRole,
} from './equipe.logic'
import type { TeamMember, TeamMemberInsert } from './equipe.types'
import type { EcheanceStatus } from '../../shared/lib/echeances'

interface DrawerMembreProps {
  open: boolean
  onClose: () => void
  member?: TeamMember | null
  onSaved: () => void
}

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

const STATUS_DOT: Record<EcheanceStatus, string> = {
  ok:      'bg-[var(--success)]',
  soon:    'bg-[var(--warning)]',
  overdue: 'bg-[var(--danger)]',
  none:    'bg-[var(--border)]',
}
const STATUS_TEXT: Record<EcheanceStatus, string> = {
  ok:      'OK',
  soon:    'Proche',
  overdue: 'Dépassée',
  none:    'Non renseignée',
}

function ValiditesBloc({ member }: { member: TeamMember }) {
  const echeances = memberEcheances(member)
  return (
    <div className="flex flex-col gap-2">
      {echeances.map(e => (
        <div key={e.label} className="flex items-center justify-between bg-[var(--bg)] rounded-[var(--r-md)] px-3 py-2 text-[var(--fs-sm)]">
          <span className="text-[var(--text-muted)]">{e.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-disabled)] font-mono text-[var(--fs-xs)]">
              {e.date ?? '—'}
            </span>
            {e.daysLeft !== null && e.status !== 'none' && (
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                ({e.daysLeft < 0 ? `${Math.abs(e.daysLeft)} j dépassé` : `${e.daysLeft} j`})
              </span>
            )}
            <span
              className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[e.status]}`}
              title={STATUS_TEXT[e.status]}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

type Tab = 'detail' | 'validites' | 'historique'

export function DrawerMembre({ open, onClose, member, onSaved }: DrawerMembreProps) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('detail')
  const [form, setForm] = useState<Partial<TeamMemberInsert>>({})
  const [saving, setSaving] = useState(false)
  const [deliveries, setDeliveries] = useState<Array<{ id: string; date: string | null; delivery_address: string | null; statut: string | null; montant_ht_cts: number | null }>>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const isEdit = !!member
  const showValidites = isDriverRole(member?.role ?? null)

  useEffect(() => {
    if (!open) return
    setTab('detail')
    setForm(member ? {
      full_name: member.full_name,
      role: member.role ?? undefined,
      role_label: member.role_label ?? '',
      idcc: member.idcc,
      coefficient: member.coefficient ?? undefined,
      contract_type: member.contract_type,
      salary_gross_cts: member.salary_gross_cts ?? undefined,
      start_date: member.start_date ?? '',
      end_date: member.end_date ?? '',
      phone: member.phone ?? '',
      email: member.email ?? '',
      license_type: member.license_type ?? '',
      licence_b_expiry: member.licence_b_expiry ?? '',
      medical_visit_expiry: member.medical_visit_expiry ?? '',
      active: member.active,
      company_id: member.company_id,
    } : { active: true, idcc: '16', company_id: companyId ?? '' })
  }, [open, member, companyId])

  useEffect(() => {
    if (tab !== 'historique' || !member) return
    setLoadingHistory(true)
    getMemberRecentDeliveries(member.id).then(({ data }) => {
      setDeliveries(data ?? [])
      setLoadingHistory(false)
    })
  }, [tab, member])

  const set = (k: keyof TeamMemberInsert, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.full_name?.trim()) { toast('Le nom est requis', 'error'); return }
    setSaving(true)
    try {
      if (isEdit && member) {
        const { error } = await updateTeamMember(member.id, form)
        if (error) throw error
        toast('Membre mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createTeamMember({ ...form, company_id: companyId } as TeamMemberInsert)
        if (error) throw error
        toast('Membre ajouté')
      }
      onSaved(); onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!member) return
    if (!confirm(`Désactiver ${member.full_name} ?`)) return
    const { error } = await deactivateTeamMember(member.id)
    if (error) { toast(error.message, 'error'); return }
    toast(`${member.full_name} désactivé`)
    onSaved(); onClose()
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'detail',    label: 'Détail' },
    ...(showValidites ? [{ key: 'validites' as Tab, label: 'Validités' }] : []),
    { key: 'historique', label: 'Historique' },
  ]

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? member!.full_name : 'Nouveau membre'}>
      <div className="flex flex-col gap-4">
        {/* Onglets */}
        {isEdit && (
          <div className="flex gap-1 border-b border-[var(--border)] pb-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1 text-[var(--fs-sm)] rounded-[var(--r-md)] transition-colors
                  ${tab === t.key
                    ? 'bg-[var(--brand)] text-white font-medium'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Tab : Détail ── */}
        {(!isEdit || tab === 'detail') && (
          <>
            <FieldGroup label="Nom complet *">
              <input value={form.full_name ?? ''} onChange={e => set('full_name', e.target.value)} className={inputClass} />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Rôle">
                <select value={form.role ?? ''} onChange={e => set('role', e.target.value || null)} className={inputClass}>
                  <option value="">—</option>
                  {(Object.entries(ROLE_LABELS) as [string, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Fonction / Poste">
                <input value={form.role_label ?? ''} onChange={e => set('role_label', e.target.value)} className={inputClass} placeholder="ex. Chauffeur-livreur" />
              </FieldGroup>
            </div>

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
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              {isEdit && member?.active && (
                <Button variant="ghost" onClick={handleDeactivate} className="ml-auto text-[var(--danger)]">Désactiver</Button>
              )}
            </div>
          </>
        )}

        {/* ── Tab : Validités (chauffeurs uniquement) ── */}
        {isEdit && tab === 'validites' && showValidites && (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">Dates de validité</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Permis B — expiration">
                  <input type="date"
                    value={form.licence_b_expiry ?? ''}
                    onChange={e => set('licence_b_expiry', e.target.value || null)}
                    className={inputClass} />
                </FieldGroup>
                <FieldGroup label="Visite médicale — expiration">
                  <input type="date"
                    value={form.medical_visit_expiry ?? ''}
                    onChange={e => set('medical_visit_expiry', e.target.value || null)}
                    className={inputClass} />
                </FieldGroup>
              </div>

              {/* Pastilles de statut */}
              <p className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide mt-2">Statut actuel</p>
              <ValiditesBloc member={{ ...member!, ...form as Partial<TeamMember> } as TeamMember} />
            </div>

            <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
            </div>
          </>
        )}

        {/* ── Tab : Historique ── */}
        {isEdit && tab === 'historique' && (
          <div className="flex flex-col gap-2">
            {loadingHistory ? (
              <p className="text-[var(--text-muted)] text-[var(--fs-sm)]">Chargement…</p>
            ) : deliveries.length === 0 ? (
              <p className="text-[var(--text-muted)] text-[var(--fs-sm)] py-6 text-center">Aucune livraison récente</p>
            ) : (
              deliveries.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-[var(--bg)] rounded-[var(--r-md)] px-3 py-2 text-[var(--fs-sm)]">
                  <div>
                    <span className="font-mono text-[var(--text-disabled)] text-[var(--fs-xs)]">{d.date ?? '—'}</span>
                    {d.delivery_address && (
                      <span className="ml-2 text-[var(--text-muted)]">{d.delivery_address}</span>
                    )}
                  </div>
                  {d.statut && (
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)] capitalize">{d.statut}</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}
