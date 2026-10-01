import { useEffect } from 'react'
import { useSync } from '../../app/SyncProvider'

/**
 * Derniers numéros émis chez Pennylane, dans la barre de sous-onglets :
 * « Dernière facture FA-… · Dernier devis DE-… » sur PC ; sur téléphone,
 * les deux numéros seuls, empilés en petit (le libellé reste en infobulle).
 */
export function DerniersNumeros() {
  const { syncIfStale, derniersNumeros } = useSync()

  useEffect(() => { syncIfStale('derniers_numeros') }, [syncIfStale])

  if (derniersNumeros === null) return null
  const facture = derniersNumeros.invoice ?? '—'
  const devis = derniersNumeros.quote ?? '—'

  return (
    <div
      title={`Derniers numéros émis chez Pennylane — facture ${facture} · devis ${devis}`}
      className="flex flex-col items-end leading-tight text-[0.6875rem] sm:flex-row sm:items-center sm:gap-1.5 sm:text-xs whitespace-nowrap text-[var(--text-muted)]"
    >
      <span>
        <span className="hidden lg:inline">Dernière facture </span>
        <span className="font-mono text-[var(--text)]">{facture}</span>
      </span>
      <span className="hidden sm:inline opacity-40">·</span>
      <span>
        <span className="hidden lg:inline">Dernier devis </span>
        <span className="font-mono text-[var(--text)]">{devis}</span>
      </span>
    </div>
  )
}
