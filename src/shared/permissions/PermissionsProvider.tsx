import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase, useProfile } from '../../app/providers'
import { PermissionsContext, buildCtx } from './usePermissions'
import type { PermEntry } from './usePermissions'

/**
 * Monte UNIQUEMENT à l'intérieur de ProfileGate (profile garantit non-null).
 * Rend TOUJOURS ses enfants — jamais de blocage indéfini.
 *
 * Séquence :
 *  1. Président → ready=true immédiat, aucune requête DB.
 *  2. Autre rôle → charge user_permissions, ready=true en finally (succès ou erreur).
 *  3. Pendant !ready : can()→false (boutons masqués), canViewSection()→true (nav complète).
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  const isPresident = profile?.role === 'president'

  const [permMap, setPermMap] = useState<Map<string, PermEntry>>(new Map())
  const [ready,   setReady]   = useState(false)

  useEffect(() => {
    // ProfileGate garantit que profile est non-null ici.
    if (!profile) { setReady(true); return }

    if (isPresident) { setReady(true); return }

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
        // Erreur réseau : map vide → non-président sans droits, app toujours accessible.
      } finally {
        setReady(true)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isPresident])

  return (
    <PermissionsContext.Provider value={buildCtx(permMap, isPresident, ready)}>
      {children}
    </PermissionsContext.Provider>
  )
}
