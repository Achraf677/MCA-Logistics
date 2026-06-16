import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase, useProfile } from '../../app/providers'
import { PermissionsContext, buildPermFns } from './usePermissions'
import type { PermEntry } from './usePermissions'

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  const [permMap, setPermMap] = useState<Map<string, PermEntry>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) { setLoading(false); return }

    // Président : bypass total, aucune requête DB.
    if (profile.role === 'president') { setLoading(false); return }

    void (async () => {
      try {
        const { data } = await supabase
          .from('user_permissions')
          .select('resource_key, can_view, can_create, can_update, can_delete')
          .eq('user_id', profile.id)
        const m = new Map<string, PermEntry>()
        for (const row of data ?? []) {
          m.set(row.resource_key, {
            view:   row.can_view   ?? false,
            create: row.can_create ?? false,
            update: row.can_update ?? false,
            delete: row.can_delete ?? false,
          })
        }
        setPermMap(m)
      } catch {
        // Échec réseau → défaut aucun droit (non-président), président jamais bloqué.
      } finally {
        setLoading(false)
      }
    })()
  }, [profile])

  const isPresident = profile?.role === 'president'
  const { can, canViewSection } = buildPermFns(permMap, isPresident, loading)

  return (
    <PermissionsContext.Provider value={{ can, canViewSection, loading }}>
      {children}
    </PermissionsContext.Provider>
  )
}
