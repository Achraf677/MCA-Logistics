// Documents échus à l'affectation d'une course — PUR, partagé par Planning et
// Tournées (features étanches : la règle vit ici, une seule fois).

import { computeEcheance } from './echeances'

export interface ChauffeurDocs {
  full_name: string
  /** Échéance du permis B (team_members.licence_b_expiry). */
  licence_b_expiry: string | null
  /** Échéance de la visite médicale (team_members.medical_visit_expiry). */
  medical_visit_expiry: string | null
}

export interface VehiculeDocs {
  label: string
  ct_expiry: string | null
  insurance_expiry: string | null
}

const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** 'AAAA-MM-JJ' → Date locale à minuit (jamais d'UTC). */
function jourLocal(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, j)
}

/**
 * Documents échus au jour de la course : permis et visite médicale du
 * chauffeur, CT et assurance du véhicule. Liste vide = rien à signaler.
 */
export function alertesAffectation(
  chauffeur: ChauffeurDocs | null | undefined,
  vehicule: VehiculeDocs | null | undefined,
  dateCourse: string,
): string[] {
  const jour = jourLocal(dateCourse)
  const echu = (d: string | null) => computeEcheance(d, jour).status === 'overdue'
  const alertes: string[] = []
  if (chauffeur) {
    if (echu(chauffeur.licence_b_expiry)) alertes.push(`${chauffeur.full_name} : permis échu le ${fr(chauffeur.licence_b_expiry!)}`)
    if (echu(chauffeur.medical_visit_expiry)) alertes.push(`${chauffeur.full_name} : visite médicale échue le ${fr(chauffeur.medical_visit_expiry!)}`)
  }
  if (vehicule) {
    if (echu(vehicule.ct_expiry)) alertes.push(`${vehicule.label} : contrôle technique échu le ${fr(vehicule.ct_expiry!)}`)
    if (echu(vehicule.insurance_expiry)) alertes.push(`${vehicule.label} : assurance échue le ${fr(vehicule.insurance_expiry!)}`)
  }
  return alertes
}
