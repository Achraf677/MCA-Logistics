import { useEffect, useSyncExternalStore } from 'react'
import type { CarteBancaire } from './cartes'
import { listerCartes } from './cartes.queries'

// Liste des cartes lue une fois par session puis partagée par tous les écrans (salarié et bureau) ; rechargée après une modification.
let cartes: CarteBancaire[] = []
let charge = false
let enCours: Promise<void> | null = null
const abonnes = new Set<() => void>()

async function charger(): Promise<void> {
  if (!enCours) {
    enCours = listerCartes().then(({ data }) => {
      cartes = data ?? []
      charge = true
    }).finally(() => {
      enCours = null
      abonnes.forEach(f => f())
    })
  }
  return enCours
}

export const rechargerCartes = (): Promise<void> => charger()

export function useCartes(): CarteBancaire[] {
  const liste = useSyncExternalStore(
    f => { abonnes.add(f); return () => { abonnes.delete(f) } },
    () => cartes,
    () => cartes,
  )
  useEffect(() => { if (!charge) void charger() }, [])
  return liste
}
