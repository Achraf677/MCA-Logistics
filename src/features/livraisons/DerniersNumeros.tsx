import { useEffect } from 'react'
import { useSync } from '../../app/SyncProvider'

export function DerniersNumeros() {
  const { syncIfStale, derniersNumeros } = useSync()

  useEffect(() => { syncIfStale('derniers_numeros') }, [syncIfStale])

  if (derniersNumeros === null) return null

  return (
    <div
      title="Derniers numéros émis (Pennylane)"
      className="hidden sm:flex items-center gap-2 text-[var(--fs-xs)] font-mono text-[var(--text-muted)]"
    >
      <span>FA {derniersNumeros.invoice ?? '—'}</span>
      <span className="opacity-40">·</span>
      <span>DE {derniersNumeros.quote ?? '—'}</span>
    </div>
  )
}
