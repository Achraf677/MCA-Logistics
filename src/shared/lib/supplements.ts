// Suppléments facturables (attente, étage, 2e présentation…) : catalogue PAR
// CLIENT (clients.supplements), proposé en un clic dans la fiche livraison.
// Partagé : la fiche client l'édite, la fiche livraison l'utilise.

export interface Supplement {
  label: string
  /** Prix HT unitaire en centimes (0 = à saisir dans la course). */
  prix_ht_cts: number
}

/** Suppléments usuels du transport léger, proposés quand le client n'en a pas encore. */
export const SUPPLEMENTS_USUELS: string[] = [
  'Attente (¼ h)',
  '2e présentation',
  'Retour à l’expéditeur',
  'Étage sans ascenseur',
  '2 personnes',
  'Urgence',
  'Point de livraison supplémentaire',
  'Frais d’annulation',
]

/** Catalogue lu en base (jsonb libre) → liste propre ; lignes sans libellé écartées. */
export function lireSupplements(brut: unknown): Supplement[] {
  if (!Array.isArray(brut)) return []
  const vus = new Set<string>()
  const out: Supplement[] = []
  for (const l of brut as Array<Record<string, unknown>>) {
    const label = typeof l?.label === 'string' ? l.label.trim() : ''
    if (!label || vus.has(label.toLowerCase())) continue
    vus.add(label.toLowerCase())
    const p = Number(l?.prix_ht_cts)
    out.push({ label, prix_ht_cts: Number.isFinite(p) && p > 0 ? Math.round(p) : 0 })
  }
  return out
}
