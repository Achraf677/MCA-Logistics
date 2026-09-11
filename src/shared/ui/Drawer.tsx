import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export function Drawer({ open, onClose, title, children, width = 'max-w-lg' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus trap
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  // Portail vers <body> : même raison que ConfirmDialog — un ancêtre en
  // `backdrop-filter` / `transform` capturerait le positionnement `fixed`.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop — volontairement SANS backdrop-blur : flouter tout l'arrière-plan
          force le navigateur à re-rasteriser la page entière à chaque repaint,
          donc à chaque frappe dans le formulaire du drawer. */}
      <div
        className="absolute inset-0 bg-black/60 anim-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex flex-col w-full ${width} bg-[var(--bg-elevated)] border-l border-[var(--border)] h-full overflow-hidden outline-none anim-drawer`}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-[var(--topbar-h)] px-5 border-b border-[var(--border)] shrink-0">
          <h2 className="font-display font-semibold text-[var(--fs-h2)] text-[var(--text)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-md)] transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
