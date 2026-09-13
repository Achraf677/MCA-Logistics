/**
 * Ce qu'on sait lire d'une facture SANS IA — PUR, testable.
 *
 * Les libellés venus de Pennylane suivent une convention constante :
 *   TOTALENERGIES GAZOLE FG-788-FB OPEL MOVANO
 *   E.LECLERC GAZOLE BERLINGO
 *   ELEPHANT BLEU ACHAT CLE LAVAGE FG-788-FB
 * — fournisseur, produit, plaque, modèle. Le produit et la plaque suffisent à
 * pré-remplir le type de carburant et le véhicule, instantanément, sans appel
 * réseau, sans clé d'API et sans risque d'hallucination.
 *
 * L'OCR de la facture reste nécessaire pour ce qui n'est PAS dans le libellé —
 * les litres, le prix au litre, le kilométrage. C'est une autre couche, plus
 * lente et faillible ; celle-ci doit tourner d'abord et toujours.
 *
 * Vit dans `shared/` : Carburant et Entretiens le réclament tous les deux.
 */

/** Types de carburant de l'application (`fuel_logs.fuel_type`). */
export type TypeCarburant = 'diesel' | 'essence' | 'electric' | 'hybrid' | 'lpg'

/**
 * Mots-clés produit → type de carburant.
 *
 * ADBLUE est VOLONTAIREMENT absent : c'est un additif, pas un carburant. Une
 * facture d'AdBlue pré-sélectionnant « diesel » créerait un plein fantôme de
 * 12 € qui fausserait le coût au kilomètre — celui-là même qui sert au coût de
 * revient.
 */
const PRODUITS: Array<{ motif: RegExp; type: TypeCarburant }> = [
  { motif: /\b(gazole|gasoil|gas-?oil|diesel|gnr|b7)\b/i, type: 'diesel' },
  { motif: /\b(sp\s?9[58]|e10|e85|essence|sans\s?plomb)\b/i, type: 'essence' },
  { motif: /\b(gpl|lpg)\b/i, type: 'lpg' },
  { motif: /\b(electri\w*|recharge|borne)\b/i, type: 'electric' },
]

/** Plaque française moderne : AA-123-AB, avec ou sans séparateurs. */
const PLAQUE = /\b([A-Z]{2})[-\s]?(\d{3})[-\s]?([A-Z]{2})\b/i

export interface LectureLibelle {
  /** Type de carburant reconnu, `null` si le libellé n'en nomme aucun. */
  typeCarburant: TypeCarburant | null
  /** Plaque normalisée en MAJUSCULES avec tirets, `null` si absente. */
  plaque: string | null
}

/** Lit ce qu'un libellé de charge dit de lui-même. */
export function lireLibelleCharge(libelle: string | null | undefined): LectureLibelle {
  const texte = (libelle ?? '').trim()
  if (!texte) return { typeCarburant: null, plaque: null }

  const produit = PRODUITS.find(p => p.motif.test(texte))
  const m = texte.match(PLAQUE)

  return {
    typeCarburant: produit?.type ?? null,
    plaque: m ? `${m[1].toUpperCase()}-${m[2]}-${m[3].toUpperCase()}` : null,
  }
}

/** Compare deux plaques en ignorant casse et séparateurs. */
function memePlaque(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const n = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase()
  return n(a) === n(b)
}

export interface VehiculeConnu {
  id: string
  label: string
  /** `undefined` toléré : tous les écrans ne chargent pas la plaque. */
  plate?: string | null
}

/**
 * Retrouve le véhicule désigné par un libellé.
 *
 * La PLAQUE d'abord : elle est unique et ne se confond avec rien. Le nom du
 * modèle ensuite, et seulement s'il ne désigne QU'UN SEUL véhicule — deux
 * camions du même modèle rendraient le libellé ambigu, et pré-sélectionner
 * l'un des deux au hasard serait pire que de ne rien pré-sélectionner :
 * l'erreur passerait inaperçue.
 *
 * Renvoie `null` dès qu'un doute existe. Un libellé qui nomme un véhicule
 * absent du parc (« BERLINGO » quand le parc ne contient qu'un MOVANO) ne
 * désigne rien.
 */
export function trouverVehicule(
  libelle: string | null | undefined,
  vehicules: VehiculeConnu[],
): string | null {
  const texte = (libelle ?? '').trim()
  if (!texte) return null

  const { plaque } = lireLibelleCharge(texte)
  if (plaque) {
    const parPlaque = vehicules.find(v => memePlaque(v.plate ?? null, plaque))
    if (parPlaque) return parPlaque.id
    // Une plaque explicite qui ne correspond à aucun véhicule connu est un
    // signal fort : le libellé parle d'un autre camion. On ne retombe pas sur
    // le nom du modèle, qui pourrait désigner le mauvais.
    return null
  }

  const parNom = vehicules.filter(v =>
    v.label.trim().length >= 3 &&
    new RegExp(`\\b${echapper(v.label.trim())}\\b`, 'i').test(texte),
  )
  return parNom.length === 1 ? parNom[0].id : null
}

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * L'OPÉRATION décrite par un libellé, débarrassée de ce qui n'en fait pas partie.
 *
 * « E.LECLERC MASTIC FG-788-FB OPEL MOVANO » décrit l'achat d'un mastic. Le
 * fournisseur est déjà une colonne à part, la plaque et le modèle sont déjà
 * dans le champ Véhicule : les répéter dans la description n'apporte rien et
 * rend la liste illisible.
 *
 * Ne retire QUE ce qui est identifiable avec certitude — le nom exact du
 * fournisseur en tête, et tout ce qui suit la plaque. Le reste est conservé
 * tel quel : mieux vaut une description un peu longue qu'une description
 * amputée de ce qui comptait.
 *
 * Si le nettoyage ne laisse rien, on rend le libellé d'origine.
 */
export function descriptionDepuisLibelle(
  libelle: string | null | undefined,
  fournisseur?: string | null,
): string {
  const texte = (libelle ?? '').trim()
  if (!texte) return ''

  let reste = texte
  const f = fournisseur?.trim()
  if (f && reste.toUpperCase().startsWith(f.toUpperCase())) {
    reste = reste.slice(f.length).trim()
  }

  const m = reste.match(PLAQUE)
  if (m && m.index != null) reste = reste.slice(0, m.index).trim()

  // Ponctuation de liaison laissée par la découpe (« — », « - », « : »).
  reste = reste.replace(/^[\s\-–—:,]+/, '').replace(/[\s\-–—:,]+$/, '').trim()

  return reste || texte
}

// ── Ce que l'OCR rapporte, et comment s'en méfier ─────────────────────────────

export interface LectureOcr {
  litres: number | null
  prixParLitre: number | null
  kilometrage: number | null
  confiance: number
  /** Pourquoi il n'y a rien à proposer, quand c'est le cas. */
  raison?: string
}

/**
 * Parsing DÉFENSIF de la réponse de l'Edge `lire-facture`.
 *
 * L'Edge applique déjà son seuil de confiance et ses bornes ; le front
 * revalide parce qu'il affiche des nombres dans des champs que l'utilisateur
 * va enregistrer. Tout ce qui n'est pas un nombre fini et strictement positif
 * devient `null` : un champ vide se corrige, un nombre faux se signe.
 */
export function parseLectureOcr(brut: unknown): LectureOcr {
  if (!brut || typeof brut !== 'object') {
    return { litres: null, prixParLitre: null, kilometrage: null, confiance: 0 }
  }
  const r = brut as Record<string, unknown>
  const nombre = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const conf = Number(r.confiance)
  return {
    litres: nombre(r.litres),
    prixParLitre: nombre(r.prix_par_litre),
    kilometrage: nombre(r.kilometrage),
    confiance: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0,
    raison: typeof r.raison === 'string' ? r.raison : undefined,
  }
}
