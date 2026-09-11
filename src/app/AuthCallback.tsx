import { Navigate, useLocation } from 'react-router-dom'

/**
 * Retour d'une authentification externe.
 *
 * Deux cas arrivent ici, et ils ne se ressemblent pas :
 *   - connexion Google : la session est prete, on entre dans l'application ;
 *   - lien de reinitialisation de mot de passe : Supabase ajoute
 *     `type=recovery` dans le FRAGMENT de l'URL (apres le `#`, jamais envoye
 *     au serveur). Rediriger vers l'accueil comme avant laissait le salarie
 *     connecte sans avoir choisi de mot de passe — donc incapable de revenir.
 *
 * On lit le fragment plutot que la query : c'est la que Supabase ecrit.
 */
export function AuthCallback() {
  const { hash } = useLocation()
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const recuperation = params.get('type') === 'recovery'

  return <Navigate to={recuperation ? '/definir-mot-de-passe' : '/'} replace />
}
