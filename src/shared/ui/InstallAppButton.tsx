import { useEffect, useState } from 'react'
import { Download, Share } from 'lucide-react'
import { Button } from './Button'

/**
 * Bouton « Installer l'appli » — pour les chauffeurs, sur leur téléphone.
 *
 * Deux mondes bien différents, aucune API commune :
 * - Android/Chrome expose `beforeinstallprompt` : on capture l'événement, on
 *   affiche notre propre bouton, et on déclenche `prompt()` au clic.
 * - iOS Safari n'expose RIEN de programmatique — Apple ne le permet pas.
 *   Seul chemin : Partager → « Sur l'écran d'accueil ». On ne peut
 *   qu'expliquer, pas déclencher.
 * Le bouton disparaît de lui-même une fois l'appli déjà installée
 * (`display-mode: standalone`), ou si le chauffeur l'a fermé une fois —
 * pas la peine de le relancer avec ça à chaque visite.
 */

const CLE_MASQUE = 'mca_install_masque'

interface EvenementInstall extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function dejaInstallee(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

function estIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export function InstallAppButton() {
  const [evenement, setEvenement] = useState<EvenementInstall | null>(null)
  // N'apparaît QUE si on sait faire quelque chose du clic : iOS (instructions)
  // ou `beforeinstallprompt` capturé (Android/Chrome). Sur un navigateur qui
  // ne supporte ni l'un ni l'autre (Firefox desktop, vieux Safari…), le
  // bouton ne s'affiche jamais — rien à proposer qui marcherait vraiment.
  const [masque, setMasque] = useState(true)

  useEffect(() => {
    if (dejaInstallee()) return
    try {
      if (localStorage.getItem(CLE_MASQUE) === '1') return
    } catch { /* pas de localStorage (navigation privée) : on affiche quand même */ }

    if (estIos()) { setMasque(false); return }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvenement(e as EvenementInstall)
      setMasque(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const fermer = () => {
    setMasque(true)
    try { localStorage.setItem(CLE_MASQUE, '1') } catch { /* tant pis, pas grave */ }
  }

  const installer = async () => {
    if (!evenement) return // iOS : rien à déclencher, seul le texte guide
    await evenement.prompt()
    const { outcome } = await evenement.userChoice
    if (outcome === 'accepted') fermer()
  }

  if (masque) return null

  return (
    <div className="glass rounded-[var(--r-xl)] p-4 mb-4 flex items-center gap-3">
      <span className="w-10 h-10 rounded-[var(--r-md)] grid place-items-center bg-[var(--brand-soft)] text-[var(--brand)] shrink-0">
        <Download size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Installer l'appli sur ton téléphone</p>
        {estIos() ? (
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] flex items-center gap-1 flex-wrap">
            Appuie sur <Share size={12} className="inline" /> puis « Sur l'écran d'accueil »
          </p>
        ) : (
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">Un raccourci direct, sans passer par le navigateur.</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!estIos() && (
          <Button variant="primary" size="compact" onClick={installer}>Installer</Button>
        )}
        <Button variant="ghost" size="compact" onClick={fermer}>
          {estIos() ? 'Compris' : 'Non merci'}
        </Button>
      </div>
    </div>
  )
}
