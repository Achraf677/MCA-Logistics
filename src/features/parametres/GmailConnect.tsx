import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Mail } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'

/**
 * Connexion Gmail : le site envoie par mail depuis ce compte Google (justificatifs vers Pennylane, factures aux
 * clients). Affiche le compte connecté, pour voir qu'on est branché sur la bonne boîte.
 */
export function GmailConnect() {
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
        setErreur(`Connexion Gmail échouée (${p.get('reason') ?? 'raison inconnue'})`)
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
      setErreur('Impossible de démarrer la connexion Gmail')
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
      setErreur('Déconnexion Gmail impossible')
      return
    }
    setConfirmation(false)
    await relireStatut()
  }

  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Envoi d’e-mails (Gmail)
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
                <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Gmail connecté</p>
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
              <Mail size={18} className="text-[var(--text-muted)] shrink-0" />
              <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                Aucun Gmail connecté.
              </p>
            </div>
            <Button variant="primary" size="compact" onClick={connecter} className="shrink-0">
              Connecter Gmail
            </Button>
          </div>
        )}

        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
          Le site envoie les justificatifs à Pennylane et les factures aux clients depuis ce compte.
        </p>

        {erreur && <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)]">{erreur}</p>}
      </div>

      <ConfirmDialog
        open={confirmation}
        title="Se déconnecter de Gmail ?"
        message="L’envoi d’e-mails par le site sera coupé pour toute la société."
        confirmLabel="Se déconnecter"
        onConfirm={deconnecter}
        onCancel={() => setConfirmation(false)}
        loading={deconnexion}
      />
    </div>
  )
}
