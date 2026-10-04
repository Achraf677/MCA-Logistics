import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { construireLigneHeures } from './tournees.logic'
import { creerHeuresTournee } from './tournees.queries'

interface Props {
  open: boolean
  companyId: string
  memberId: string
  chauffeur: string
  date: string
  /** Libellé de la tournée (véhicule), repris en note de la ligne d'heures. */
  libelleTournee?: string
  /** Début suggéré (HH:MM) ; vide = à saisir. */
  debutSuggere: string
  /** Fin suggérée (HH:MM) : l'heure où l'on a cliqué « Terminer ». */
  finSuggeree: string
  onClose: () => void
}

/**
 * Proposition, après « Terminer la tournée », d'enregistrer la journée du
 * chauffeur dans Heures (table `work_hours`). Rien n'est écrit sans « Enregistrer » :
 * le début n'est qu'une suggestion (heure du « Démarrer », `tours.started_at`, sinon à saisir).
 *
 * Portail vers <body>, comme ConfirmDialog (un parent `.glass` rognerait la modale).
 */
export function DialogueHeuresTournee({
  open, companyId, memberId, chauffeur, date, libelleTournee, debutSuggere, finSuggeree, onClose,
}: Props) {
  const { toast } = useToast()
  // L'appelant ne monte la modale qu'à l'ouverture : l'état part des suggestions.
  const [debut, setDebut] = useState(debutSuggere)
  const [fin, setFin] = useState(finSuggeree)
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, busy, onClose])

  if (!open) return null

  const enregistrer = async () => {
    const r = construireLigneHeures({ companyId, memberId, date, debut, fin, libelleTournee })
    if ('erreur' in r) { setErreur(r.erreur); return }
    setBusy(true)
    const { error } = await creerHeuresTournee(r.ligne)
    setBusy(false)
    if (error) { setErreur(error.message); return }
    toast(`Heures de ${chauffeur} enregistrées (${debut} – ${fin})`)
    onClose()
  }

  const [a, m, j] = date.split('-')

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="Enregistrer les heures du chauffeur">
      <div className="absolute inset-0 bg-black/50" onClick={() => { if (!busy) onClose() }} aria-hidden="true" />
      <div className="relative w-full max-w-sm bg-[var(--bg-elevated)] border border-[var(--border)]
        rounded-[var(--r-lg)] shadow-lg p-5 flex flex-col gap-4 anim-dialog">
        <div className="flex flex-col gap-1.5">
          <h2 className="flex items-center gap-2 font-display font-semibold text-base text-[var(--text)]">
            <Clock size={16} className="text-[var(--brand)]" /> Enregistrer les heures ?
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Journée de {chauffeur} le {j}/{m}/{a}, reportée dans Heures.
            {!debutSuggere && " L'heure de démarrage n'est pas connue : saisis-la."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Début
            <input type="time" value={debut} onChange={e => setDebut(e.target.value)}
              className="field" disabled={busy} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Fin
            <input type="time" value={fin} onChange={e => setFin(e.target.value)}
              className="field" disabled={busy} />
          </label>
        </div>
        {debutSuggere && (
          <p className="text-xs text-[var(--text-disabled)]">
            Début repris du démarrage de la tournée (à corriger si elle a été modifiée depuis).
            Pause : 0 min, modifiable ensuite dans Heures.
          </p>
        )}

        {erreur && <p className="text-sm text-[var(--danger)]">{erreur}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Plus tard</Button>
          <Button variant="primary" onClick={enregistrer} disabled={busy || !debut || !fin}>
            {busy ? '…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
