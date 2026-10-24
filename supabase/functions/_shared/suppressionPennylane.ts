// Factures supprimées chez Pennylane : que fait la synchro des charges locales qui n'y sont plus ? — PUR, testé.
//
// Règle du 24/10/2026 : une charge dont la facture a disparu de Pennylane disparaît du site (avec ses lignes de carburant /
// d'entretien reliées). Garde-fou : si la liste Pennylane paraît incomplète (vide, ou la moitié des charges d'un coup),
// on ne supprime RIEN et on signale seulement (`pennylane_deleted_at`) — mieux vaut une alerte qu'une compta effacée par
// une réponse d'API tronquée.

export type DecisionSuppression = 'supprimer' | 'signaler' | 'rien'

export function decisionSuppression(o: { locales: number; manquantes: number; vues: number }): DecisionSuppression {
  if (o.manquantes === 0) return 'rien'
  if (o.vues === 0) return 'signaler'
  if (o.manquantes > 10 && o.manquantes > o.locales / 2) return 'signaler'
  return 'supprimer'
}
