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
    titre: "La lecture des photos n'est pas incluse dans l'abonnement du service",
    suite: "Réessayer n'y changera rien : il faut passer à un abonnement payant du service de lecture. "
         + "Coller le texte d'un message continue de marcher.",
    ton: 'var(--danger)',
  },
  quota: {
    titre: 'Plafond de débit atteint',
    suite: 'La lecture est autorisée, mais le service a été trop sollicité à l’instant. '
         + 'Réessaie dans quelques minutes.',
    ton: 'var(--warning)',
  },
  cle_invalide: {
    titre: 'La clé du service de lecture est refusée',
    suite: 'Elle est absente, expirée ou erronée côté serveur : elle est à renouveler (à demander à ton développeur).',
    ton: 'var(--danger)',
  },
  indetermine: {
    titre: 'Réponse inattendue',
    suite: "Ni acceptation ni refus clair. Le détail technique ci-dessous est ce qu'a répondu le service.",
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
      <p className="text-sm text-[var(--text-muted)]">
        Vérifie que le site sait lire une photo (tickets, feuilles de route). Envoie une image minuscule :
        ça ne coûte presque rien et rien n'est enregistré.
      </p>

      <div>
        <Button variant="secondary" onClick={tester} disabled={enCours}>
          <ScanLine size={14} />
          {enCours ? 'Test en cours…' : 'Vérifier la lecture des photos'}
        </Button>
      </div>

      {erreur && <p className="text-sm text-[var(--danger)]">{erreur}</p>}

      {msg && (
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] p-3 flex flex-col gap-1">
          <span className="text-sm font-medium" style={{ color: msg.ton }}>{msg.titre}</span>
          <span className="text-sm text-[var(--text-muted)]">{msg.suite}</span>
          <span className="text-xs text-[var(--text-disabled)] font-mono">
            {res?.modele}{res?.statut ? ` · HTTP ${res.statut}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
