import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, ShieldCheck, Users, UserCheck, UserX, ChevronRight, ChevronDown, KeyRound } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { EmptyState } from '../../shared/ui/EmptyState'
import { useProfile } from '../../app/providers'
import { useToast } from '../../shared/ui/useToast'
import { appelPermissions, supprimerCompte } from '../../shared/lib/adminUsers.queries'
import { libelleErreurAdmin } from '../../shared/lib/adminUsers'
import { DrawerAdminPermissions } from './DrawerAdminPermissions'
import { DrawerAjoutAdmin } from './DrawerAjoutAdmin'
import { separerComptes, filtrerComptes, filtresActifs, FILTRES_VIDES } from './admins.logic'
import type { AdminMember } from './admins.types'
import { ROLE_LABELS, ROLE_OPTIONS } from './admins.types'

export function Admins() {
  const { profile } = useProfile()
  const { toast } = useToast()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AdminMember | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ajoutOpen, setAjoutOpen] = useState(false)
  const [filtres, setFiltres] = useState(FILTRES_VIDES)
  const [salariesOuverts, setSalariesOuverts] = useState(false)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dejaCharge = useRef(false)

  // Rechargement silencieux : la liste ne repasse pas en squelette après un geste.
  const loadMembers = useCallback(async () => {
    if (!dejaCharge.current) setLoading(true)
    const r = await appelPermissions<{ members: AdminMember[] }>({ action: 'list_members' })
    if (r.ok && Array.isArray(r.members)) { setMembers(r.members); dejaCharge.current = true }
    else if (!r.ok) toast(libelleErreurAdmin(r), 'error')
    setLoading(false)
  }, [toast])

  useEffect(() => { void loadMembers() }, [loadMembers])

  const { bureau, salaries } = useMemo(() => separerComptes(members), [members])
  const visibles = useMemo(() => filtrerComptes(bureau, filtres, r => ROLE_LABELS[r]), [bureau, filtres])
  const actifs = bureau.filter(m => m.active !== false).length
  const coupes = bureau.length - actifs

  function openDrawer(member: AdminMember) {
    if (member.role === 'president') return
    if (clearTimer.current) clearTimeout(clearTimer.current)
    setSelected(member)
    setDrawerOpen(true)
  }

  function handleDrawerClose() {
    setDrawerOpen(false)
    // Garde le membre sélectionné visible jusqu'à l'animation de fermeture
    clearTimer.current = setTimeout(() => setSelected(null), 200)
  }

  /** Modification locale immédiate (rôle, accès coupé) : la liste suit sans attendre le serveur. */
  function patchMember(id: string, patch: Partial<AdminMember>) {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m))
    setSelected(s => s && s.id === id ? { ...s, ...patch } : s)
  }

  /** Suppression optimiste : le compte disparaît tout de suite ; en cas d'échec il revient avec un message. */
  async function supprimer(member: AdminMember) {
    setMembers(ms => ms.filter(m => m.id !== member.id))
    handleDrawerClose()
    const r = await supprimerCompte(member.id)
    if (!r.ok) {
      setMembers(ms => ms.some(m => m.id === member.id) ? ms : [...ms, member])
      toast(libelleErreurAdmin(r), 'error')
    } else {
      toast(`Compte de ${member.full_name} supprimé`)
    }
  }

  const reinitialiser = () => setFiltres(FILTRES_VIDES)

  return (
    <Shell pageTitle="Administrateurs">
      <div className="flex flex-col gap-5 w-full min-w-0">

        {/* Tuiles : un clic filtre la liste */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ChiffreCarte libelle="Comptes du bureau" icone={<Users size={13} />} valeur={String(bureau.length)} detail="avec accès au site" titre="Tous les comptes du bureau"
            actif={!filtresActifs(filtres)} onClick={reinitialiser} />
          <ChiffreCarte libelle="Actifs" icone={<UserCheck size={13} />} valeur={String(actifs)} detail="peuvent se connecter" titre="Comptes actifs uniquement"
            actif={filtres.statut === 'actifs'} onClick={() => setFiltres(f => ({ ...f, statut: f.statut === 'actifs' ? '' : 'actifs' }))} />
          <ChiffreCarte libelle="Coupés" icone={<UserX size={13} />} valeur={String(coupes)} ton={coupes > 0 ? 'warning' : undefined} detail="accès désactivé" titre="Voir les comptes coupés"
            actif={filtres.statut === 'coupes'} onClick={() => setFiltres(f => ({ ...f, statut: f.statut === 'coupes' ? '' : 'coupes' }))} />
          <ChiffreCarte libelle="Salariés" icone={<KeyRound size={13} />} valeur={String(salaries.length)} detail="comptes cloisonnés" titre="Voir les comptes salariés"
            actif={salariesOuverts} onClick={() => setSalariesOuverts(o => !o)} />
        </div>

        {/* Recherche + filtres */}
        <div className="flex flex-wrap items-center gap-2.5">
          <BarreRecherche value={filtres.q} onChange={q => setFiltres(f => ({ ...f, q }))} placeholder="Chercher un compte : nom, e-mail, rôle…"
            ariaLabel="Rechercher un compte" compteur={filtresActifs(filtres) ? `${visibles.length} / ${bureau.length}` : undefined} className="flex-1 min-w-[14rem] max-w-md" />
          <div className="w-48">
            <ListeDeroulante ariaLabel="Filtrer par rôle" valeur={filtres.role} onChange={role => setFiltres(f => ({ ...f, role }))} placeholder="Tous les rôles"
              options={[{ valeur: '', libelle: 'Tous les rôles' }, { valeur: 'president', libelle: ROLE_LABELS.president }, ...ROLE_OPTIONS.map(o => ({ valeur: o.value, libelle: o.label }))]} />
          </div>
          <PastilleFiltre actif={filtres.statut === 'actifs'} onClick={() => setFiltres(f => ({ ...f, statut: f.statut === 'actifs' ? '' : 'actifs' }))}>Actifs uniquement</PastilleFiltre>
          {filtresActifs(filtres) && (
            <button type="button" onClick={reinitialiser} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline">Tout réinitialiser</button>
          )}
          <Button variant="primary" onClick={() => setAjoutOpen(true)} className="ml-auto shrink-0">
            <UserPlus size={14} />
            Ajouter un compte
          </Button>
        </div>

        {/* Liste des comptes du bureau */}
        {loading ? (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : visibles.length === 0 ? (
          <EmptyState title={bureau.length === 0 ? 'Aucun compte' : 'Aucun compte ne correspond'}
            description={bureau.length === 0 ? "Ajoute un compte pour donner accès au site." : 'Change la recherche ou les filtres.'} />
        ) : (
          <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {visibles.map((member, idx) => {
              const isPresident = member.role === 'president'
              const isCurrentUser = member.id === profile?.id
              const coupe = member.active === false
              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={isPresident}
                  onClick={() => openDrawer(member)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left
                    ${idx < visibles.length - 1 ? 'border-b border-[var(--border)]' : ''}
                    ${isPresident ? 'cursor-default' : 'hover:bg-[var(--bg-elevated)] transition-colors'}
                    ${selected?.id === member.id && drawerOpen ? 'bg-[var(--brand)]/5' : ''}`}
                >
                  <AvatarInitiales nom={member.full_name} discret={coupe} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${coupe ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>{member.full_name}</p>
                      {isCurrentUser && <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-[var(--brand)]/10 text-[var(--brand)] font-medium">Vous</span>}
                    </div>
                    {member.email && <p className="text-xs text-[var(--text-muted)] truncate">{member.email}</p>}
                  </div>
                  {coupe && <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-[var(--warning)]/12 text-[var(--warning)] font-medium">Accès coupé</span>}
                  {isPresident ? (
                    <span className="shrink-0 flex items-center gap-1.5 text-xs text-[var(--brand)] font-medium">
                      <ShieldCheck size={14} /> Accès total
                    </span>
                  ) : (
                    <>
                      <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-[var(--text-disabled)]" />
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Comptes salariés : lecture seule, gérés depuis la fiche Équipe */}
        {!loading && salaries.length > 0 && (
          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <button type="button" onClick={() => setSalariesOuverts(o => !o)} aria-expanded={salariesOuverts}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-elevated)] transition-colors">
              {salariesOuverts ? <ChevronDown size={16} className="text-[var(--text-muted)]" /> : <ChevronRight size={16} className="text-[var(--text-muted)]" />}
              <span className="text-sm font-semibold text-[var(--text)]">Comptes salariés ({salaries.length})</span>
              <span className="text-xs text-[var(--text-muted)] ml-1 truncate">Ils ne voient que Mes courses. Se gèrent dans Équipe.</span>
            </button>
            {salariesOuverts && (
              <div className="border-t border-[var(--border)]">
                {salaries.map((s, i) => (
                  <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < salaries.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                    <AvatarInitiales nom={s.full_name} taille="sm" discret={s.active === false} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)] truncate">{s.full_name}</p>
                      {s.email && <p className="text-xs text-[var(--text-muted)] truncate">{s.email}</p>}
                    </div>
                    {s.active === false && <span className="shrink-0 text-xs text-[var(--warning)]">Accès coupé</span>}
                  </div>
                ))}
                <div className="px-4 py-2.5 border-t border-[var(--border)]">
                  <Link to="/equipe-hub?tab=membres" className="text-xs text-[var(--brand)] hover:underline">
                    Gérer l'accès d'un salarié : Équipe › fiche du membre › Accès
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <DrawerAdminPermissions
        member={selected}
        currentUserId={profile?.id ?? ''}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onPatch={patchMember}
        onSupprimer={supprimer}
        onMemberUpdated={loadMembers}
      />

      <DrawerAjoutAdmin
        open={ajoutOpen}
        onClose={() => setAjoutOpen(false)}
        onSuccess={loadMembers}
      />
    </Shell>
  )
}
