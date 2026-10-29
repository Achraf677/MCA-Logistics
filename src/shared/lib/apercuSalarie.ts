import { useSyncExternalStore } from 'react'

// Aperçu « Interface salarié » pour le bureau : montre l'espace Mes courses sans se déconnecter ni créer de compte test.
// Mémorisé par onglet (sessionStorage) ; purement visuel : les droits et les données restent ceux du compte connecté.

const CLE = 'mca-apercu-salarie'
const abonnes = new Set<() => void>()

function lire(): boolean {
  try { return sessionStorage.getItem(CLE) === '1' } catch { return false }
}

export function definirApercuSalarie(actif: boolean): void {
  try {
    if (actif) sessionStorage.setItem(CLE, '1'); else sessionStorage.removeItem(CLE)
  } catch { /* stockage indisponible : l'aperçu ne tient que le temps de la page */ }
  abonnes.forEach(f => f())
}

export function useApercuSalarie(): boolean {
  return useSyncExternalStore(
    f => { abonnes.add(f); return () => { abonnes.delete(f) } },
    lire,
    () => false,
  )
}

/** Le chrome « salarié » s'applique à un vrai compte salarié, ou au bureau en aperçu sur l'écran Mes courses. */
export function afficherChromeSalarie(compteSalarie: boolean, apercu: boolean, pathname: string): boolean {
  return compteSalarie || (apercu && pathname.startsWith('/mes-courses'))
}
