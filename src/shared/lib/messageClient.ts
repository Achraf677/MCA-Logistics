/**
 * Message au client, par SMS — PUR (sans DB ni DOM), testable.
 *
 * Le SMS et pas un envoi depuis le serveur : un chauffeur qui previent
 * « j'arrive dans 10 minutes » veut que le client puisse LUI repondre, sur son
 * numero. Un SMS parti d'une passerelle arriverait d'un numero inconnu, et la
 * reponse se perdrait. Accessoirement, cela ne coute rien et ne demande aucun
 * abonnement.
 */

export interface MessageType {
  cle: string
  libelle: string
  texte: (client: string | null) => string
}

/**
 * Messages tout prets, pour ne pas taper au volant — a la LIVRAISON
 * (destinataire). Garde son nom historique : c'est le jeu par defaut.
 */
export const MESSAGES_TYPES: MessageType[] = [
  {
    cle: 'en_route',
    libelle: 'En route',
    texte: () => 'Bonjour, je suis en route pour votre livraison.',
  },
  {
    cle: 'arrive_bientot',
    libelle: 'J’arrive',
    texte: () => "Bonjour, j'arrive dans une dizaine de minutes pour la livraison.",
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
 * Messages au RETRAIT : on s'adresse a celui qui REMET la marchandise.
 * Lui parler de « votre livraison » serait faux — ce n'est pas lui qui la recoit.
 */
export const MESSAGES_RETRAIT: MessageType[] = [
  {
    cle: 'en_route',
    libelle: 'En route',
    texte: () => 'Bonjour, je suis en route pour récupérer la marchandise.',
  },
  {
    cle: 'arrive_bientot',
    libelle: 'J’arrive',
    texte: () => "Bonjour, j'arrive dans une dizaine de minutes pour l'enlèvement.",
  },
  {
    cle: 'sur_place',
    libelle: 'Sur place',
    texte: () => "Bonjour, je suis sur place pour l'enlèvement de la marchandise.",
  },
  {
    cle: 'absent',
    libelle: 'Personne',
    texte: () => "Bonjour, je suis passé pour l'enlèvement mais personne n'a répondu. Pouvez-vous me rappeler ?",
  },
]

/** Le bon jeu de messages selon l'arret. */
export function messagesPour(type: 'retrait' | 'livraison'): MessageType[] {
  return type === 'retrait' ? MESSAGES_RETRAIT : MESSAGES_TYPES
}

/**
 * Qui joindre a cet arret ?
 *
 * Le contact SUR PLACE d'abord (expediteur au retrait, destinataire a la
 * livraison). A defaut, le donneur d'ordre (client facture : plateforme,
 * commissionnaire) — mais seulement pour l'APPELER : un SMS « je suis devant
 * chez vous » envoye a une plateforme n'a aucun sens, et c'est elle qui paie.
 */
export function contactArret(
  type: 'retrait' | 'livraison',
  c: { expediteur_tel: string | null; destinataire_tel: string | null; clients: { phone: string | null } | null },
): { tel: string | null; source: 'sur_place' | 'donneur_ordre' | null; smsPossible: boolean } {
  const surPlace = type === 'retrait' ? c.expediteur_tel : c.destinataire_tel
  if (numeroUtilisable(surPlace)) return { tel: surPlace, source: 'sur_place', smsPossible: true }
  const donneur = c.clients?.phone ?? null
  if (numeroUtilisable(donneur)) return { tel: donneur, source: 'donneur_ordre', smsPossible: false }
  return { tel: null, source: null, smsPossible: false }
}

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
