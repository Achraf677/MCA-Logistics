import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { supabase } from '../../app/providers'

type Acces = 'ouvert' | 'refuse' | 'cle_invalide' | 'quota' | 'indetermine'

interface Reponse {
  modele?: string
  acces?: Acces
  statut?: number
  detail?: string
}

/**
 * Verifie si le forfait Mistral du compte inclut la lecture automatique des
 * images (OCR).
 *
 * Pourquoi un bouton plutot qu'une reponse ecrite dans la documentation : la
 * page « Limites » de la console Mistral affiche des quotas pour TOUT le
 * catalogue, y compris les modeles que le forfait refuse. Elle ne dit rien de
 * l'habilitation reelle. C'est deja ce piege qui avait fait croire pendant des
 * semaines que l'assistant etait sature alors qu'il etait simplement refuse.
 * Seul un appel reel fait foi — c'est ce que fait ce bouton, avec l'image la
 * plus petite qui existe.
 */
const MESSAGES: Record<Acces, { titre: string; suite: string; ton: string }> = {
  ouvert: {
    titre: 'La lecture automatique fonctionne',
    suite: 'Photographier une feuille de route ou un ticket est possible : le modèle répond.',
    ton: 'var(--success)',
  },
  refuse: {
    titre: "Ce modèle n'est pas inclus dans l'abonnement",
    suite: "Réessayer n'y changera rien. Il faut soit un forfait Mistral payant, soit renoncer "
         + "à la lecture d'image — coller le texte du message continue de marcher, lui.",
    ton: 'var(--danger)',
  },
  quota: {
    titre: 'Plafond de débit atteint',
    suite: 'Le modèle nous est ouvert, mais le compte a trop sollicité l’API à l’instant. '
         + 'Réessaie dans quelques minutes : là, réessayer a du sens.',
    ton: 'var(--warning)',
  },
  cle_invalide: {
    titre: 'La clé Mistral est refusée',
    suite: 'Le secret `MISTRAL_API_KEY` du projet Supabase est absent, expiré ou erroné.',
    ton: 'var(--danger)',
  },
  indetermine: {
    titre: 'Réponse inattendue',
    suite: "Ni acceptation ni refus clair — le détail technique ci-dessous est ce qu'a répondu Mistral.",
    ton: 'var(--text-muted)',
  },
}

export function TestLectureAuto() {
  const [enCours, setEnCours] = useState(false)
  const [res, setRes] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const tester = async () => {
    setEnCours(true); setErreur(null); setRes(null)
    const { data, error } = await supabase.functions.invoke('ai-extract-deliveries', {
      body: { ping: true },
    })
    setEnCours(false)
    if (error) { setErreur(error.message); return }
    setRes(data as Reponse)
  }

  const msg = res?.acces ? MESSAGES[res.acces] ?? MESSAGES.indetermine : null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
        Envoie une image minuscule à Mistral et rapporte sa réponse telle quelle. Ne consomme
        pratiquement rien et n'enregistre rien.
      </p>

      <div>
        <Button variant="secondary" onClick={tester} disabled={enCours}>
          <ScanLine size={14} />
          {enCours ? 'Test en cours…' : 'Tester la lecture automatique'}
        </Button>
      </div>

      {erreur && <p className="text-[var(--fs-sm)] text-[var(--danger)]">{erreur}</p>}

      {msg && (
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] p-3 flex flex-col gap-1">
          <span className="text-[var(--fs-sm)] font-medium" style={{ color: msg.ton }}>{msg.titre}</span>
          <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">{msg.suite}</span>
          <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] font-mono">
            {res?.modele}{res?.statut ? ` · HTTP ${res.statut}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
