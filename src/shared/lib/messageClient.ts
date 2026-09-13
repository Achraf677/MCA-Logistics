/**
 * Message au client, par SMS — PUR (sans DB ni DOM), testable.
 *
 * Le SMS et pas un envoi depuis le serveur : un chauffeur qui previent
 * « j'arrive dans 10 minutes » veut que le client puisse LUI repondre, sur son
 * numero. Un SMS parti d'une passerelle arriverait d'un numero inconnu, et la
 * reponse se perdrait. Accessoirement, cela ne coute rien et ne demande aucun
 * abonnement.
 */

/** Messages tout prets, pour ne pas taper au volant. */
export const MESSAGES_TYPES: Array<{ cle: string; libelle: string; texte: (client: string | null) => string }> = [
  {
    cle: 'en_route',
    libelle: 'En route',
    texte: () => 'Bonjour, je suis en route pour votre livraison.',
  },
  {
    cle: 'arrive_bientot',
    libelle: 'J’arrive',
    texte: () => "Bonjour, j'arrive dans une dizaine de minutes.",
  },
  {
    cle: 'sur_place',
    libelle: 'Sur place',
    texte: () => 'Bonjour, je suis devant chez vous pour la livraison.',
  },
  {
    cle: 'absent',
    libelle: 'Personne',
    texte: () => "Bonjour, je suis passé pour votre livraison mais personne n'a répondu. Pouvez-vous me rappeler ?",
  },
]

/**
 * Numero utilisable pour un `sms:` ?
 *
 * Volontairement permissif : on verifie qu'il reste au moins six chiffres une
 * fois retires espaces, points, tirets et parentheses. Valider finement les
 * numeros francais rejetterait les numeros etrangers — et MCA livre en
 * Allemagne.
 */
export function numeroUtilisable(tel: string | null | undefined): boolean {
  if (!tel) return false
  return (tel.match(/\d/g) ?? []).length >= 6
}

/**
 * Lien `sms:` avec le message pre-rempli.
 *
 * Le separateur est `?body=` et non `&body=` : la forme avec `&` ne fonctionne
 * que sur certains Android et casse sur iOS. `?` marche des deux cotes.
 *
 * Renvoie `null` si le numero n'est pas utilisable, pour que l'ecran masque le
 * bouton plutot que d'ouvrir une appli de messages vide.
 */
export function lienSms(tel: string | null | undefined, message: string): string | null {
  if (!numeroUtilisable(tel)) return null
  const numero = (tel as string).replace(/[^\d+]/g, '')
  return `sms:${numero}?body=${encodeURIComponent(message)}`
}

/** Lien d'appel, meme regle de validation que le SMS. */
export function lienTel(tel: string | null | undefined): string | null {
  if (!numeroUtilisable(tel)) return null
  return `tel:${(tel as string).replace(/[^\d+]/g, '')}`
}
