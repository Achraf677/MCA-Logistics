/**
 * Les trois temps d'une course, vus du chauffeur.
 *
 * Une course ne se joue pas en deux gestes mais en trois : rouler jusqu'au
 * point de retrait, CHARGER, puis rouler jusqu'au destinataire. L'ecran n'en
 * connaissait que deux — « Demarrer », « Livre » — et le bouton « Naviguer »
 * pointait toujours vers le destinataire, meme quand le chauffeur devait
 * d'abord aller chercher la marchandise ailleurs.
 *
 * Module PUR : aucune base, aucun DOM. Il recoit l'etat d'une course et rend
 * ce que l'ecran doit afficher.
 */

/** L'etat d'une course, reduit a ce qui determine l'etape. */
export interface EtatCourse {
  statut: string
  /** Horodatage du chargement (migration 20260913090000). */
  charge_le: string | null
  pickup_address: string | null
  delivery_address: string | null
}

export type Etape =
  /** Pas encore partie : le seul geste est « Demarrer ». */
  | 'a_demarrer'
  /** En route vers le point de retrait : « Naviguer » y pointe, geste = « Charger ». */
  | 'vers_chargement'
  /** Chargee, en route vers le destinataire : geste = « Livrer ». */
  | 'vers_livraison'
  /** Terminee (livree, facturee, payee) ou annulee : plus aucun geste. */
  | 'terminee'

/**
 * Etape courante.
 *
 * REGLE CENTRALE, et elle merite d'etre dite : une course sans adresse de
 * retrait saute l'etape de chargement. Imposer un « Charger » a quelqu'un qui
 * a deja le colis dans son camion serait un clic pour rien, repete a chaque
 * course — le genre de detail qui fait abandonner un outil.
 */
export function etapeCourante(c: EtatCourse): Etape {
  if (c.statut === 'planifiee') return 'a_demarrer'
  if (c.statut !== 'en_cours') return 'terminee'
  if (c.charge_le) return 'vers_livraison'
  return c.pickup_address?.trim() ? 'vers_chargement' : 'vers_livraison'
}

/**
 * Adresse vers laquelle « Naviguer » doit pointer a cet instant.
 *
 * `null` quand il n'y a rien a viser — l'ecran masque alors le bouton plutot
 * que d'ouvrir une carte vide.
 */
export function adresseDeNavigation(c: EtatCourse): string | null {
  const etape = etapeCourante(c)
  const cible = etape === 'vers_chargement' ? c.pickup_address : c.delivery_address
  return cible?.trim() ? cible.trim() : null
}

/** Libelle du bouton principal, ou `null` s'il n'y a plus rien a faire. */
export function libelleAction(c: EtatCourse): string | null {
  switch (etapeCourante(c)) {
    case 'a_demarrer':      return 'Démarrer'
    case 'vers_chargement': return 'Charger'
    case 'vers_livraison':  return 'Livrer'
    case 'terminee':        return null
  }
}

/** Ce que dit la pastille d'etat, en langage de terrain. */
export function libelleEtat(c: EtatCourse): string {
  switch (etapeCourante(c)) {
    case 'a_demarrer':      return 'À faire'
    case 'vers_chargement': return 'Vers le retrait'
    case 'vers_livraison':  return 'Chargé'
    case 'terminee':        return c.statut === 'annulee' ? 'Annulée' : 'Livrée'
  }
}
