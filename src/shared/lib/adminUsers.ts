// Comptes de connexion (Edge `admin-users`) — règles PURES, sans DB ni DOM.
//
// Partagé entre Système › Administrateurs et Équipe › Accès au site : un même
// code d'erreur de l'Edge doit donner le même message partout (et plus jamais
// « Edge Function returned a non-2xx status code »).

/** Réponse de l'Edge admin-users (succès ou `{ ok:false, error, detail? }`). */
export interface ReponseAdmin {
  ok?: boolean
  error?: string
  detail?: string
  /** Message de repli déjà rédigé par l'Edge (ex. `send_reset_failed`). */
  message?: string
  [cle: string]: unknown
}

/** Accès au site d'une fiche Équipe (`get_access`). */
export interface AccesCompte {
  user_id: string
  email: string | null
  role: string | null
  active: boolean
  last_sign_in_at: string | null
}

const MESSAGES: Record<string, string> = {
  forbidden_president_only: 'Réservé au président.',
  'invalid session':        'Session expirée : reconnecte-toi.',
  'missing Authorization':  'Session expirée : reconnecte-toi.',
  fiche_deja_reliee:        'Cette fiche est déjà reliée à un compte.',
  fiche_introuvable:        'Fiche introuvable.',
  compte_deja_relie:        'Ce compte est déjà relié à une autre fiche.',
  email_deja_utilise:       'Cet e-mail a déjà un compte de connexion. S’il est de la société, il apparaît dans Équipe › Comptes (relie-le à la fiche) ; sinon utilise un autre e-mail.',
  create_failed:            'Création du compte refusée.',
  invite_failed:            'Invitation non envoyée (e-mail du serveur non configuré) : choisis « Je donne un mot de passe ».',
  profile_failed:           'Compte créé mais profil non enregistré : contacte le support.',
  link_failed:              'Compte créé mais pas relié à la fiche. Ne recrée pas le compte : contacte le support pour finir le lien.',
  cible_introuvable:        'Compte introuvable dans la société.',
  action_interdite_sur_soi_meme: 'Impossible sur ton propre compte : tu ne peux ni te couper l’accès, ni te supprimer, ni changer ton mot de passe ici.',
  role_invalide:            'Rôle refusé.',
  president_non_modifiable: 'Un compte président ne se modifie pas ici (accès, mot de passe, rôle).',
  suppression_president_interdite: 'Le compte du président ne peut pas être supprimé.',
  set_role_failed:          'Changement de rôle refusé.',
  set_active_failed:        "Changement d'accès refusé.",
  set_password_failed:      'Mot de passe refusé.',
  send_reset_failed:        "L'e-mail n'a pas pu être envoyé. Définis un mot de passe à la place.",
  email_cible_inconnu:      "Ce compte n'a pas d'e-mail : définis un mot de passe à la place.",
  unlink_failed:            'La fiche n’a pas pu être déliée.',
  delete_failed:            'Suppression refusée.',
  action_inconnue:          'Action non prise en charge par le serveur (mise à jour en attente ?).',
}

/** Vrai si l'échec vient d'un e-mail déjà inscrit (code dédié ou message Supabase). */
export function estEmailDejaUtilise(code: string | null | undefined, detail?: string | null): boolean {
  if (code === 'email_deja_utilise' || code === 'email_exists' || code === 'user_already_exists') return true
  if (code !== 'create_failed' && code !== 'invite_failed') return false
  return /already (been )?registered|already exists|email_exists/i.test(detail ?? '')
}

/** Message lisible d'une réponse en échec de l'Edge admin-users. */
export function libelleErreurAdmin(r: Pick<ReponseAdmin, 'error' | 'detail' | 'message'> | null | undefined): string {
  if (!r) return 'Erreur inconnue.'
  if (estEmailDejaUtilise(r.error, r.detail)) return MESSAGES.email_deja_utilise
  if (r.error && MESSAGES[r.error]) {
    // Pour les refus génériques, le détail technique aide à comprendre.
    const generique = r.error === 'create_failed' || r.error === 'set_password_failed'
    return generique && r.detail ? `${MESSAGES[r.error]} (${r.detail})` : MESSAGES[r.error]
  }
  return r.message || r.detail || r.error || 'Erreur inconnue.'
}

/**
 * « C'est mon compte » : relier SA connexion à une fiche. Simple confirmation
 * si l'e-mail de la fiche est celui du profil connecté (ou si la fiche n'en a
 * pas) ; double confirmation si la fiche porte l'e-mail de quelqu'un d'autre.
 */
export function confirmationMonCompte(
  emailFiche: string | null | undefined,
  emailProfil: string | null | undefined,
): 'simple' | 'double' {
  const f = (emailFiche ?? '').trim().toLowerCase()
  const p = (emailProfil ?? '').trim().toLowerCase()
  if (!f) return 'simple'
  return f === p ? 'simple' : 'double'
}

/** Dernière connexion en français (« jamais » si absente). */
export function libelleDerniereConnexion(iso: string | null | undefined): string {
  if (!iso) return 'Jamais connecté'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Jamais connecté'
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
