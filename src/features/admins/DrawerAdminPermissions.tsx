import { useState, useEffect } from 'react'
import { useToast } from '../../shared/ui/useToast'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { PERMISSION_CATALOG, CATALOG_SECTIONS, CATALOG_BY_SECTION } from '../../shared/permissions/catalog'
import type { AdminMember, ResourcePermission, AdminRole } from './admins.types'
import { ROLE_LABELS } from './admins.types'
import { changementRoleSensible, optionsRole } from './admins.logic'
import { estCompteSalarie } from '../../shared/permissions/roles'
import { libelleErreurAdmin } from '../../shared/lib/adminUsers'
import {
  appelPermissions, changerRole, changerActif, definirMotDePasse, envoyerLienReinit, supprimerCompte,
} from '../../shared/lib/adminUsers.queries'

interface Props {
  member: AdminMember | null
  currentUserId: string
  open: boolean
  onClose: () => void
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

export function DrawerAdminPermissions({ member, currentUserId, open, onClose, onMemberUpdated }: Props) {
  const { toast } = useToast()
  const [permLoading, setPermLoading] = useState(false)
  const [permMap, setPermMap] = useState<PermMap>(emptyPermMap)
  const [saving, setSaving] = useState(false)
  const [roleValue, setRoleValue] = useState<AdminRole>('dg')
  const [activeValue, setActiveValue] = useState(true)
  const [roleLoading, setRoleLoading] = useState(false)
  const [activeLoading, setActiveLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwdLoading, setPwdLoading]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [pwdDefini, setPwdDefini]     = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [roleEnAttente, setRoleEnAttente] = useState<AdminRole | null>(null)

  const isSelf = member?.id === currentUserId
  const salarie = estCompteSalarie(member?.role)

  useEffect(() => {
    if (!open || !member) return
    setPermMap(emptyPermMap())
    setRoleValue(member.role as AdminRole)
    setActiveValue(member.active ?? true)
    // Remise à zéro à chaque ouverture : sans ça, le message de confirmation et
    // un mot de passe à moitié saisi suivraient d'un salarié à l'autre.
    setNewPassword('')
    setPwdDefini(false)
    setPermLoading(true)

    setRoleEnAttente(null)
    // Compte salarié : ses droits ne se règlent pas ici (cloisonné en base).
    if (estCompteSalarie(member.role)) { setPermLoading(false); return }
    appelPermissions<{ permissions: ResourcePermission[] }>({ action: 'get', user_id: member.id })
      .then(r => {
        if (r.ok && Array.isArray(r.permissions)) setPermMap(mergePermissions(r.permissions))
        else if (!r.ok) toast(libelleErreurAdmin(r), 'error')
      })
      .finally(() => setPermLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member])

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
        if (value) {
          next[r.key] = { ...next[r.key], voir: true }
        } else {
          next[r.key] = { ...next[r.key], voir: false, creer: false, modifier: false, supprimer: false }
        }
      }
      return next
    })
  }

  async function handleSavePermissions() {
    if (!member) return
    setSaving(true)
    const permissions = PERMISSION_CATALOG.map(r => permMap[r.key])
    const r = await appelPermissions({ action: 'set_bulk', user_id: member.id, permissions })
    setSaving(false)
    if (!r.ok) toast(libelleErreurAdmin(r), 'error')
    else toast('Permissions enregistrées')
  }

  /** Demande de changement de rôle : un compte salarié passe d'abord par une confirmation. */
  function demanderRole(role: AdminRole) {
    if (!member || isSelf || role === roleValue) return
    if (changementRoleSensible(member.role, role)) { setRoleEnAttente(role); return }
    void appliquerRole(role)
  }

  async function appliquerRole(role: AdminRole) {
    if (!member || isSelf) return
    setRoleEnAttente(null)
    setRoleValue(role)
    setRoleLoading(true)
    const r = await changerRole(member.id, role)
    setRoleLoading(false)
    if (!r.ok) {
      setRoleValue(member.role)
      toast(libelleErreurAdmin(r), 'error')
    } else {
      toast('Rôle mis à jour')
      onMemberUpdated()
    }
  }

  async function handleSetActive(active: boolean) {
    if (!member || isSelf) return
    setActiveValue(active)
    setActiveLoading(true)
    const r = await changerActif(member.id, active)
    setActiveLoading(false)
    if (!r.ok) {
      setActiveValue(!active)
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
    // On vide le champ : laisser le mot de passe à l'écran après coup n'apporte
    // rien et le fait traîner sur un poste partagé.
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

  async function handleDelete() {
    if (!member || isSelf) return
    setDeleteLoading(true)
    const r = await supprimerCompte(member.id)
    setDeleteLoading(false)
    setDeleteOpen(false)
    if (!r.ok) {
      toast(libelleErreurAdmin(r), 'error')
    } else {
      toast(`Compte de ${member.full_name} supprimé`)
      onMemberUpdated()
      onClose()
    }
  }

  if (!member) return null

  return (
    <>
      <Drawer open={open} onClose={onClose} title={member.full_name} width="max-w-2xl">
        <div className="flex flex-col gap-6">
          {/* Infos membre */}
          <div className="flex items-center gap-3 p-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]">
            <div className="flex-1 min-w-0">
              <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text)] truncate">{member.full_name}</p>
              {member.email && (
                <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)] truncate">{member.email}</p>
              )}
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded text-[length:var(--fs-xs)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
              {ROLE_LABELS[member.role] ?? member.role}
            </span>
            {isSelf && (
              <span className="shrink-0 px-2 py-0.5 rounded text-[length:var(--fs-xs)] bg-[var(--brand)]/10 text-[var(--brand)] font-medium">
                Vous
              </span>
            )}
          </div>

          {/* Matrice permissions — sans objet pour un compte salarié (cloisonné en base) */}
          {salarie ? (
            <div className="flex flex-col gap-1 p-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">Compte salarié</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Il ne voit que Mes courses, et uniquement ses propres données. Ses droits ne se
                règlent pas ici : son accès se gère depuis sa fiche Équipe › Accès au site.
              </p>
            </div>
          ) : (
          <div className="flex flex-col gap-4">
            <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">Permissions</h3>

            {permLoading ? (
              <div className="flex flex-col gap-2">
                {[0,1,2,3].map(i => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {CATALOG_SECTIONS.map(section => {
                  const resources = CATALOG_BY_SECTION[section] ?? []
                  return (
                    <div key={section} className="flex flex-col gap-1.5">
                      {/* En-tête section */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[length:var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                          {section}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => sectionToggleVoir(section, true)}
                            className="text-[length:var(--fs-xs)] text-[var(--brand)] hover:underline"
                          >
                            Tout voir
                          </button>
                          <span className="text-[var(--text-muted)] text-[length:var(--fs-xs)]">·</span>
                          <button
                            onClick={() => sectionToggleVoir(section, false)}
                            className="text-[length:var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
                          >
                            Tout décocher
                          </button>
                        </div>
                      </div>

                      {/* Tableau */}
                      <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                        {/* Colonnes header */}
                        <div className="hidden sm:grid grid-cols-[1fr_repeat(4,5rem)] gap-0 px-3 py-1.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                          <span />
                          {(['Voir', 'Créer', 'Modifier', 'Supprimer'] as const).map(col => (
                            <span key={col} className="text-center text-[length:var(--fs-xs)] text-[var(--text-muted)] font-medium">
                              {col}
                            </span>
                          ))}
                        </div>

                        {resources.map((r, idx) => {
                          const p = permMap[r.key]
                          const voirOff = !p?.voir
                          return (
                            <div
                              key={r.key}
                              className={`grid grid-cols-4 sm:grid-cols-[1fr_repeat(4,5rem)] items-center gap-y-1.5 px-3 py-2
                                ${idx < resources.length - 1 ? 'border-b border-[var(--border)]' : ''}
                                ${voirOff ? 'opacity-60' : ''}`}
                            >
                              <span className="col-span-4 sm:col-span-1 text-sm text-[var(--text)]">{r.label}</span>
                              {/* Voir */}
                              <label className="flex flex-col sm:flex-row items-center justify-center gap-0.5 text-xs text-[var(--text-muted)]">
                                <span className="sm:hidden">Voir</span>
                                <input
                                  type="checkbox"
                                  checked={p?.voir ?? false}
                                  onChange={e => togglePerm(r.key, 'voir', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer"
                                />
                              </label>
                              {/* Créer */}
                              <label className="flex flex-col sm:flex-row items-center justify-center gap-0.5 text-xs text-[var(--text-muted)]">
                                <span className="sm:hidden">Créer</span>
                                <input
                                  type="checkbox"
                                  checked={p?.creer ?? false}
                                  disabled={voirOff}
                                  onChange={e => togglePerm(r.key, 'creer', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </label>
                              {/* Modifier */}
                              <label className="flex flex-col sm:flex-row items-center justify-center gap-0.5 text-xs text-[var(--text-muted)]">
                                <span className="sm:hidden">Modifier</span>
                                <input
                                  type="checkbox"
                                  checked={p?.modifier ?? false}
                                  disabled={voirOff}
                                  onChange={e => togglePerm(r.key, 'modifier', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </label>
                              {/* Supprimer */}
                              <label className="flex flex-col sm:flex-row items-center justify-center gap-0.5 text-xs text-[var(--text-muted)]">
                                <span className="sm:hidden">Supprimer</span>
                                <input
                                  type="checkbox"
                                  checked={p?.supprimer ?? false}
                                  disabled={voirOff}
                                  onChange={e => togglePerm(r.key, 'supprimer', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="primary" onClick={handleSavePermissions} disabled={saving || permLoading}>
                {saving ? 'Enregistrement…' : 'Enregistrer les permissions'}
              </Button>
            </div>
          </div>
          )}

          {/* Actions compte */}
          <div className="flex flex-col gap-4 pt-2 border-t border-[var(--border)]">
            <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">Gestion du compte</h3>

            {isSelf ? (
              <p className="text-[length:var(--fs-sm)] text-[var(--text-muted)]">
                Vous ne pouvez pas modifier votre propre compte depuis cet écran.
              </p>
            ) : (
              <>
                {/* Rôle */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text)]">Rôle</p>
                  </div>
                  <select
                    value={roleValue}
                    disabled={roleLoading}
                    onChange={e => demanderRole(e.target.value as AdminRole)}
                    className="field field-sm w-auto"
                  >
                    {optionsRole(member.role, ROLE_LABELS).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Activer / Désactiver */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text)]">Compte actif</p>
                    <p className="text-xs text-[var(--text-muted)]">Coupé, le compte ne peut plus se connecter (sa session en cours est fermée)</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={activeValue}
                    disabled={activeLoading}
                    onClick={() => handleSetActive(!activeValue)}
                    className={`relative shrink-0 w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:opacity-50 disabled:cursor-not-allowed ${
                      activeValue ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        activeValue ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Mot de passe — deux chemins, cf. Edge admin-users */}
                <div className="flex flex-col gap-2 pt-1">
                  <div>
                    <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text)]">Mot de passe</p>
                    <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                      Définis-en un si la personne est devant toi, ou envoie-lui un lien si elle est à distance.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe (8 caractères min.)"
                      autoComplete="off"
                      className="field field-sm flex-1 w-auto min-w-[14rem]"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleSetPassword}
                      disabled={pwdLoading || newPassword.trim().length < 8}
                    >
                      {pwdLoading ? 'Enregistrement…' : 'Définir'}
                    </Button>
                    <Button variant="ghost" onClick={handleSendReset} disabled={resetLoading}>
                      {resetLoading ? 'Envoi…' : 'Envoyer un lien'}
                    </Button>
                  </div>

                  {/* Le mot de passe defini n'est visible qu'ici, une fois : il
                      n'est jamais relisible ensuite, meme par le president. */}
                  {pwdDefini && (
                    <p className="text-[length:var(--fs-xs)] text-[var(--success)]">
                      Mot de passe enregistré — communique-le à la personne, il ne sera plus affiché.
                    </p>
                  )}
                </div>

                {/* Supprimer */}
                <div className="flex items-center justify-between gap-4 pt-1">
                  <div>
                    <p className="text-[length:var(--fs-sm)] font-medium text-[var(--danger,#dc2626)]">Supprimer le compte</p>
                    <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Action irréversible — supprime l'accès définitivement</p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                    className="text-[var(--danger,#dc2626)] hover:bg-[var(--danger,#dc2626)]/10"
                  >
                    Supprimer
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={roleEnAttente !== null}
        title={`Changer le rôle de ${member.full_name} ?`}
        message={`C'est un compte salarié : il ne voit aujourd'hui que Mes courses et ses propres données. En « ${roleEnAttente ? ROLE_LABELS[roleEnAttente] : ''} », il ne sera plus cloisonné et verra le menu du bureau selon les droits que tu lui donneras.`}
        confirmLabel="Changer le rôle"
        acknowledgeLabel="Je comprends qu'il ne sera plus cloisonné"
        onConfirm={() => { if (roleEnAttente) void appliquerRole(roleEnAttente) }}
        onCancel={() => setRoleEnAttente(null)}
        loading={roleLoading}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Supprimer ${member.full_name} ?`}
        message="Cette action est irréversible. Le compte sera définitivement supprimé et la personne ne pourra plus se connecter."
        confirmLabel="Supprimer définitivement"
        acknowledgeLabel="Je comprends que cette action est irréversible"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        loading={deleteLoading}
      />
    </>
  )
}

