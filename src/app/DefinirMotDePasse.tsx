import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './providers'
import { Button } from '../shared/ui/Button'

/**
 * Choix d'un nouveau mot de passe.
 *
 * Pourquoi cet ecran existe : « Envoyer un lien de reinitialisation » envoyait
 * bien l'e-mail, mais le lien retombait sur une page qui redirigeait vers
 * l'accueil. Le salarie se retrouvait CONNECTE sans avoir jamais pu choisir
 * son mot de passe — et sans mot de passe, il ne pourrait pas se reconnecter a
 * la session suivante. La fonctionnalite etait donc annoncee et inoperante.
 *
 * Comment Supabase amene ici : le lien de l'e-mail contient des jetons dans le
 * fragment d'URL. Le client les echange tout seul contre une session, puis
 * emet l'evenement `PASSWORD_RECOVERY`. A partir de la, `updateUser` suffit —
 * aucun jeton n'a besoin d'etre manipule a la main.
 */
export function DefinirMotDePasse() {
  const navigate = useNavigate()
  const [motDePasse, setMotDePasse]   = useState('')
  const [confirmation, setConfirm]    = useState('')
  const [erreur, setErreur]           = useState<string | null>(null)
  const [enCours, setEnCours]         = useState(false)
  const [fait, setFait]               = useState(false)
  // `null` = on ne sait pas encore si une session est arrivee avec le lien.
  const [session, setSession] = useState<boolean | null>(null)

  useEffect(() => {
    // Le client peut encore etre en train d'echanger les jetons de l'URL quand
    // ce composant se monte : on regarde l'etat courant ET on ecoute la suite.
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session))
    const { data: ecoute } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s))
    return () => ecoute.subscription.unsubscribe()
  }, [])

  const valider = async (e: React.FormEvent) => {
    e.preventDefault()
    setErreur(null)

    // Les deux controles sont faits ICI, avant l'appel reseau : un message
    // instantane vaut mieux qu'un aller-retour pour apprendre qu'on a mal tape.
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit faire au moins 8 caractères.'); return
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.'); return
    }

    setEnCours(true)
    const { error } = await supabase.auth.updateUser({ password: motDePasse })
    setEnCours(false)
    if (error) { setErreur(error.message); return }

    setFait(true)
    // Petite pause avant de basculer : sans elle, l'ecran change si vite qu'on
    // doute d'avoir reussi.
    setTimeout(() => navigate('/', { replace: true }), 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)]">
        <h1 className="font-display font-bold text-[var(--brand)] text-2xl mb-1">MCA Logistics</h1>
        <p className="text-[var(--text-muted)] text-[var(--fs-sm)] mb-6">Choisis ton mot de passe</p>

        {session === false ? (
          /* Lien expire, deja utilise, ou ouvert dans un autre navigateur que
             celui qui a recu l'e-mail. Le dire franchement, avec la marche a
             suivre — « erreur » tout court n'aide personne. */
          <div className="flex flex-col gap-3">
            <p className="text-[var(--fs-sm)] text-[var(--text)]">
              Ce lien n'est plus valable. Il expire au bout d'une heure et ne sert qu'une fois.
            </p>
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
              Demande un nouveau lien depuis la page de connexion, ou fais-toi définir un mot
              de passe par la direction.
            </p>
            <Button variant="primary" onClick={() => navigate('/', { replace: true })}
                    className="w-full justify-center">
              Retour à la connexion
            </Button>
          </div>
        ) : fait ? (
          <p className="text-[var(--fs-sm)] text-[var(--success)]">
            Mot de passe enregistré. Ouverture de ton espace…
          </p>
        ) : (
          <form onSubmit={valider} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[var(--fs-sm)] text-[var(--text-muted)]" htmlFor="mdp">
                Nouveau mot de passe
              </label>
              <input id="mdp" type="password" autoComplete="new-password" required
                     value={motDePasse} onChange={e => setMotDePasse(e.target.value)}
                     className="field" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[var(--fs-sm)] text-[var(--text-muted)]" htmlFor="mdp2">
                Répète-le
              </label>
              <input id="mdp2" type="password" autoComplete="new-password" required
                     value={confirmation} onChange={e => setConfirm(e.target.value)}
                     className="field" />
            </div>

            {erreur && <p className="text-[var(--danger)] text-[var(--fs-sm)]">{erreur}</p>}

            <Button variant="primary" type="submit" disabled={enCours || session === null}
                    className="w-full justify-center mt-1">
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
