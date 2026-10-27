/**
 * Règles de la page de connexion (fonctions pures, testées).
 *
 * Deux barrières contre la force brute :
 * - SERVEUR (celle qui compte) : hook Postgres `hook_password_verification_attempt`
 *   (migration 20261026090000), qui verrouille le compte après N échecs, quel que
 *   soit l'appareil ;
 * - NAVIGATEUR (confort) : pause croissante après chaque série d'échecs, pour
 *   décourager et expliquer. Contournable à la main, donc jamais seule.
 */

export const ECHECS_AVANT_PAUSE = 5

/** Pause (secondes) imposée par le navigateur après `echecs` erreurs d'affilée. */
export function pauseSecondes(echecs: number): number {
  if (echecs < ECHECS_AVANT_PAUSE) return 0
  const paliers = [30, 60, 120, 300, 900, 1800]
  return paliers[Math.min(echecs - ECHECS_AVANT_PAUSE, paliers.length - 1)]
}

export interface EtatEchecs { echecs: number; jusqua: number }

const CLE = 'mca.login.echecs'

export function lireEtat(): EtatEchecs {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return { echecs: 0, jusqua: 0 }
    const o = JSON.parse(brut) as Partial<EtatEchecs>
    return { echecs: Number(o.echecs) || 0, jusqua: Number(o.jusqua) || 0 }
  } catch { return { echecs: 0, jusqua: 0 } }
}

export function ecrireEtat(etat: EtatEchecs): void {
  try {
    if (etat.echecs === 0) localStorage.removeItem(CLE)
    else localStorage.setItem(CLE, JSON.stringify(etat))
  } catch { /* stockage indisponible : la barrière serveur reste en place */ }
}

/** Nouvel état après un échec constaté à l'instant `maintenant` (ms). */
export function apresEchec(etat: EtatEchecs, maintenant: number): EtatEchecs {
  const echecs = etat.echecs + 1
  const p = pauseSecondes(echecs)
  return { echecs, jusqua: p ? maintenant + p * 1000 : 0 }
}

export function secondesRestantes(etat: EtatEchecs, maintenant: number): number {
  return Math.max(0, Math.ceil((etat.jusqua - maintenant) / 1000))
}

export function formaterDuree(s: number): string {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`
}

/**
 * Message affiché. Identique pour « e-mail inconnu » et « mauvais mot de passe »
 * (sinon on révèle qui a un compte).
 */
export function messageErreur(err: { message?: string; status?: number; code?: string }): string {
  const msg = (err.message ?? '').toLowerCase()
  if (err.status === 429 || msg.includes('rate limit') || msg.includes('too many'))
    return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.'
  // Message du verrou serveur : on le laisse tel quel (il donne la durée).
  if (msg.includes('verrouill')) return err.message ?? 'Compte temporairement verrouillé.'
  if (msg.includes('email not confirmed')) return 'Adresse e-mail non confirmée. Vérifie ta boîte de réception.'
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'Connexion impossible. Vérifie ta connexion internet.'
  return 'E-mail ou mot de passe incorrect.'
}

/** Contrôle de forme seulement (le serveur reste juge). */
export function emailPlausible(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
}
