import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'

/**
 * Identifiants à transmettre, affichés UNE fois (le mot de passe n'est stocké nulle
 * part côté site) : e-mail + mot de passe + « Copier ».
 */
export function MotDePasseUneFois({ titre, email, motDePasse, onFermer }: {
  titre: string
  email: string | null
  motDePasse: string
  onFermer: () => void
}) {
  const [copie, setCopie] = useState(false)
  const copier = async () => {
    const texte = email ? `Identifiant : ${email}\nMot de passe : ${motDePasse}` : motDePasse
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
    } catch { /* presse-papiers refusé : le mot de passe reste lisible à l'écran */ }
  }
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--success)] bg-[var(--success)]/10 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text)]">{titre}</p>
        <BoutonIcone icone={X} libelle="Fermer" onClick={onFermer} taille="sm" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {email && <>
          <dt className="text-[var(--text-muted)]">E-mail</dt>
          <dd className="text-[var(--text)] break-all">{email}</dd>
        </>}
        <dt className="text-[var(--text-muted)]">Mot de passe</dt>
        <dd className="font-mono text-base text-[var(--text)] select-all">{motDePasse}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="compact" onClick={() => void copier()}>
          {copie ? <Check size={14} /> : <Copy size={14} />} {copie ? 'Copié' : 'Copier'}
        </Button>
        <span className="text-xs text-[var(--text-muted)]">Affiché une seule fois : transmets-le maintenant.</span>
      </div>
    </div>
  )
}
