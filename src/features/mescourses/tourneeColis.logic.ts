// Ma tournée (salarié) — PUR, testé. Les règles partagées avec le bureau (familles, compteurs,
// statuts par type) vivent dans `shared/lib/tourneesColis.ts` ; ici, ce qui sert à l'écran.
import {
  AUTRES_STATUTS, STATUT_FAIT, colisCollecteDefaut, compteursTournee, familleStatut, resultatCollecte,
  type ArretColis, type CompteursTournee, type FamilleStatut, type StatutArretColis, type TypeArretColis,
} from '../../shared/lib/tourneesColis'

export { compteursTournee, familleStatut, colisCollecteDefaut, resultatCollecte }
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

/** L'issue la plus courante après « fait », proposée en un appui : avisé · relais fermé · rien à collecter. */
export function issueRapide(type: TypeArretColis): StatutArretColis {
  return type === 'rc' ? 'rc_ferme' : type === 'col' ? 'col_rien' : 'avise'
}

/** Un arrêt pas encore traité, domicile ou collecte, peut changer de type ou être éclaté. */
export function peutTransformer(a: Pick<ArretColis, 'type' | 'statut'>): boolean {
  return !a.statut && (a.type === 'c' || a.type === 'col')
}

/**
 * Liste d'arrêts après un éclatement : l'arrêt d'origine mis à jour, le nouveau juste derrière lui dans la feuille,
 * les rangs suivants décalés d'un cran (comme `eclater_arret` en base). Autres tournées intactes. Pur.
 */
export function appliquerEclatement(arrets: ArretColis[], maj: ArretColis[]): ArretColis[] {
  const par = new Map(maj.map(a => [a.id, a]))
  const nouveaux = maj.filter(a => !arrets.some(x => x.id === a.id))
  if (nouveaux.length === 0) return arrets.map(a => par.get(a.id) ?? a)
  const t = nouveaux[0].tournee_id
  const rang = nouveaux[0].rang
  const decales = arrets.map(a => {
    const m = par.get(a.id)
    if (m) return m
    return a.tournee_id === t && a.rang >= rang ? { ...a, rang: a.rang + 1 } : a
  })
  const origine = decales.findIndex(a => a.tournee_id === t && a.rang === rang - 1)
  const i = origine >= 0 ? origine + 1 : decales.length
  return [...decales.slice(0, i), ...nouveaux, ...decales.slice(i)]
}
