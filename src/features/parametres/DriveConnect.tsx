import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, HardDrive } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'

/**
 * Connexion Google Drive — panneau TRANSITOIRE.
 *
 * Le site ne stocke plus rien dans Drive : tout part dans Supabase Storage.
 * Ce panneau ne sert qu'a une chose, rebrancher Drive le temps de RAPATRIER
 * les anciens justificatifs (voir MigrationDrive juste en dessous), puis on
 * debranche et le panneau disparait avec le reste de Drive.
 *
 * Il affiche le COMPTE connecte, et pas seulement « connecte ». C'est le seul
 * moyen de voir qu'on s'est rebranche sur la mauvaise boite Google : les
 * anciens fichiers appartiennent a un compte precis, et un rapatriement lance
 * depuis un autre compte renvoie « fichier introuvable » sur chaque ligne sans
 * dire pourquoi.
 */
export function DriveConnect() {
  const [chargement, setChargement] = useState(true)
  const [connecte, setConnecte] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)
  const [deconnexion, setDeconnexion] = useState(false)

  const relireStatut = useCallback(async () => {
    setChargement(true)
    try {
      const { data } = await supabase.functions.invoke('drive-status')
      setConnecte(!!data?.connected)
      setEmail(data?.email ?? null)
    } catch {
      setConnecte(false)
    }
    setChargement(false)
  }, [])

  useEffect(() => {
    // Retour de Google : on nettoie la barre d'adresse et on montre la raison
    // de l'echec plutot qu'un ecran identique a celui d'avant le clic.
    const p = new URLSearchParams(window.location.search)
    const drive = p.get('drive')
    if (drive) {
      window.history.replaceState({}, '', '/systeme?tab=parametres')
      if (drive === 'error') {
        setErreur(`Connexion Drive échouée (${p.get('reason') ?? 'raison inconnue'})`)
      }
    }
    void relireStatut()
  }, [relireStatut])

  async function connecter() {
    setErreur(null)
    const { data, error } = await supabase.functions.invoke('drive-oauth-start', {
      body: { origin: window.location.origin },
    })
    if (error || !data?.url) {
      setErreur('Impossible de démarrer la connexion Drive')
      return
    }
    window.location.href = data.url
  }

  async function deconnecter() {
    setErreur(null)
    setDeconnexion(true)
    const { data, error } = await supabase.functions.invoke('drive-disconnect')
    setDeconnexion(false)
    if (error || !data?.ok) {
      setErreur('Déconnexion Drive impossible')
      return
    }
    setConfirmation(false)
    await relireStatut()
  }

  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Connexion Google Drive
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {chargement ? (
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">Vérification…</p>
        ) : connecte ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 size={18} className="text-[var(--success,#16a34a)] shrink-0" />
              <div className="min-w-0">
                <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Drive connecté</p>
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">
                  {email ?? 'compte inconnu — reconnectez-vous pour l’afficher'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="compact" onClick={connecter}>
                Changer de compte
              </Button>
              <Button
                variant="ghost"
                size="compact"
                onClick={() => setConfirmation(true)}
                className="text-[var(--danger)]"
              >
                Déconnecter
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <HardDrive size={18} className="text-[var(--text-muted)] shrink-0" />
              <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                Aucun Drive connecté.
              </p>
            </div>
            <Button variant="primary" size="compact" onClick={connecter} className="shrink-0">
              Connecter Google Drive
            </Button>
          </div>
        )}

        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
          Connectez le compte Google qui contient les anciens justificatifs, rapatriez-les
          ci-dessous, puis déconnectez. Le site n’écrit plus rien dans Drive.
        </p>

        {erreur && <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)]">{erreur}</p>}
      </div>

      <ConfirmDialog
        open={confirmation}
        title="Se déconnecter de Google Drive ?"
        message="L’accès sera coupé pour toute la société. Les fichiers déjà présents dans Drive ne sont pas supprimés."
        confirmLabel="Se déconnecter"
        onConfirm={deconnecter}
        onCancel={() => setConfirmation(false)}
        loading={deconnexion}
      />
    </div>
  )
}
