import { useState, useEffect } from 'react'
import { Activity, KeyRound, Trash2, UserRound } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ContactLinks } from '../../shared/ui/ContactLinks'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { toLocalISO } from '../../shared/lib/dates'
import { libelleStatutLivraison } from '../../shared/lib/livraisonStatuts'
import { changerActif } from '../../shared/lib/adminUsers.queries'
import { createTeamMember, updateTeamMember, deactivateTeamMember, getMemberRecentDeliveries } from './equipe.queries'
import {
  CONTRACT_LABELS, ROLE_LABELS, aptitude, getContractLabel, memberEcheances, isDriverRole,
  salaireSaisiCts, dateFr, erreurDateFin, libelleErreurAcces,
} from './equipe.logic'
import type { TeamMember, TeamMemberInsert } from './equipe.types'
import { AccesSite } from './AccesSite'
import type { EcheanceStatus } from '../../shared/lib/echeances'

interface DrawerMembreProps {
  open: boolean
  onClose: () => void
  member?: TeamMember | null
  onSaved: () => void
}

const TON_ECHEANCE: Record<EcheanceStatus, { couleur: string; texte: string }> = {
  ok:      { couleur: 'var(--success)', texte: 'À jour' },
  soon:    { couleur: 'var(--warning)', texte: 'Bientôt' },
  overdue: { couleur: 'var(--danger)',  texte: 'Dépassée' },
  none:    { couleur: 'var(--border-strong)', texte: 'À renseigner' },
}

/** Une validité (permis, visite) : sa date en clair, les jours restants, et un voyant. */
function VoyantValidite({ status, daysLeft }: { status: EcheanceStatus; daysLeft: number | null }) {
  const t = TON_ECHEANCE[status]
  const detail = status !== 'none' && daysLeft !== null ? (daysLeft < 0 ? ` · ${Math.abs(daysLeft)} j de retard` : ` · ${daysLeft} j`) : ''
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: t.couleur }}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: t.couleur }} />
      {t.texte}{detail}
    </span>
  )
}

type Onglet = 'fiche' | 'activite' | 'acces'

const ONGLETS: Array<{ cle: Onglet; libelle: string; icone: typeof UserRound }> = [
  { cle: 'fiche', libelle: 'Fiche', icone: UserRound },
  { cle: 'activite', libelle: 'Activité', icone: Activity },
  { cle: 'acces', libelle: 'Accès', icone: KeyRound },
]

export function DrawerMembre({ open, onClose, member, onSaved }: DrawerMembreProps) {
  const { companyId, profile } = useProfile()
  const { isPresident } = usePermissions()
  const { toast } = useToast()
  const [onglet, setOnglet] = useState<Onglet>('fiche')
  const [form, setForm] = useState<Partial<TeamMemberInsert>>({})
  const [saving, setSaving] = useState(false)
  const [deliveries, setDeliveries] = useState<Array<{ id: string; date: string | null; delivery_address: string | null; statut: string | null }>>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  // Désactivation : confirmation en ligne avec la date de fin (aujourd'hui par défaut).
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [dateFin, setDateFin] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [salaireTexte, setSalaireTexte] = useState('')
  const isEdit = !!member
  const conduit = isDriverRole((form.role ?? member?.role ?? null) as TeamMember['role'])

  useEffect(() => {
    if (!open) return
    setOnglet('fiche')
    setConfirmDeactivate(false)
    setSalaireTexte(member?.salary_gross_cts != null ? (member.salary_gross_cts / 100).toFixed(2).replace('.', ',') : '')
    setForm(member ? {
      full_name: member.full_name,
      role: member.role ?? undefined,
      role_label: member.role_label ?? '',
      idcc: member.idcc,
      coefficient: member.coefficient ?? undefined,
      contract_type: member.contract_type,
      salary_gross_cts: member.salary_gross_cts,
      start_date: member.start_date ?? '',
      end_date: member.end_date ?? '',
      phone: member.phone ?? '',
      email: member.email ?? '',
      adresse: member.adresse ?? '',
      contact_urgence_nom: member.contact_urgence_nom ?? '',
      contact_urgence_tel: member.contact_urgence_tel ?? '',
      license_type: member.license_type ?? '',
      licence_b_expiry: member.licence_b_expiry ?? '',
      medical_visit_expiry: member.medical_visit_expiry ?? '',
      active: member.active,
      company_id: member.company_id,
    } : { active: true, idcc: '16', company_id: companyId ?? '' })
  }, [open, member, companyId])

  useEffect(() => {
    if (onglet !== 'activite' || !member) return
    setLoadingHistory(true)
    getMemberRecentDeliveries(member.id).then(({ data }) => {
      setDeliveries(data ?? [])
      setLoadingHistory(false)
    })
  }, [onglet, member])

  const set = (k: keyof TeamMemberInsert, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  const texte = (k: keyof TeamMemberInsert) => (form[k] as string | null | undefined) ?? ''

  const handleSave = async () => {
    if (!form.full_name?.trim()) { toast('Le nom est requis', 'error'); return }
    setSaving(true)
    // Champs optionnels : '' → null (dates : erreur de type Postgres sinon).
    const vide = (v: string | null | undefined): string | null => (v && v.trim() !== '' ? v : null)
    const payload = {
      ...form,
      start_date:           form.start_date           || null,
      end_date:             form.end_date             || null,
      licence_b_expiry:     form.licence_b_expiry     || null,
      medical_visit_expiry: form.medical_visit_expiry || null,
      adresse:              vide(form.adresse),
      contact_urgence_nom:  vide(form.contact_urgence_nom),
      contact_urgence_tel:  vide(form.contact_urgence_tel),
    }
    try {
      if (isEdit && member) {
        const { error } = await updateTeamMember(member.id, payload)
        if (error) throw error
        toast('Membre mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createTeamMember({ ...payload, company_id: companyId } as TeamMemberInsert)
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

  // Accès au site relié : on le coupe aussi — sauf son propre compte (refusé par
  // le serveur) et hors président (seul à pouvoir le faire).
  const accesRelie = !!member?.profile_id
  const accesEstMoi = accesRelie && member?.profile_id === profile?.id
  const peutCouperAcces = accesRelie && !accesEstMoi && isPresident

  const handleDeactivate = () => {
    if (!member) return
    setDateFin(toLocalISO(new Date()))
    setConfirmDeactivate(true)
  }

  const doDeactivate = async () => {
    if (!member) return
    const refus = erreurDateFin(dateFin, member.start_date)
    if (refus) { toast(refus, 'error'); return }
    setDeactivating(true)
    if (peutCouperAcces && member.profile_id) {
      const r = await changerActif(member.profile_id, false)
      if (!r.ok) {
        setDeactivating(false)
        toast(`Accès au site non coupé, membre non désactivé : ${libelleErreurAcces(r.error, r.detail, r.message)}`, 'error')
        return
      }
    }
    const { error } = await deactivateTeamMember(member.id, dateFin)
    setDeactivating(false)
    if (error) {
      toast(peutCouperAcces
        ? `Accès au site coupé, mais fiche non désactivée : ${error.message}`
        : error.message, 'error')
      return
    }
    setConfirmDeactivate(false)
    toast(peutCouperAcces
      ? `${member.full_name} désactivé (fin le ${dateFr(dateFin)}) et accès au site coupé`
      : `${member.full_name} désactivé (fin le ${dateFr(dateFin)})`)
    onSaved(); onClose()
  }

  const apte = member && isDriverRole(member.role) ? aptitude({ ...member, ...(form as Partial<TeamMember>) } as TeamMember) : null
  const echeances = member || conduit ? memberEcheances({ ...(member ?? {}), ...(form as Partial<TeamMember>) } as TeamMember) : []
  const permis = echeances[0]
  const visite = echeances[1]

  return (
    <Drawer open={open} onClose={onClose} width="max-w-[40rem]" title={isEdit ? 'Fiche du membre' : 'Nouveau membre'}>
      <div className="flex flex-col gap-4 min-h-full">
        {/* En-tête : qui est-ce, en un coup d'œil */}
        {isEdit && member && (
          <header className="flex items-start gap-3">
            <AvatarInitiales nom={member.full_name} taille="lg" discret={!member.active} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display font-semibold text-lg leading-tight text-[var(--text)] truncate">{member.full_name}</h3>
              <p className="text-sm text-[var(--text-muted)] truncate">
                {(member.role_label || (member.role ? ROLE_LABELS[member.role] : '')) || 'Poste non précisé'}
              </p>
              <ContactLinks phone={member.phone} email={member.email} iconSize={13} className="mt-1 text-sm" />
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge color={member.active ? 'success' : 'muted'}>{member.active ? 'Actif' : 'Inactif'}</Badge>
              {member.contract_type && <Badge color="info">{getContractLabel(member.contract_type)}</Badge>}
              {apte && <Badge color={apte === 'apte' ? 'success' : apte === 'a_completer' ? 'warning' : 'danger'}>
                {apte === 'apte' ? 'Apte' : apte === 'a_completer' ? 'À compléter' : 'À régulariser'}
              </Badge>}
            </div>
          </header>
        )}

        {/* Onglets */}
        {isEdit && (
          <div role="tablist" className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-card)] p-1 overflow-x-auto">
            {ONGLETS.map(({ cle, libelle, icone: Icone }) => (
              <button key={cle} role="tab" aria-selected={onglet === cle} onClick={() => setOnglet(cle)}
                className={`flex-1 shrink-0 whitespace-nowrap h-9 px-3 rounded-full text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors
                  ${onglet === cle ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]'}`}>
                <Icone size={14} /> {libelle}
              </button>
            ))}
          </div>
        )}

        {/* ── Fiche ── */}
        {(!isEdit || onglet === 'fiche') && (
          <>
            <Bloc titre="Identité">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Champ label="Nom complet" requis>
                    <input value={texte('full_name')} onChange={e => set('full_name', e.target.value)} className="field" placeholder="Prénom Nom" />
                  </Champ>
                </div>
                <Champ label="Téléphone">
                  <input type="tel" value={texte('phone')} onChange={e => set('phone', e.target.value)} className="field" placeholder="06 12 34 56 78" />
                </Champ>
                <Champ label="E-mail">
                  <input type="email" value={texte('email')} onChange={e => set('email', e.target.value)} className="field" placeholder="prenom@exemple.fr" />
                </Champ>
                <div className="sm:col-span-2">
                  <Champ label="Adresse">
                    <input value={texte('adresse')} onChange={e => set('adresse', e.target.value)} className="field" placeholder="Numéro, rue, code postal, ville" />
                  </Champ>
                </div>
                <Champ label="Contact d'urgence — nom">
                  <input value={texte('contact_urgence_nom')} onChange={e => set('contact_urgence_nom', e.target.value)} className="field" placeholder="ex. Marie Dupont (conjointe)" />
                </Champ>
                <Champ label="Contact d'urgence — téléphone">
                  <input type="tel" value={texte('contact_urgence_tel')} onChange={e => set('contact_urgence_tel', e.target.value)} className="field" />
                </Champ>
              </div>
            </Bloc>

            <Bloc titre="Poste et contrat">
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Rôle dans le site">
                  <ListeDeroulante valeur={form.role ?? ''} onChange={v => set('role', v || null)} ariaLabel="Rôle" recherche={false} placeholder="Choisir un rôle"
                    options={(Object.entries(ROLE_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))} />
                </Champ>
                <Champ label="Fonction affichée">
                  <input value={texte('role_label')} onChange={e => set('role_label', e.target.value)} className="field" placeholder="ex. Chauffeur-livreur" />
                </Champ>
                <Champ label="Type de contrat">
                  <ListeDeroulante valeur={form.contract_type ?? ''} onChange={v => set('contract_type', v || null)} ariaLabel="Type de contrat" recherche={false} placeholder="Choisir un contrat"
                    options={(Object.entries(CONTRACT_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))} />
                </Champ>
                <Champ label="Salaire brut / mois (€)">
                  <input type="text" inputMode="decimal" value={salaireTexte} className="field font-mono" placeholder="2 500,00"
                    onChange={e => { setSalaireTexte(e.target.value); set('salary_gross_cts', salaireSaisiCts(e.target.value)) }} />
                </Champ>
                <Champ label="Date d'entrée">
                  <input type="date" value={texte('start_date')} onChange={e => set('start_date', e.target.value || null)} className="field" />
                </Champ>
                <Champ label={form.contract_type === 'cdd' || form.contract_type === 'interim' ? 'Fin de contrat' : 'Date de sortie (si départ)'}>
                  <input type="date" value={texte('end_date')} onChange={e => set('end_date', e.target.value || null)} className="field" />
                </Champ>
                <Champ label="Coefficient (convention collective)">
                  <input type="number" value={form.coefficient ?? ''} onChange={e => set('coefficient', parseInt(e.target.value) || null)} className="field" placeholder="ex. 128" />
                </Champ>
                <p className="self-end pb-2 text-xs text-[var(--text-muted)]">Transports routiers · IDCC 16</p>
              </div>
            </Bloc>

            {conduit && (
              <Bloc titre="Conduite et validités" droite={apte ? <span className="text-xs text-[var(--text-muted)]">Apte = permis et visite à jour</span> : undefined}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Champ label="Catégories de permis">
                    <input value={texte('license_type')} onChange={e => set('license_type', e.target.value)} className="field" placeholder="B, C…" />
                  </Champ>
                  <span aria-hidden="true" className="hidden sm:block" />
                  <Champ label="Permis B — date d'expiration">
                    <input type="date" value={texte('licence_b_expiry')} onChange={e => set('licence_b_expiry', e.target.value || null)} className="field" />
                    {permis && <VoyantValidite status={permis.status} daysLeft={permis.daysLeft} />}
                  </Champ>
                  <Champ label="Prochaine visite médicale">
                    <input type="date" value={texte('medical_visit_expiry')} onChange={e => set('medical_visit_expiry', e.target.value || null)} className="field" />
                    {visite && <VoyantValidite status={visite.status} daysLeft={visite.daysLeft} />}
                  </Champ>
                </div>
              </Bloc>
            )}

            {confirmDeactivate && member && (
              <div className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-4">
                <p className="text-sm font-semibold text-[var(--text)]">Désactiver {member.full_name} ?</p>
                <Champ label="Date de fin (sortie)">
                  <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="field" />
                </Champ>
                <p className="text-sm text-[var(--text-muted)]">
                  La fiche sera masquée de l’équipe active (son historique reste).
                  {peutCouperAcces && ' Son accès au site sera aussi coupé : il ne pourra plus se connecter.'}
                  {accesEstMoi && ' La fiche est reliée à ton compte : ton accès au site n’est pas coupé.'}
                  {accesRelie && !accesEstMoi && !isPresident && ' Attention : son accès au site reste ouvert ; seul le président peut le couper (Accès au site).'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={doDeactivate} disabled={deactivating} className="!bg-[var(--danger)] hover:!bg-[var(--danger)]/90">
                    {deactivating ? '…' : peutCouperAcces ? 'Désactiver et couper l’accès' : 'Désactiver'}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmDeactivate(false)} disabled={deactivating}>Annuler</Button>
                </div>
              </div>
            )}

            {!confirmDeactivate && (
              <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 flex items-center gap-2">
                <Button variant="primary" className="min-h-10" onClick={handleSave} disabled={saving}>
                  {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter le membre'}
                </Button>
                <Button variant="secondary" className="min-h-10" onClick={onClose}>Annuler</Button>
                {isEdit && member?.active && (
                  <Button variant="ghost" onClick={handleDeactivate} className="ml-auto text-[var(--danger)]"><Trash2 size={14} /> Désactiver</Button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Activité ── */}
        {isEdit && onglet === 'activite' && (
          <Bloc titre="Dernières livraisons">
            {loadingHistory ? (
              <p className="text-[var(--text-muted)] text-sm">Chargement…</p>
            ) : deliveries.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm py-6 text-center">Aucune livraison récente</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)] -my-1">
                {deliveries.map(d => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-14 shrink-0 font-mono text-xs text-[var(--text-muted)]">{d.date ? dateFr(d.date).slice(0, 5) : '—'}</span>
                    <span className="flex-1 min-w-0 truncate text-[var(--text)]">{d.delivery_address ?? 'Adresse non renseignée'}</span>
                    {d.statut && <Badge color={d.statut === 'annulee' ? 'danger' : d.statut === 'payee' || d.statut === 'facturee' ? 'success' : 'muted'}>{libelleStatutLivraison(d.statut)}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Bloc>
        )}

        {/* ── Accès au site ── */}
        {isEdit && onglet === 'acces' && member && (
          <AccesSite member={member} onChanged={() => { onSaved(); onClose() }} />
        )}
      </div>
    </Drawer>
  )
}
