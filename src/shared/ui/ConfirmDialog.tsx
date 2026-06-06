import { useEffect, useState } from 'react'
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
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

/**
 * Modale de confirmation réutilisable (à utiliser pour toute action destructive/irréversible).
 * Bouton de confirmation en rouge (danger) + Annuler. Pas de saisie texte.
 */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Supprimer', acknowledgeLabel,
  onConfirm, onCancel, loading = false,
}: ConfirmDialogProps) {
  const [acked, setAcked] = useState(false)

  // Réinitialise la case à chaque (ré)ouverture.
  useEffect(() => { if (open) setAcked(false) }, [open])

  // Fermeture sur Escape (ignorée pendant le traitement).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel, loading])

  if (!open) return null

  const confirmDisabled = loading || (!!acknowledgeLabel && !acked)

  return (
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
      <div className="relative w-full max-w-sm bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-lg p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
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

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Annuler</Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="!bg-[var(--danger)] hover:!bg-[var(--danger)]/90"
          >
            {loading ? '…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
