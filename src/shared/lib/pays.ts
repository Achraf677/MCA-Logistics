// Pays de facturation d'un client (ISO 3166 alpha-2) et règle d'autoliquidation.
// Partagé : la fiche client choisit le pays, la fiche livraison en déduit la TVA.

/** Pays proposés (les plus probables d'abord), libellés français. */
export const PAYS: Array<{ code: string; libelle: string }> = [
  { code: 'FR', libelle: 'France' },
  { code: 'DE', libelle: 'Allemagne' },
  { code: 'BE', libelle: 'Belgique' },
  { code: 'LU', libelle: 'Luxembourg' },
  { code: 'CH', libelle: 'Suisse' },
  { code: 'NL', libelle: 'Pays-Bas' },
  { code: 'IT', libelle: 'Italie' },
  { code: 'ES', libelle: 'Espagne' },
  { code: 'PT', libelle: 'Portugal' },
  { code: 'AT', libelle: 'Autriche' },
  { code: 'PL', libelle: 'Pologne' },
  { code: 'RO', libelle: 'Roumanie' },
  { code: 'BG', libelle: 'Bulgarie' },
  { code: 'CZ', libelle: 'Tchéquie' },
  { code: 'SK', libelle: 'Slovaquie' },
  { code: 'HU', libelle: 'Hongrie' },
  { code: 'LT', libelle: 'Lituanie' },
  { code: 'GB', libelle: 'Royaume-Uni' },
]

/** États membres de l'Union européenne (hors France pour l'autoliquidation). */
const UE = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE',
  'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

export function estUE(pays: string | null | undefined): boolean {
  return UE.has((pays ?? '').toUpperCase())
}

export function libellePays(code: string | null | undefined): string {
  const c = (code ?? 'FR').toUpperCase()
  return PAYS.find(p => p.code === c)?.libelle ?? c
}

/**
 * Autoliquidation par défaut d'une course : client professionnel établi dans un
 * AUTRE pays de l'UE et identifié à la TVA (art. 259-1 et 283-2 du CGI : la
 * prestation est taxable chez le preneur, qui autoliquide). Hors UE ou sans
 * numéro : pas de défaut, la décision reste manuelle.
 */
export function autoliquidationParDefaut(pays: string | null | undefined, tvaIntra: string | null | undefined): boolean {
  const p = (pays ?? 'FR').toUpperCase()
  return p !== 'FR' && estUE(p) && !!tvaIntra?.trim()
}
