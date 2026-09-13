// Cycle de vie d'une tournée — PUR (sans DB ni DOM), source de vérité UNIQUE.
//
// Même raison d'être que `livraisonStatuts.ts` juste à côté : deux écrans en
// dépendent désormais — la carte de tournée côté bureau, et « Mes courses »
// sur le téléphone du chauffeur, qui doit pouvoir démarrer et terminer sa
// tournée sans quitter son écran. Les features étant étanches, c'est ici que
// les deux puisent la même règle.
//
// `features/tournees/tournees.logic.ts` la ré-exporte pour ne casser aucun
// import existant.

export type StatutTournee = 'brouillon' | 'optimisee' | 'en_cours' | 'terminee'

/**
 * « Démarrer » : depuis une tournée optimisée, ou depuis un brouillon qui a
 * déjà des arrêts.
 *
 * Le brouillon est accepté parce qu'une tournée peut être composée SANS
 * optimisation, quand c'est l'humain qui impose l'ordre de chargement
 * (« Répartir dans mon ordre »). La marquer `optimisee` pour débloquer le
 * bouton aurait été un mensonge : rien n'a été optimisé, et les kilomètres
 * seraient restés vides sous une étiquette qui promet le contraire.
 *
 * Le garde-fou reste le nombre d'arrêts : un brouillon vide n'est pas une
 * tournée, et rien ne sert de la démarrer.
 */
export function canStartTour(status: StatutTournee, stopCount = 0): boolean {
  if (status === 'optimisee') return true
  return status === 'brouillon' && stopCount > 0
}

/** « Terminer » : seulement depuis une tournée en cours. */
export function canFinishTour(status: StatutTournee): boolean {
  return status === 'en_cours'
}
