import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  /**
   * Si fourni : affiche une case à cocher (décochée par défaut) avec ce libellé ;
   * le bouton de confirmation reste désactivé tant qu'elle n'est pas cochée
   * (double vérification pour les actions sensibles).
   */
  acknowledgeLabel?: string
  /**
   * Si fourni : affiche une case à cocher SUPPLÉMENTAIRE, décochée par défaut,
   * qui NE BLOQUE PAS la confirmation. Son état est remonté à `onConfirm`.
   *
   * À ne pas confondre avec `acknowledgeLabel`, qui verrouille le bouton tant
   * qu'on n'a pas coché : celle-ci dit « au passage, applique aussi ceci »
   * (« aucun justificatif attendu »), l'autre dit « confirme que tu as compris ».
   * Deux intentions opposées, deux props distinctes.
   */
  optionLabel?: string
  /** Reçoit l'état de `optionLabel` (false si la prop n'est pas fournie). */
  onConfirm: (optionCochee: boolean) => void
  onCancel: () => void
  loading?: boolean
}

/**
 * Modale de confirmation réutilisable (à utiliser pour toute action destructive/irréversible).
 * Bouton de confirmation en rouge (danger) + Annuler. Pas de saisie texte.
 *
 * Rendue dans un portail vers <body> : un ancêtre portant `backdrop-filter`,
 * `transform` ou `filter` (la classe `.glass`, par exemple) devient le référentiel
 * des enfants en `position: fixed`. La modale se retrouverait alors dimensionnée
 * dans la carte au lieu de l'écran, et rognée par son `overflow: hidden` — boutons
 * inaccessibles. Le portail rend ce cas impossible, quel que soit l'appelant.
 */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Supprimer', acknowledgeLabel, optionLabel,
  onConfirm, onCancel, loading = false,
}: ConfirmDialogProps) {
  const [acked, setAcked] = useState(false)
  const [option, setOption] = useState(false)

  // Réinitialise les cases à chaque (ré)ouverture.
  useEffect(() => { if (open) { setAcked(false); setOption(false) } }, [open])

  // Fermeture sur Escape (ignorée pendant le traitement).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel, loading])

  if (!open) return null

  const confirmDisabled = loading || (!!acknowledgeLabel && !acked)

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => { if (!loading) onCancel() }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-lg p-5 flex flex-col gap-4 anim-dialog">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display font-semibold text-[var(--fs-h3)] text-[var(--text)]">{title}</h2>
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">{message}</p>
        </div>

        {acknowledgeLabel && (
          <label className="flex items-start gap-2 text-[var(--fs-sm)] text-[var(--text)] cursor-pointer">
            <input
              type="checkbox"
              checked={acked}
              onChange={e => setAcked(e.target.checked)}
              disabled={loading}
              className="accent-[var(--danger)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
            />
            <span>{acknowledgeLabel}</span>
          </label>
        )}

        {optionLabel && (
          <label className="flex items-start gap-2 text-[var(--fs-sm)] text-[var(--text)] cursor-pointer">
            <input
              type="checkbox"
              checked={option}
              onChange={e => setOption(e.target.checked)}
              disabled={loading}
              className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
            />
            <span>{optionLabel}</span>
          </label>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Annuler</Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(option)}
            disabled={confirmDisabled}
            className="!bg-[var(--danger)] hover:!bg-[var(--danger)]/90"
          >
            {loading ? '…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
