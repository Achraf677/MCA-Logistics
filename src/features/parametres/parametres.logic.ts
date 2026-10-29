import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceResult } from '../../shared/lib/echeances'
import type { CompanyData } from './parametres.queries'

// Règles pures de l'écran Société : contrôle des saisies, complétude, échéances.
// Un champ vide n'est jamais une erreur ici (seul le nom est obligatoire) : on ne contrôle que ce qui est saisi.

export type ErreursSociete = Partial<Record<'name' | 'siren' | 'siret' | 'tva_intra' | 'iban' | 'bic' | 'pennylane_depot_email', string>>

const chiffres = (v: string) => v.replace(/\s/g, '')
const vide = (v: string | null | undefined) => !v || !v.trim()

/** IBAN : 15 à 34 caractères, clé mod 97 (norme ISO 13616). */
export function ibanValide(brut: string): boolean {
  const iban = chiffres(brut).toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearrange = iban.slice(4) + iban.slice(0, 4)
  let reste = 0
  for (const c of rearrange) {
    const v = c >= 'A' ? String(c.charCodeAt(0) - 55) : c
    for (const d of v) reste = (reste * 10 + Number(d)) % 97
  }
  return reste === 1
}

/** BIC / SWIFT : 8 ou 11 caractères (banque, pays, lieu, agence). */
export function bicValide(brut: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(chiffres(brut).toUpperCase())
}

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

export type FormSociete = Pick<CompanyData, 'name' | 'siren' | 'siret' | 'tva_intra' | 'iban' | 'bic' | 'pennylane_depot_email'>

/** Erreurs qui bloquent l'enregistrement. */
export function erreursSociete(f: FormSociete): ErreursSociete {
  const e: ErreursSociete = {}
  if (vide(f.name)) e.name = 'La raison sociale est obligatoire'
  if (!vide(f.siren) && !/^\d{9}$/.test(chiffres(f.siren!))) e.siren = 'Le SIREN a 9 chiffres'
  if (!vide(f.siret) && !/^\d{14}$/.test(chiffres(f.siret!))) e.siret = 'Le SIRET a 14 chiffres'
  if (!vide(f.tva_intra) && !tvaValide(f.tva_intra!)) e.tva_intra = 'N° de TVA incorrect (clé ou format)'
  if (!vide(f.iban) && !ibanValide(f.iban!)) e.iban = 'IBAN incorrect (clé de contrôle)'
  if (!vide(f.bic) && !bicValide(f.bic!)) e.bic = 'BIC incorrect (8 ou 11 caractères)'
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

/** Champs de la fiche société qui comptent pour « fiche complète » (obligations des factures et du transport). */
export const CHAMPS_FICHE: { cle: keyof CompanyData; libelle: string }[] = [
  { cle: 'name', libelle: 'Raison sociale' },
  { cle: 'siren', libelle: 'SIREN' },
  { cle: 'siret', libelle: 'SIRET' },
  { cle: 'tva_intra', libelle: 'N° de TVA' },
  { cle: 'address', libelle: 'Adresse du dépôt' },
  { cle: 'capital_cts', libelle: 'Capital social' },
  { cle: 'iban', libelle: 'IBAN' },
  { cle: 'bic', libelle: 'BIC' },
  { cle: 'licence_transport', libelle: 'N° de licence de transport' },
  { cle: 'transport_license_expiry', libelle: 'Échéance de la licence' },
  { cle: 'rc_pro_expiry', libelle: 'Échéance de la RC pro' },
  { cle: 'pennylane_depot_email', libelle: 'E-mail de dépôt Pennylane' },
]

export function completudeSociete(c: Partial<Record<keyof CompanyData, unknown>>): { remplis: number; total: number; manquants: string[] } {
  const manquants = CHAMPS_FICHE.filter(({ cle }) => {
    const v = c[cle]
    return v == null || (typeof v === 'string' && !v.trim())
  }).map(f => f.libelle)
  return { remplis: CHAMPS_FICHE.length - manquants.length, total: CHAMPS_FICHE.length, manquants }
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
