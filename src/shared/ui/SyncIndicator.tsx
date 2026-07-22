import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { useSync } from '../../app/SyncProvider'

/** "il y a X min/h" — pas de dépendance date-fns pour un si petit besoin. */
function relativeMinutes(ts: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ts) / 60_000))
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  return `il y a ${hours} h`
}

/**
 * Indicateur global de synchronisation — un par site, dans le header (Shell).
 * Agrège tous les domaines : "syncing" si au moins un domaine est en cours,
 * horodatage = la sync la plus ancienne (le domaine le plus en attente).
 * Clic → force la resynchronisation de tous les domaines périmés.
 */
export function SyncIndicator() {
  const { syncState, forceSync, errors } = useSync()
  // Horloge d'affichage uniquement (rafraîchit le texte "il y a X min") — ne
  // déclenche AUCUN appel réseau, à ne pas confondre avec le polling de sync.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const domains = Object.values(syncState)
  const syncing = domains.some(d => d.syncing)
  const timestamps = domains.map(d => d.lastSyncAt).filter((t): t is number => t !== null)
  const oldestSync = timestamps.length > 0 ? Math.min(...timestamps) : null
  const hasError = Object.keys(errors).length > 0

  const label = syncing
    ? 'Synchro en cours…'
    : oldestSync !== null
      ? `Synchro ${relativeMinutes(oldestSync, now)}`
      : 'Jamais synchronisé'

  return (
    <button
      type="button"
      onClick={() => forceSync()}
      title={hasError ? Object.values(errors).join(' · ') : 'Forcer la synchronisation'}
      className="flex items-center gap-1.5 px-2.5 h-8 rounded-[var(--r-md)] text-[var(--fs-xs)]
        text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
        transition-colors disabled:opacity-50"
      disabled={syncing}
    >
      <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{label}</span>
      {hasError && !syncing && <AlertCircle size={12} className="text-[var(--warning)]" />}
    </button>
  )
}
