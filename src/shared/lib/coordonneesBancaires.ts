// Contrôle des coordonnées bancaires (IBAN, BIC) : fonctions pures, partagées (Système › Cartes bancaires).

const sansEspaces = (v: string) => v.replace(/\s/g, '')

/** IBAN : 15 à 34 caractères, clé mod 97 (norme ISO 13616). */
export function ibanValide(brut: string): boolean {
  const iban = sansEspaces(brut).toUpperCase()
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
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(sansEspaces(brut).toUpperCase())
}

/** IBAN par groupes de 4 pour la lecture. */
export function ibanLisible(iban: string): string {
  return sansEspaces(iban).toUpperCase().replace(/(.{4})/g, '$1 ').trim()
}

/** Erreurs bloquantes d'une saisie IBAN / BIC (un champ vide n'est pas une erreur). */
export function erreursBancaires(f: { iban: string | null; bic: string | null }): { iban?: string; bic?: string } {
  const e: { iban?: string; bic?: string } = {}
  if (f.iban?.trim() && !ibanValide(f.iban)) e.iban = 'IBAN incorrect (clé de contrôle)'
  if (f.bic?.trim() && !bicValide(f.bic)) e.bic = 'BIC incorrect (8 ou 11 caractères)'
  return e
}

/** E-mail masqué pour l'affichage d'une adresse sensible : « de•••@exemple.tech ». */
export function emailMasque(email: string): string {
  const [local, domaine] = email.split('@')
  if (!domaine) return email
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(3, local.length - 2))}@${domaine}`
}

/** Chemin de stockage d'un RIB : `<company_id>/ribs/<uuid>-<nom assaini>` (premier segment = société, exigé par les policies du bucket). */
export function cheminRib(companyId: string, nomFichier: string, uuid: string): string {
  const propre = nomFichier
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
  return `${companyId}/ribs/${uuid}-${propre}`
}

/** Un compte doit au moins avoir un nom ; IBAN / BIC vides acceptés (compte en cours de saisie). */
export function erreurLibelleCompte(libelle: string): string | undefined {
  return libelle.trim() ? undefined : 'Donne un nom au compte (ex. Compte principal)'
}
