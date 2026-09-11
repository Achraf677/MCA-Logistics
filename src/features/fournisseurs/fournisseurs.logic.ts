import type { Supplier } from './fournisseurs.types'

export const CATEGORY_LABELS: Record<NonNullable<Supplier['category']>, string> = {
  carburant:      'Carburant',
  assurance:      'Assurance',
  entretien:      'Entretien',
  soustraitance:  'Sous-traitance',
  logiciel:       'Logiciel',
  telecom:        'Télécom',
  autre:          'Autre',
}

export function getCategoryLabel(cat: Supplier['category']): string {
  return cat ? CATEGORY_LABELS[cat] : '—'
}

export function isTvaDeductible(cat: Supplier['category']): boolean {
  return cat === 'carburant'
}

export function countByCategory(suppliers: Supplier[]): Record<string, number> {
  return suppliers.reduce((acc, s) => {
    const key = s.category ?? 'autre'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}

/** Retire tous les caractères non-numériques et garde les 9 premiers chiffres. */
export function normalizeSiren(v: string): string {
  return v.replace(/\D/g, '').slice(0, 9)
}

/** Retourne true si v contient exactement 9 chiffres (après normalisation). */
export function validateSiren(v: string): boolean {
  return normalizeSiren(v).length === 9
}

/** Retourne true si v contient exactement 14 chiffres (après retrait des séparateurs). */
export function validateSiret(v: string): boolean {
  return v.replace(/\D/g, '').length === 14
}

/**
 * Cherche parmi `existing` un fournisseur dont le SIREN normalisé correspond à `siren`.
 * Si `excludeId` est fourni, ce fournisseur est ignoré (modification en cours).
 * Retourne null si `siren` ne forme pas 9 chiffres ou si aucun doublon n'est trouvé.
 */
export function findDuplicate(
  siren: string,
  existing: Supplier[],
  excludeId?: string,
): Supplier | null {
  const norm = normalizeSiren(siren)
  if (norm.length !== 9) return null
  return (
    existing.find(s => {
      if (excludeId && s.id === excludeId) return false
      // Préfère le champ siren dédié, sinon extrait les 9 premiers chiffres du siret.
      const cmp = s.siren
        ? normalizeSiren(s.siren)
        : s.siret
          ? normalizeSiren(s.siret)
          : ''
      return cmp.length === 9 && cmp === norm
    }) ?? null
  )
}

// ── Depenses par fournisseur ─────────────────────────────────────────────────

/** Une charge reduite a ce qui sert au cumul. */
export interface ChargePourCumul {
  supplier_id: string | null
  date: string                    // 'AAAA-MM-JJ'
  montant_ht_cts: number
  est_immobilisation?: boolean
}

export interface DepensesFournisseur {
  totalHtCts: number
  /** Date de la facture la plus recente, ou null si aucune. */
  derniereDate: string | null
  nbFactures: number
}

/**
 * Cumule les depenses par fournisseur.
 *
 * Pourquoi cette vue existe : la liste Fournisseurs n'affichait que de
 * l'administratif (SIRET, e-mail, telephone). Elle ne repondait pas a la
 * seule question qu'on se pose vraiment en l'ouvrant — chez qui je depense,
 * et quand ai-je achete pour la derniere fois.
 *
 * Trois choix :
 *   - en HT, comme le reste des ecrans d'analyse ;
 *   - les IMMOBILISATIONS sont exclues. Un achat de vehicule a 25 000 euros
 *     ecraserait tous les autres fournisseurs et ferait croire a une derive
 *     de depenses courantes. C'est la meme regle que les totaux de Charges ;
 *   - les charges sans fournisseur sont ignorees, faute de a qui les
 *     rattacher — elles restent visibles dans l'ecran Charges.
 *
 * Les AVOIRS (montant negatif) sont conserves avec leur signe : ils reduisent
 * le total, ce qui est exactement leur role.
 */
export function cumulerDepensesParFournisseur(
  charges: ChargePourCumul[],
): Map<string, DepensesFournisseur> {
  const par = new Map<string, DepensesFournisseur>()

  for (const c of charges) {
    if (!c.supplier_id) continue
    if (c.est_immobilisation) continue

    const actuel = par.get(c.supplier_id)
      ?? { totalHtCts: 0, derniereDate: null, nbFactures: 0 }

    actuel.totalHtCts += c.montant_ht_cts
    actuel.nbFactures += 1
    // Comparaison de chaines 'AAAA-MM-JJ' : l'ordre alphabetique EST l'ordre
    // chronologique pour ce format, pas besoin de construire des dates.
    if (!actuel.derniereDate || c.date > actuel.derniereDate) actuel.derniereDate = c.date

    par.set(c.supplier_id, actuel)
  }

  return par
}
