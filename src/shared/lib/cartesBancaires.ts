// Cartes bancaires (Système › Cartes bancaires) — PUR, testé.
// Une carte = nom + fin du numéro + famille (CB classique / carburant) + dates d'activité.
// Le `code` ne change jamais : c'est lui que portent les justificatifs et les pleins.

export type TypeCarte = 'societe' | 'carburant'

export interface CarteBancaire {
  id: string
  code: string
  nom: string
  fin: string
  type: TypeCarte
  /** Active à partir de ce jour (compris) ; null = depuis toujours. */
  actif_a_partir_du: string | null
  /** Inactive à partir de ce jour (compris) ; null = pour toujours. */
  inactif_a_partir_du: string | null
}

export const LIBELLE_TYPE_CARTE: Record<TypeCarte, string> = { societe: 'CB classique', carburant: 'CB carburant' }

/** « QONTO : *4103 ». */
export const libelleCarteBancaire = (c: Pick<CarteBancaire, 'nom' | 'fin'>): string => `${c.nom} : *${c.fin}`

/** Carte utilisable pour une dépense de ce jour (« AAAA-MM-JJ »). */
export function carteActiveLe(c: Pick<CarteBancaire, 'actif_a_partir_du' | 'inactif_a_partir_du'>, jour: string): boolean {
  if (c.actif_a_partir_du && jour < c.actif_a_partir_du) return false
  if (c.inactif_a_partir_du && jour >= c.inactif_a_partir_du) return false
  return true
}

export type StatutCarte = 'active' | 'programmee' | 'inactive'

/** État d'aujourd'hui : active, pas encore active (programmée), ou inactive. */
export function statutCarte(c: Pick<CarteBancaire, 'actif_a_partir_du' | 'inactif_a_partir_du'>, aujourdhui: string): StatutCarte {
  if (c.actif_a_partir_du && aujourdhui < c.actif_a_partir_du) return 'programmee'
  if (c.inactif_a_partir_du && aujourdhui >= c.inactif_a_partir_du) return 'inactive'
  return 'active'
}

/** Cartes proposables pour une dépense du `jour`, de la famille demandée ('toutes' = les deux), triées par libellé. */
export function cartesPour(cartes: CarteBancaire[], type: TypeCarte | 'toutes', jour: string): CarteBancaire[] {
  return cartes
    .filter(c => (type === 'toutes' || c.type === type) && carteActiveLe(c, jour))
    .sort((a, b) => (a.type === b.type ? libelleCarteBancaire(a).localeCompare(libelleCarteBancaire(b)) : a.type === 'carburant' ? -1 : 1))
}

/** Famille de cartes attendue pour un moyen de paiement (null = pas de carte à choisir). */
export function typeCarteDuMoyen(moyen: string | null | undefined): TypeCarte | null {
  return moyen === 'carte_societe' ? 'societe' : moyen === 'carte_carburant' ? 'carburant' : null
}

/** Options de liste : on garde la carte déjà choisie même si elle n'est plus proposée à cette date. */
export function optionsCartes(cartes: CarteBancaire[], type: TypeCarte | 'toutes', jour: string, deja?: string | null) {
  const liste = cartesPour(cartes, type, jour)
  const extra = deja && !liste.some(c => c.code === deja) ? cartes.filter(c => c.code === deja) : []
  return [...liste, ...extra].map(c => ({ valeur: c.code, libelle: libelleCarteBancaire(c) }))
}

/** Libellé d'une carte d'après son code ('' si vide, code brut si la carte est inconnue). */
export function libelleCarte(code: string | null | undefined, cartes: CarteBancaire[]): string {
  if (!code) return ''
  const c = cartes.find(x => x.code === code)
  return c ? libelleCarteBancaire(c) : code
}

export interface SaisieCarte {
  nom: string
  fin: string
  actif_a_partir_du: string
  inactif_a_partir_du: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Ce qui empêche d'enregistrer une carte. */
export function manquesCarte(s: SaisieCarte): string[] {
  const m: string[] = []
  if (!s.nom.trim()) m.push('Nom (banque)')
  if (!/^[A-Za-z0-9]{3,8}$/.test(s.fin.trim())) m.push('Fin du numéro (3 à 8 caractères)')
  if (s.actif_a_partir_du && !DATE.test(s.actif_a_partir_du)) m.push('Date de début invalide')
  if (s.inactif_a_partir_du && !DATE.test(s.inactif_a_partir_du)) m.push('Date de fin invalide')
  if (s.actif_a_partir_du && s.inactif_a_partir_du && s.inactif_a_partir_du <= s.actif_a_partir_du) m.push('La fin doit être après le début')
  return m
}

/** Code stable d'une nouvelle carte : « qonto_4103 » (suffixe -2, -3… si déjà pris). */
export function nouveauCodeCarte(nom: string, fin: string, existants: string[]): string {
  const base = `${nom}_${fin}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'carte'
  if (!existants.includes(base)) return base
  let i = 2
  while (existants.includes(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export interface UsageCarte { justificatifs: number; pleins: number }

/** Une carte déjà utilisée (montant saisi dessus) ne se supprime pas : on la rend inactive. */
export const carteSupprimable = (u: UsageCarte | undefined): boolean => !u || (u.justificatifs === 0 && u.pleins === 0)
