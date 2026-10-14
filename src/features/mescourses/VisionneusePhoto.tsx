import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, X, type LucideIcon } from 'lucide-react'

/**
 * Photo en plein écran, avec les gestes qui vont avec (reprendre, retirer, garder).
 * C'est LE manque reproché à l'ancien bouton « Ticket » : le salarié envoyait sa
 * photo sans jamais la voir. Ici il la regarde en grand avant de décider.
 *
 * Rendue dans <body> (portail) : rien de la page ne la rogne.
 */
export interface ActionVisionneuse {
  libelle: string
  icone?: LucideIcon
  onClick: () => void
  ton?: 'primaire' | 'danger' | 'neutre'
  disabled?: boolean
}

export function VisionneusePhoto({ src, titre, onFermer, actions = [], enfant }: {
  src: string | null
  titre?: string
  onFermer: () => void
  actions?: ActionVisionneuse[]
  /** Contenu à la place de l'image (ex. un PDF qu'on ne sait pas afficher). */
  enfant?: ReactNode
}) {
  const fermerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', onKey)
    fermerRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onFermer])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={titre ?? 'Photo'}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
      <div className="flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{titre}</span>
        <button ref={fermerRef} onClick={onFermer} aria-label="Fermer"
          className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <X size={22} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-2" onClick={onFermer}>
        {enfant ?? (src
          ? <img src={src} alt={titre ?? 'Photo'} onClick={e => e.stopPropagation()}
              className="max-w-full max-h-full object-contain select-none" />
          : <span className="text-sm text-white/70">Chargement de la photo…</span>)}
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {actions.map(a => {
            const Icone = a.icone
            const ton = a.ton === 'primaire' ? 'bg-[var(--brand)] text-white'
              : a.ton === 'danger' ? 'bg-[var(--danger)]/90 text-white' : 'bg-white/15 text-white'
            return (
              <button key={a.libelle} onClick={a.onClick} disabled={a.disabled}
                className={`flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] text-sm font-medium disabled:opacity-50 ${ton}`}>
                {Icone && <Icone size={18} />} {a.libelle}
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body,
  )
}

/**
 * Deux gros boutons : « Prendre une photo » (caméra arrière) et « Choisir »
 * (galerie / fichiers). Les deux rendent le fichier choisi, sans rien envoyer.
 */
export function ChoixPhoto({ onFichier, accept = 'image/*', disabled, libellePrendre = 'Prendre une photo' }: {
  onFichier: (f: File) => void
  accept?: string
  disabled?: boolean
  libellePrendre?: string
}) {
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const lire = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // reprendre la même photo doit redéclencher le choix
    if (f) onFichier(f)
  }
  return (
    <div className="flex gap-2">
      <input ref={camRef} type="file" accept={accept} capture="environment" className="hidden" onChange={lire} />
      <input ref={galRef} type="file" accept={accept} className="hidden" onChange={lire} />
      <button type="button" onClick={() => camRef.current?.click()} disabled={disabled}
        className="flex-[2] min-h-12 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)]
          bg-[var(--brand)] text-white text-sm font-medium disabled:opacity-50">
        <Camera size={18} /> {libellePrendre}
      </button>
      <button type="button" onClick={() => galRef.current?.click()} disabled={disabled}
        className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)]
          border border-[var(--border)] text-[var(--text)] text-sm font-medium disabled:opacity-50">
        <ImagePlus size={18} /> Choisir
      </button>
    </div>
  )
}
