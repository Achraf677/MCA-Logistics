import { useState, useEffect } from 'react'
import { supabase } from '../../app/providers'
import { useToast } from '../../shared/ui/useToast'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { PERMISSION_CATALOG, CATALOG_SECTIONS, CATALOG_BY_SECTION } from '../../shared/permissions/catalog'
import type { AdminMember, ResourcePermission, AdminRole } from './admins.types'
import { ROLE_OPTIONS, ROLE_LABELS } from './admins.types'

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
  const [deleteLoading, setDeleteLoading] = useState(false)

  const isSelf = member?.id === currentUserId

  useEffect(() => {
    if (!open || !member) return
    setPermMap(emptyPermMap())
    setRoleValue(member.role as AdminRole)
    setActiveValue(member.active ?? true)
    setPermLoading(true)

    supabase.functions
      .invoke('admin-permissions', { body: { action: 'get', user_id: member.id } })
      .then(({ data }) => {
        if (data?.ok && Array.isArray(data.permissions)) {
          setPermMap(mergePermissions(data.permissions))
        }
      })
      .finally(() => setPermLoading(false))
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
    const { data, error } = await supabase.functions.invoke('admin-permissions', {
      body: { action: 'set_bulk', user_id: member.id, permissions },
    })
    setSaving(false)
    if (error || !data?.ok) {
      toast(error?.message ?? 'Erreur lors de la sauvegarde', 'error')
    } else {
      toast('Permissions enregistrées')
    }
  }

  async function handleSetRole(role: AdminRole) {
    if (!member || isSelf) return
    setRoleValue(role)
    setRoleLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'set_role', user_id: member.id, role },
    })
    setRoleLoading(false)
    if (error || !data?.ok) {
      setRoleValue(member.role)
      toast(error?.message ?? 'Erreur lors du changement de rôle', 'error')
    } else {
      toast('Rôle mis à jour')
      onMemberUpdated()
    }
  }

  async function handleSetActive(active: boolean) {
    if (!member || isSelf) return
    setActiveValue(active)
    setActiveLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'set_active', user_id: member.id, active },
    })
    setActiveLoading(false)
    if (error || !data?.ok) {
      setActiveValue(!active)
      toast(error?.message ?? "Erreur lors de la mise à jour", 'error')
    } else {
      toast(active ? 'Compte activé' : 'Compte désactivé')
      onMemberUpdated()
    }
  }

  async function handleDelete() {
    if (!member || isSelf) return
    setDeleteLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete', user_id: member.id },
    })
    setDeleteLoading(false)
    setDeleteOpen(false)
    if (error || !data?.ok) {
      toast(error?.message ?? 'Erreur lors de la suppression', 'error')
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
              <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{member.full_name}</p>
              {member.email && (
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{member.email}</p>
              )}
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
              {ROLE_LABELS[member.role] ?? member.role}
            </span>
            {isSelf && (
              <span className="shrink-0 px-2 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--brand)]/10 text-[var(--brand)] font-medium">
                Vous
              </span>
            )}
          </div>

          {/* Matrice permissions */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--text)]">Permissions</h3>

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
                        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                          {section}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => sectionToggleVoir(section, true)}
                            className="text-[var(--fs-xs)] text-[var(--brand)] hover:underline"
                          >
                            Tout voir
                          </button>
                          <span className="text-[var(--text-muted)] text-[var(--fs-xs)]">·</span>
                          <button
                            onClick={() => sectionToggleVoir(section, false)}
                            className="text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
                          >
                            Tout décocher
                          </button>
                        </div>
                      </div>

                      {/* Tableau */}
                      <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                        {/* Colonnes header */}
                        <div className="grid grid-cols-[1fr_60px_60px_60px_72px] gap-0 px-3 py-1.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                          <span />
                          {(['Voir', 'Créer', 'Modifier', 'Supprimer'] as const).map(col => (
                            <span key={col} className="text-center text-[var(--fs-xs)] text-[var(--text-muted)] font-medium">
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
                              className={`grid grid-cols-[1fr_60px_60px_60px_72px] items-center px-3 py-2
                                ${idx < resources.length - 1 ? 'border-b border-[var(--border)]' : ''}
                                ${voirOff ? 'opacity-60' : ''}`}
                            >
                              <span className="text-[var(--fs-sm)] text-[var(--text)]">{r.label}</span>
                              {/* Voir */}
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={p?.voir ?? false}
                                  onChange={e => togglePerm(r.key, 'voir', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer"
                                />
                              </div>
                              {/* Créer */}
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={p?.creer ?? false}
                                  disabled={voirOff}
                                  onChange={e => togglePerm(r.key, 'creer', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </div>
                              {/* Modifier */}
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={p?.modifier ?? false}
                                  disabled={voirOff}
                                  onChange={e => togglePerm(r.key, 'modifier', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </div>
                              {/* Supprimer */}
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={p?.supprimer ?? false}
                                  disabled={voirOff}
                                  onChange={e => togglePerm(r.key, 'supprimer', e.target.checked)}
                                  className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed"
                                />
                              </div>
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

          {/* Actions compte */}
          <div className="flex flex-col gap-4 pt-2 border-t border-[var(--border)]">
            <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--text)]">Gestion du compte</h3>

            {isSelf ? (
              <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                Vous ne pouvez pas modifier votre propre compte depuis cet écran.
              </p>
            ) : (
              <>
                {/* Rôle */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Rôle</p>
                    <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">Définit le libellé du compte</p>
                  </div>
                  <select
                    value={roleValue}
                    disabled={roleLoading}
                    onChange={e => handleSetRole(e.target.value as AdminRole)}
                    className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Activer / Désactiver */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Compte actif</p>
                    <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">Un compte désactivé ne peut plus se connecter</p>
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

                {/* Supprimer */}
                <div className="flex items-center justify-between gap-4 pt-1">
                  <div>
                    <p className="text-[var(--fs-sm)] font-medium text-[var(--danger,#dc2626)]">Supprimer le compte</p>
                    <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">Action irréversible — supprime l'accès définitivement</p>
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

