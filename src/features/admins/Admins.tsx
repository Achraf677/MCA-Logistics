import { useState, useEffect, useCallback } from 'react'
import { UserPlus, ShieldCheck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useProfile, supabase } from '../../app/providers'
import { DrawerAdminPermissions } from './DrawerAdminPermissions'
import { ModalAddAdmin } from './ModalAddAdmin'
import type { AdminMember } from './admins.types'
import { ROLE_LABELS } from './admins.types'

export function Admins() {
  const { profile } = useProfile()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AdminMember | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.functions.invoke('admin-permissions', {
      body: { action: 'list_members' },
    })
    if (data?.ok && Array.isArray(data.members)) {
      setMembers(data.members)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  function openDrawer(member: AdminMember) {
    if (member.role === 'president') return
    setSelected(member)
    setDrawerOpen(true)
  }

  function handleDrawerClose() {
    setDrawerOpen(false)
    // Garde le membre sélectionné visible jusqu'à l'animation de fermeture
    setTimeout(() => setSelected(null), 200)
  }

  function handleMemberUpdated() {
    loadMembers()
  }

  return (
    <Shell pageTitle="Administrateurs">
      <div className="max-w-2xl flex flex-col gap-6">

        {/* En-tête */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
            Gérez les comptes ayant accès à l'application et définissez leurs permissions par ressource.
          </p>
          <Button
            variant="primary"
            size="compact"
            onClick={() => setModalOpen(true)}
            className="shrink-0"
          >
            <UserPlus size={14} />
            Ajouter
          </Button>
        </div>

        {/* Liste membres */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : members.length === 0 ? (
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)] text-center py-8">
            Aucun compte trouvé.
          </p>
        ) : (
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
            {members.map((member, idx) => {
              const isPresident = member.role === 'president'
              const isCurrentUser = member.id === profile?.id
              return (
                <div
                  key={member.id}
                  onClick={() => !isPresident && openDrawer(member)}
                  className={`flex items-center gap-3 px-4 py-3
                    ${idx < members.length - 1 ? 'border-b border-[var(--border)]' : ''}
                    ${isPresident
                      ? 'bg-[var(--bg-elevated)]'
                      : 'bg-[var(--bg)] hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors'}
                    ${selected?.id === member.id && drawerOpen ? 'bg-[var(--brand)]/5' : ''}`}
                >
                  {/* Avatar initiales */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--fs-xs)] font-semibold text-[var(--text-muted)]">
                    {member.full_name.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">
                        {member.full_name}
                      </p>
                      {isCurrentUser && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--brand)]/10 text-[var(--brand)] font-medium">
                          Vous
                        </span>
                      )}
                    </div>
                    {member.email && (
                      <p className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{member.email}</p>
                    )}
                  </div>

                  {/* Rôle / badge */}
                  {isPresident ? (
                    <div className="shrink-0 flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <ShieldCheck size={14} className="text-[var(--brand)]" />
                      <span className="text-[var(--brand)] font-medium">Accès total</span>
                    </div>
                  ) : (
                    <span className="shrink-0 px-2 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <DrawerAdminPermissions
        member={selected}
        currentUserId={profile?.id ?? ''}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onMemberUpdated={handleMemberUpdated}
      />

      <ModalAddAdmin
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadMembers}
      />
    </Shell>
  )
}
