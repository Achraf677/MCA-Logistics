import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { supabase } from '../../app/providers'
import { useToast } from '../../shared/ui/useToast'
import { Skeleton } from '../../shared/ui/Skeleton'

const ROLE_LABELS: Record<string, string> = {
  president: 'Président',
  dg:        'Directeur général',
  chauffeur: 'Chauffeur',
  comptable: 'Comptable',
}

interface DriveAccessMember {
  id: string
  full_name: string
  role: string
  drive_access: boolean
}

export function DriveAccess() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<DriveAccessMember[]>([])

  useEffect(() => {
    supabase.functions
      .invoke('drive-access', { body: { action: 'list' } })
      .then(({ data }) => {
        if (data?.ok) setMembers(data.members)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(member: DriveAccessMember, value: boolean) {
    setMembers(prev =>
      prev.map(m => (m.id === member.id ? { ...m, drive_access: value } : m)),
    )
    const { data, error } = await supabase.functions.invoke('drive-access', {
      body: { action: 'set', user_id: member.id, allowed: value },
    })
    if (error || !data?.ok) {
      setMembers(prev =>
        prev.map(m => (m.id === member.id ? { ...m, drive_access: !value } : m)),
      )
      toast('Erreur lors de la mise à jour de l\'accès', 'error')
    } else {
      toast(`Accès ${value ? 'accordé' : 'retiré'} à ${member.full_name}`)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
        Par défaut, vous êtes le seul à accéder aux fichiers Drive. Activez l'accès
        pour les comptes de confiance. Vous pouvez le retirer à tout moment.
      </p>
      <div className="flex flex-col gap-1.5">
        {members.map(member => (
          <div
            key={member.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">
                {member.full_name}
              </span>
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[var(--fs-xs)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
            </div>

            {member.role === 'president' ? (
              <div className="flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)] shrink-0">
                <Lock size={12} />
                <span>Toujours autorisé</span>
              </div>
            ) : (
              <button
                role="switch"
                aria-checked={member.drive_access}
                aria-label={`Accès Drive pour ${member.full_name}`}
                onClick={() => handleToggle(member, !member.drive_access)}
                className={`relative shrink-0 w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${
                  member.drive_access ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    member.drive_access ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
