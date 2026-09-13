/**
 * Preferences du chauffeur, gardees sur SON telephone.
 *
 * `localStorage` et pas la base, volontairement : c'est une commodite liee a
 * l'appareil (« sur ce telephone, j'ai Waze »), pas une donnee de l'entreprise.
 * La mettre en base obligerait le meme compte ouvert sur deux telephones a
 * partager un reglage qui depend des applications installees sur chacun.
 *
 * Chaque acces est protege : `localStorage` peut LEVER (navigation privee,
 * cookies bloques, WebView bridee) et pas seulement renvoyer vide. L'ecran doit
 * marcher sans, avec la valeur par defaut.
 */

import type { AppNavigation } from './navigation'

const CLE_APP_NAV = 'mca.chauffeur.appNavigation'

const VALEURS: readonly AppNavigation[] = ['google', 'waze', 'plans']

/** Application par defaut : celle qui marche partout, sur tous les systemes. */
export const APP_NAV_DEFAUT: AppNavigation = 'google'

export function lireAppNavigation(): AppNavigation {
  try {
    const v = localStorage.getItem(CLE_APP_NAV)
    return VALEURS.includes(v as AppNavigation) ? (v as AppNavigation) : APP_NAV_DEFAUT
  } catch {
    return APP_NAV_DEFAUT
  }
}

export function ecrireAppNavigation(app: AppNavigation): void {
  try {
    localStorage.setItem(CLE_APP_NAV, app)
  } catch {
    // Reglage perdu au prochain chargement, et c'est tout : ce serait absurde
    // d'afficher une erreur pour une preference d'affichage.
  }
}
