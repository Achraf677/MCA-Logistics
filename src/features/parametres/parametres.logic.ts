import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceResult } from '../../shared/lib/echeances'
import type { CompanyData } from './parametres.queries'

// Règles pures de l'écran Société : contrôle des saisies, complétude, échéances.
// Un champ vide n'est jamais une erreur ici (seul le nom est obligatoire) : on ne contrôle que ce qui est saisi.

export type ErreursSociete = Partial<Record<'name' | 'siren' | 'siret' | 'tva_intra' | 'pennylane_depot_email', string>>

const chiffres = (v: string) => v.replace(/\s/g, '')
const vide = (v: string | null | undefined) => !v || !v.trim()

/** Clé d'un n° de TVA français : (12 + 3 × (SIREN mod 97)) mod 97, sur deux chiffres. */
export function cleTvaFr(siren: string): string {
  return String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, '0')
}

/** N° de TVA : pour la France, forme FR + clé + SIREN et clé exacte ; autre pays : forme générale seulement. */
export function tvaValide(brut: string): boolean {
  const tva = chiffres(brut).toUpperCase()
  if (tva.startsWith('FR')) {
    const m = /^FR(\d{2})(\d{9})$/.exec(tva)
    return !!m && m[1] === cleTvaFr(m[2])
  }
  return /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(tva)
}

export const emailValide = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export type FormSociete = Pick<CompanyData, 'name' | 'siren' | 'siret' | 'tva_intra' | 'pennylane_depot_email'>

/** Erreurs qui bloquent l'enregistrement. */
export function erreursSociete(f: FormSociete): ErreursSociete {
  const e: ErreursSociete = {}
  if (vide(f.name)) e.name = 'La raison sociale est obligatoire'
  if (!vide(f.siren) && !/^\d{9}$/.test(chiffres(f.siren!))) e.siren = 'Le SIREN a 9 chiffres'
  if (!vide(f.siret) && !/^\d{14}$/.test(chiffres(f.siret!))) e.siret = 'Le SIRET a 14 chiffres'
  if (!vide(f.tva_intra) && !tvaValide(f.tva_intra!)) e.tva_intra = 'N° de TVA incorrect (clé ou format)'
  if (!vide(f.pennylane_depot_email) && !emailValide(f.pennylane_depot_email!)) e.pennylane_depot_email = 'Adresse e-mail incorrecte'
  return e
}

/** Écarts qui n'empêchent pas d'enregistrer (le SIRET commence par le SIREN, le TVA contient le SIREN). */
export function avertissementsSociete(f: FormSociete): string[] {
  const a: string[] = []
  const siren = chiffres(f.siren ?? '')
  const siret = chiffres(f.siret ?? '')
  if (/^\d{9}$/.test(siren) && /^\d{14}$/.test(siret) && !siret.startsWith(siren)) a.push('Le SIRET ne commence pas par le SIREN.')
  const tva = chiffres(f.tva_intra ?? '').toUpperCase()
  if (/^\d{9}$/.test(siren) && tva.startsWith('FR') && tva.length === 13 && !tva.endsWith(siren)) a.push('Le n° de TVA ne contient pas le SIREN.')
  return a
}

/** Échéance d'un document de la société : « soon » dans les 60 jours (le renouvellement d'une licence se prépare). */
export function echeanceSociete(date: string | null, aujourdhui = new Date()): EcheanceResult {
  return computeEcheance(date, aujourdhui, 60)
}

export function libelleEcheance(e: EcheanceResult): string {
  if (e.daysLeft == null) return 'Non renseignée'
  if (e.daysLeft < 0) return `Échue depuis ${-e.daysLeft} j`
  if (e.daysLeft === 0) return "Échoit aujourd'hui"
  return `Dans ${e.daysLeft} j`
}

/** Les champs modifiés par rapport à l'enregistré (le bouton « Enregistrer » ne s'allume que s'il y en a). */
export function champsModifies<T extends object>(initial: T, courant: T): (keyof T)[] {
  return (Object.keys(courant) as (keyof T)[]).filter(k => (initial[k] ?? null) !== (courant[k] ?? null))
}
