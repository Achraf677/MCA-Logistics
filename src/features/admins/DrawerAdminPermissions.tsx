import { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, Wand2 } from 'lucide-react'
import { useToast } from '../../shared/ui/useToast'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { Bloc } from '../../shared/ui/FicheSaisie'
import { PERMISSION_CATALOG, CATALOG_SECTIONS, CATALOG_BY_SECTION } from '../../shared/permissions/catalog'
import type { AdminMember, ResourcePermission, AdminRole } from './admins.types'
import { ROLE_LABELS } from './admins.types'
import { optionsRole, PROFILS_DROITS, grilleDuProfil, nbEcransVisibles } from './admins.logic'
import type { ProfilDroits } from './admins.logic'
import { libelleErreurAdmin } from '../../shared/lib/adminUsers'
import {
  appelPermissions, changerRole, changerActif, definirMotDePasse, envoyerLienReinit,
} from '../../shared/lib/adminUsers.queries'

interface Props {
  member: AdminMember | null
  currentUserId: string
  open: boolean
  onClose: () => void
  /** Modification locale immédiate de la liste (rôle, accès coupé). */
  onPatch: (id: string, patch: Partial<AdminMember>) => void
  /** Suppression optimiste, portée par la liste. */
  onSupprimer: (member: AdminMember) => void
  /** Rechargement silencieux de la liste. */
  onMemberUpdated: () => void
}

type PermMap = Record<string, ResourcePermission>

function emptyPermMap(): PermMap {
  return Object.fromEntries(
    PERMISSION_CATALOG.map(r => [
      r.key,
      { resource: r.key, voir: false, creer: false, modifier: false, supprimer: false },
    ]),
  )
}

function mergePermissions(existing: ResourcePermission[]): PermMap {
  const map = emptyPermMap()
  for (const p of existing) {
    if (map[p.resource]) map[p.resource] = { ...map[p.resource], ...p }
  }
  return map
}

const CASES = ['voir', 'creer', 'modifier', 'supprimer'] as const
const LIBELLE_CASE: Record<(typeof CASES)[number], string> = { voir: 'Voir', creer: 'Créer', modifier: 'Modifier', supprimer: 'Supprimer' }

export function DrawerAdminPermissions({ member, currentUserId, open, onClose, onPatch, onSupprimer, onMemberUpdated }: Props) {
  const { toast } = useToast()
  const [permLoading, setPermLoading] = useState(false)
  const [permMap, setPermMap] = useState<PermMap>(emptyPermMap)
  const [permInitiale, setPermInitiale] = useState<PermMap>(emptyPermMap)
  const [saving, setSaving] = useState(false)
  const [roleValue, setRoleValue] = useState<AdminRole>('dg')
  const [activeValue, setActiveValue] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwdLoading, setPwdLoading]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [pwdDefini, setPwdDefini]     = useState(false)
  const [profilEnAttente, setProfilEnAttente] = useState<ProfilDroits | null>(null)

  const isSelf = member?.id === currentUserId
  const dirty = useMemo(() => JSON.stringify(permMap) !== JSON.stringify(permInitiale), [permMap, permInitiale])

  useEffect(() => {
    if (!open || !member) return
    setPermMap(emptyPermMap())
    setPermInitiale(emptyPermMap())
    setRoleValue(member.role as AdminRole)
    setActiveValue(member.active ?? true)
    // Remise à zéro à chaque ouverture : sans ça, un mot de passe à moitié saisi suivrait d'un compte à l'autre.
    setNewPassword('')
    setPwdDefini(false)
    setProfilEnAttente(null)
    setPermLoading(true)
    appelPermissions<{ permissions: ResourcePermission[] }>({ action: 'get', user_id: member.id })
      .then(r => {
        if (r.ok && Array.isArray(r.permissions)) { const m = mergePermissions(r.permissions); setPermMap(m); setPermInitiale(m) }
        else if (!r.ok) toast(libelleErreurAdmin(r), 'error')
      })
      .finally(() => setPermLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id])

  function togglePerm(key: string, field: keyof Omit<ResourcePermission, 'resource'>, value: boolean) {
    setPermMap(prev => {
      const current = prev[key]
      if (field === 'voir' && !value) {
        return { ...prev, [key]: { ...current, voir: false, creer: false, modifier: false, supprimer: false } }
      }
      return { ...prev, [key]: { ...current, [field]: value } }
    })
  }

  function sectionToggleVoir(section: string, value: boolean) {
    const resources = CATALOG_BY_SECTION[section] ?? []
    setPermMap(prev => {
      const next = { ...prev }
      for (const r of resources) {
        next[r.key] = value
          ? { ...next[r.key], voir: true }
          : { ...next[r.key], voir: false, creer: false, modifier: false, supprimer: false }
      }
      return next
    })
  }

  /** Un profil pré-coche la grille ; rien n'est enregistré avant « Enregistrer les droits ». */
  function appliquerProfil(profil: ProfilDroits) {
    setProfilEnAttente(null)
    setPermMap(grilleDuProfil(profil))
  }

  async function handleSavePermissions() {
    if (!member) return
    setSaving(true)
    const permissions = PERMISSION_CATALOG.map(r => permMap[r.key])
    const r = await appelPermissions({ action: 'set_bulk', user_id: member.id, permissions })
    setSaving(false)
    if (!r.ok) toast(libelleErreurAdmin(r), 'error')
    else { toast('Droits enregistrés'); setPermInitiale(permMap) }
  }

  /** Changement de rôle optimiste : la liste suit tout de suite, retour en arrière si le serveur refuse. */
  async function changerLeRole(role: AdminRole) {
    if (!member || isSelf || role === roleValue) return
    const avant = roleValue
    setRoleValue(role)
    onPatch(member.id, { role })
    const r = await changerRole(member.id, role)
    if (!r.ok) {
      setRoleValue(avant)
      onPatch(member.id, { role: avant })
      toast(libelleErreurAdmin(r), 'error')
    } else {
      toast('Rôle mis à jour')
      onMemberUpdated()
    }
  }

  async function handleSetActive(active: boolean) {
    if (!member || isSelf) return
    setActiveValue(active)
    onPatch(member.id, { active })
    const r = await changerActif(member.id, active)
    if (!r.ok) {
      setActiveValue(!active)
      onPatch(member.id, { active: !active })
      toast(libelleErreurAdmin(r), 'error')
    } else {
      toast(active ? 'Accès rétabli' : 'Accès coupé : la personne ne peut plus se connecter')
      onMemberUpdated()
    }
  }

  /** L'admin fixe le mot de passe : marche même sans SMTP configuré. */
  async function handleSetPassword() {
    if (!member || isSelf) return
    const pwd = newPassword.trim()
    if (pwd.length < 8) { toast('8 caractères minimum', 'error'); return }
    setPwdLoading(true)
    const r = await definirMotDePasse(member.id, pwd)
    setPwdLoading(false)
    if (!r.ok) { toast(libelleErreurAdmin(r), 'error'); return }
    // On vide le champ : laisser le mot de passe à l'écran après coup n'apporte rien.
    setNewPassword('')
    setPwdDefini(true)
    toast('Mot de passe mis à jour')
  }

  /** Lien de réinitialisation par e-mail : personne ne connaît le mot de passe. */
  async function handleSendReset() {
    if (!member || isSelf) return
    setResetLoading(true)
    const r = await envoyerLienReinit(member.id)
    setResetLoading(false)
    if (!r.ok) { toast(libelleErreurAdmin(r), 'error'); return }
    toast(`Lien envoyé à ${r.email ?? member.email ?? 'la personne'}`)
  }

  if (!member) return null
  const coupe = !activeValue

  return (
    <>
      <Drawer open={open} onClose={onClose} title={member.full_name} width="max-w-2xl">
        <div className="flex flex-col gap-4 min-h-full">
          {/* En-tête du compte */}
          <div className="flex items-center gap-3">
            <AvatarInitiales nom={member.full_name} taille="lg" discret={coupe} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] truncate">{member.full_name}</p>
              {member.email && <p className="text-xs text-[var(--text-muted)] truncate">{member.email}</p>}
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)]">
              {ROLE_LABELS[roleValue] ?? roleValue}
            </span>
            {coupe && <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-[var(--warning)]/12 text-[var(--warning)] font-medium">Accès coupé</span>}
            {isSelf && <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-[var(--brand)]/10 text-[var(--brand)] font-medium">Vous</span>}
          </div>

          {/* Droits */}
          <Bloc titre="Droits" icone={<ShieldCheck size={15} />}
            droite={<span className="text-xs text-[var(--text-muted)]">{nbEcransVisibles(permMap)} écran{nbEcransVisibles(permMap) > 1 ? 's' : ''} sur {PERMISSION_CATALOG.length}</span>}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="sm:w-64">
                <ListeDeroulante ariaLabel="Appliquer un profil de droits" valeur="" placeholder="Appliquer un profil…" recherche={false}
                  onChange={v => { if (v) { if (dirty) setProfilEnAttente(v as ProfilDroits); else appliquerProfil(v as ProfilDroits) } }}
                  options={PROFILS_DROITS.map(p => ({ valeur: p.valeur, libelle: p.libelle, detail: p.detail }))} />
              </div>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Wand2 size={12} /> Un profil pré-coche la grille ; tu ajustes puis tu enregistres.</p>
            </div>

            {permLoading ? (
              <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
            ) : (
              <div className="flex flex-col gap-4">
                {CATALOG_SECTIONS.map(section => {
                  const resources = CATALOG_BY_SECTION[section] ?? []
                  return (
                    <div key={section} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text)]">{section}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <button type="button" onClick={() => sectionToggleVoir(section, true)} className="text-[var(--brand)] hover:underline">Tout voir</button>
                          <span className="text-[var(--text-muted)]">·</span>
                          <button type="button" onClick={() => sectionToggleVoir(section, false)} className="text-[var(--text-muted)] hover:text-[var(--text)] hover:underline">Tout décocher</button>
                        </div>
                      </div>
                      <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                        <div className="hidden sm:grid grid-cols-[1fr_repeat(4,5rem)] px-3 py-1.5 bg-[var(--bg-card)] border-b border-[var(--border)]">
                          <span />
                          {CASES.map(c => <span key={c} className="text-center text-xs text-[var(--text-muted)] font-medium">{LIBELLE_CASE[c]}</span>)}
                        </div>
                        {resources.map((r, idx) => {
                          const p = permMap[r.key]
                          const voirOff = !p?.voir
                          return (
                            <div key={r.key}
                              className={`grid grid-cols-4 sm:grid-cols-[1fr_repeat(4,5rem)] items-center gap-y-1.5 px-3 py-2
                                ${idx < resources.length - 1 ? 'border-b border-[var(--border)]' : ''} ${voirOff ? 'opacity-60' : ''}`}>
                              <span className="col-span-4 sm:col-span-1 text-sm text-[var(--text)]">{r.label}</span>
                              {CASES.map(c => (
                                <label key={c} className="flex flex-col sm:flex-row items-center justify-center gap-0.5 text-xs text-[var(--text-muted)]">
                                  <span className="sm:hidden">{LIBELLE_CASE[c]}</span>
                                  <input type="checkbox" checked={p?.[c] ?? false} disabled={c !== 'voir' && voirOff}
                                    aria-label={`${r.label} : ${LIBELLE_CASE[c]}`}
                                    onChange={e => togglePerm(r.key, c, e.target.checked)}
                                    className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed" />
                                </label>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Bloc>

          {/* Compte */}
          <Bloc titre="Compte">
            {isSelf ? (
              <p className="text-sm text-[var(--text-muted)]">Tu ne peux pas modifier ton propre compte depuis cet écran.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-[var(--text)]">Rôle</p>
                  <div className="w-52">
                    <ListeDeroulante ariaLabel="Rôle du compte" valeur={roleValue} recherche={false} onChange={v => void changerLeRole(v as AdminRole)}
                      options={optionsRole(member.role, ROLE_LABELS).map(o => ({ valeur: o.value, libelle: o.label }))} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Compte actif</p>
                    <p className="text-xs text-[var(--text-muted)]">Coupé, le compte ne peut plus se connecter (sa session en cours est fermée).</p>
                  </div>
                  <button role="switch" aria-checked={activeValue} aria-label="Compte actif" onClick={() => void handleSetActive(!activeValue)}
                    className={`relative shrink-0 w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${activeValue ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${activeValue ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Mot de passe</p>
                    <p className="text-xs text-[var(--text-muted)]">Définis-en un si la personne est devant toi, ou envoie-lui un lien si elle est à distance.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe (8 caractères min.)" autoComplete="off" aria-label="Nouveau mot de passe"
                      className="field field-sm flex-1 w-auto min-w-[14rem]" />
                    <Button variant="secondary" onClick={handleSetPassword} disabled={pwdLoading || newPassword.trim().length < 8}>
                      {pwdLoading ? 'Enregistrement…' : 'Définir'}
                    </Button>
                    <Button variant="ghost" onClick={handleSendReset} disabled={resetLoading}>
                      {resetLoading ? 'Envoi…' : 'Envoyer un lien'}
                    </Button>
                  </div>
                  {/* Le mot de passe défini n'est visible qu'ici, une fois : jamais relisible ensuite, même par le président. */}
                  {pwdDefini && <p className="text-xs text-[var(--success)]">Mot de passe enregistré : communique-le à la personne, il ne sera plus affiché.</p>}
                </div>
              </>
            )}
          </Bloc>

          {!isSelf && (
            <section className="rounded-[var(--r-lg)] border border-[var(--danger)]/40 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--danger)]">Supprimer le compte</p>
                <p className="text-xs text-[var(--text-muted)]">Action irréversible : supprime l'accès définitivement.</p>
              </div>
              <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-[var(--danger)] hover:bg-[var(--danger)]/10">Supprimer</Button>
            </section>
          )}

          {/* Barre d'actions fixe */}
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] flex-1">{dirty ? 'Droits modifiés, pas encore enregistrés.' : 'Aucune modification des droits.'}</span>
            <Button variant="secondary" className="min-h-10" onClick={() => setPermMap(permInitiale)} disabled={!dirty || saving}>Annuler</Button>
            <Button variant="primary" className="min-h-10" onClick={handleSavePermissions} disabled={saving || permLoading || !dirty}>
              {saving ? 'Enregistrement…' : 'Enregistrer les droits'}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={profilEnAttente !== null}
        title="Remplacer la grille ?"
        message="Des droits ont été modifiés sans être enregistrés. Appliquer le profil les remplace."
        confirmLabel="Appliquer le profil"
        onConfirm={() => { if (profilEnAttente) appliquerProfil(profilEnAttente) }}
        onCancel={() => setProfilEnAttente(null)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Supprimer ${member.full_name} ?`}
        message="Cette action est irréversible. Le compte sera définitivement supprimé et la personne ne pourra plus se connecter."
        confirmLabel="Supprimer définitivement"
        acknowledgeLabel="Je comprends que cette action est irréversible"
        onConfirm={() => { setDeleteOpen(false); onSupprimer(member) }}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  )
}
