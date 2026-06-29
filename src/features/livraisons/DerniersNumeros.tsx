import { useState, useEffect } from 'react'
import { getDerniersNumeros } from './livraisons.queries'

export function DerniersNumeros() {
  const [data, setData] = useState<{ invoice: string | null; quote: string | null } | null>(null)

  useEffect(() => {
    getDerniersNumeros()
      .then(setData)
      .catch(() => setData({ invoice: null, quote: null }))
  }, [])

  if (data === null) return null

  return (
    <div
      title="Derniers numéros émis (Pennylane)"
      className="hidden sm:flex items-center gap-2 text-[var(--fs-xs)] font-mono text-[var(--text-muted)]"
    >
      <span>FA {data.invoice ?? '—'}</span>
      <span className="opacity-40">·</span>
      <span>DE {data.quote ?? '—'}</span>
    </div>
  )
}
