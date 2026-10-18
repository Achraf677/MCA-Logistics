// Ma tournée (salarié) — PUR, testé. Les règles partagées avec le bureau (familles, compteurs,
// statuts par type) vivent dans `shared/lib/tourneesColis.ts` ; ici, ce qui sert à l'écran.
import {
  AUTRES_STATUTS, STATUT_FAIT, compteursTournee, familleStatut,
  type ArretColis, type CompteursTournee, type FamilleStatut, type StatutArretColis, type TypeArretColis,
} from '../../shared/lib/tourneesColis'

export { compteursTournee, familleStatut }
export type { CompteursTournee, FamilleStatut }

/** Statuts proposés pour un arrêt : le geste « fait » d'abord, puis les autres issues. */
export function statutsProposes(type: TypeArretColis): { fait: StatutArretColis; autres: StatutArretColis[] } {
  return { fait: STATUT_FAIT[type], autres: AUTRES_STATUTS[type] }
}

/** « 12 rue des Vosges » ; sans numéro : la rue seule. */
export function libelleAdresse(a: Pick<ArretColis, 'numero' | 'rue'>): string {
  return a.numero ? `${a.numero} ${a.rue}` : a.rue
}

/** En-tête : « 18 / 42 arrêts · 25 / 61 colis ». */
export function libelleCompteurs(c: CompteursTournee): { arrets: string; colis: string } {
  return { arrets: `${c.arretsTraites} / ${c.arrets}`, colis: `${c.colisTraites} / ${c.colis}` }
}

/** Saisie « colis remis » d'un livré partiel : entier borné à [0 ; quantité], sinon null. */
export function lireColisRemis(v: string, quantite: number): number | null {
  if (!/^\d+$/.test(v.trim())) return null
  return Math.min(quantite, Math.max(0, Number(v.trim())))
}

/** Le patch à écrire pour un geste sur un arrêt (null = effacer le statut). */
export function patchStatut(a: Pick<ArretColis, 'quantite'>, statut: StatutArretColis | null, remis?: number | null) {
  if (!statut) return { statut: null, colis_remis: null }
  if (familleStatut(statut) === 'livre') {
    const r = remis == null ? a.quantite : Math.min(a.quantite, Math.max(0, remis))
    return { statut, colis_remis: r }
  }
  return { statut, colis_remis: 0 }
}
