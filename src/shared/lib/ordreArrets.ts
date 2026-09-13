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
