import { useEffect, useState } from 'react'
import { trouverScan, type ScanSuivi } from '../../shared/lib/tourneesColis.queries'

/**
 * Le scan de feuille de route encore ouvert du salarié (lecture en cours, prête ou en erreur).
 * Relevé toutes les 6 s : la lecture tourne sur le serveur, on la retrouve sur n'importe quel onglet.
 */
export function useScanOuvert(memberId: string | null): ScanSuivi | null {
  const [scan, setScan] = useState<ScanSuivi | null>(null)
  useEffect(() => {
    if (!memberId) return
    let annule = false
    const lire = () => { trouverScan(memberId).then(s => { if (!annule) setScan(s) }) }
    lire()
    const t = setInterval(lire, 6000)
    return () => { annule = true; clearInterval(t) }
  }, [memberId])
  return scan
}
