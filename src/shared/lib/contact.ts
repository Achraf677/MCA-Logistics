// Helpers purs pour les liens de contact (tel: / mailto:). Testables.

/**
 * Normalise un numéro de téléphone pour un href `tel:` : retire espaces,
 * points, tirets, parenthèses ; conserve un éventuel `+` de tête (indicatif).
 * L'AFFICHAGE reste inchangé — seul le href est normalisé.
 * Retourne null si aucun chiffre exploitable.
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  const plus = trimmed.startsWith('+') ? '+' : ''
  const digits = trimmed.replace(/[^\d]/g, '')
  if (!digits) return null
  return `tel:${plus}${digits}`
}

/** href `mailto:` à partir d'un email. Null si vide / manifestement invalide. */
export function mailtoHref(email: string | null | undefined): string | null {
  if (!email) return null
  const e = email.trim()
  if (!e || !e.includes('@')) return null
  return `mailto:${e}`
}
