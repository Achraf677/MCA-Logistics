/**
 * Ordre impose a la main, partage par les tournees et par l'ecran chauffeur.
 *
 * Vit dans `shared/` parce que DEUX ecrans le reclament : la carte de tournee
 * cote bureau, et « Mes courses » sur le telephone. Les features etant
 * etanches, c'est le seul endroit ou les deux peuvent puiser la meme regle —
 * et deux copies d'une regle d'ordre finissent toujours par diverger.
 */

/**
 * Deplace un arret d'un cran dans la liste, et renvoie le nouvel ordre des
 * identifiants.
 *
 * Pourquoi manuellement : l'optimisation calcule le trajet le plus court, mais
 * elle ignore les contraintes du terrain — un client qui n'ouvre qu'a partir de
 * 14 h, un chargement a prendre avant une livraison, un acces interdit aux
 * poids lourds le matin. Le chauffeur doit pouvoir imposer son ordre.
 *
 * Renvoie le tableau INCHANGE (meme contenu) si le deplacement est impossible :
 * premier arret vers le haut, dernier vers le bas, ou identifiant inconnu.
 * L'appelant peut donc appeler sans verifier, et comparer pour savoir s'il doit
 * enregistrer.
 */
export function deplacerArret(ids: string[], id: string, sens: 'haut' | 'bas'): string[] {
  const i = ids.indexOf(id)
  if (i === -1) return ids
  const j = sens === 'haut' ? i - 1 : i + 1
  if (j < 0 || j >= ids.length) return ids
  const copie = [...ids]
  copie[i] = ids[j]
  copie[j] = ids[i]
  return copie
}

/**
 * Plan de chargement : l'ordre dans lequel remplir le camion.
 *
 * C'est l'INVERSE de l'ordre de livraison, et ce n'est pas une coquetterie.
 * Un fourgon se charge par une seule porte : ce qu'on met en premier finit au
 * fond, et on ne le ressort qu'en vidant tout ce qui est devant. Donc le
 * premier client livre doit etre charge EN DERNIER, contre la porte.
 *
 * Charger dans l'ordre de livraison — le reflexe naturel — oblige a decharger
 * puis recharger a chaque arret. C'est exactement le « bordel » qu'on cherche a
 * supprimer.
 *
 * Renvoie les memes elements, ordonnes pour le chargement, chacun avec son rang
 * (1 = a charger en premier, au fond) et son rang de livraison d'origine.
 */
export function planDeChargement<T>(
  arretsDansLOrdreDeLivraison: T[],
): Array<{ item: T; rangChargement: number; rangLivraison: number }> {
  return arretsDansLOrdreDeLivraison
    .map((item, i) => ({ item, rangLivraison: i + 1 }))
    .reverse()
    .map((e, i) => ({ ...e, rangChargement: i + 1 }))
}
