import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { useToast } from './useToast'

interface Props {
  /** Async : throw pour signaler une erreur (affichée en toast). */
  onDelete: () => Promise<void>
  confirmTitle?: string
  confirmMessage?: string
  disabled?: boolean
  className?: string
}

/**
 * Bouton "Supprimer" partagé : ouvre une ConfirmDialog, gère le loading,
 * toast l'erreur si onDelete throw. Le caller gère le succès (onSaved + onClose).
 */
export function DeleteButton({
  onDelete,
  confirmTitle   = 'Supprimer cet enregistrement ?',
  confirmMessage = 'Cette action est irréversible.',
  disabled,
  className,
}: Props) {
  const { toast } = useToast()
  const [open, setOpen]       = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    try {
      await onDelete()
      setOpen(false)
    } catch (e: unknown) {
      toast((e as Error).message ?? 'Erreur lors de la suppression', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="compact"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`text-[var(--danger)] ${className ?? ''}`}
      >
        <Trash2 size={14} />
        Supprimer
      </Button>

      <ConfirmDialog
        open={open}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Supprimer"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        loading={deleting}
      />
    </>
  )
}
