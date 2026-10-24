import { useEffect, useRef, type KeyboardEventHandler, type ReactNode, type RefObject } from 'react'
import { Search, X } from 'lucide-react'

/**
 * Barre de recherche commune à tout le site : pastille arrondie qui s'illumine à la saisie (halo de la marque, loupe
 * colorée), bouton « effacer », compteur de résultats, raccourci « / » (focus depuis n'importe où sur la page) et
 * Échap (efface, puis quitte le champ). Une seule barre par écran porte le raccourci (`raccourci`) ; la dernière
 * affichée l'emporte.
 */

// Pile des champs qui répondent au raccourci « / » : le plus récent (l'écran ouvert) passe en premier.
const pile: HTMLInputElement[] = []
let ecouteur: ((e: KeyboardEvent) => void) | null = null

function surTouche(e: KeyboardEvent) {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
  const cible = e.target as HTMLElement | null
  if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT' || cible.isContentEditable)) return
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].offsetParent !== null) { e.preventDefault(); pile[i].focus(); pile[i].select(); return }
  }
}

function inscrire(champ: HTMLInputElement) {
  pile.push(champ)
  if (!ecouteur) { ecouteur = surTouche; document.addEventListener('keydown', ecouteur) }
}
function retirer(champ: HTMLInputElement) {
  const i = pile.indexOf(champ)
  if (i >= 0) pile.splice(i, 1)
  if (pile.length === 0 && ecouteur) { document.removeEventListener('keydown', ecouteur); ecouteur = null }
}

export function BarreRecherche({
  value, onChange, placeholder, ariaLabel, autoFocus = false, raccourci = false, compteur, droite,
  taille = 'md', className = '', onKeyDown, onFocus, onEffacer, inputRef, enterKeyHint,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel?: string
  autoFocus?: boolean
  /** Répond à la touche « / » (une barre par écran). */
  raccourci?: boolean
  /** « 12 résultats » : affiché à droite tant qu'on cherche. */
  compteur?: string | null
  /** Geste placé dans la pastille, à droite (ex. « + » ajouter). */
  droite?: ReactNode
  taille?: 'md' | 'sm'
  className?: string
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onFocus?: () => void
  /** Appelé en plus de `onChange('')` quand on efface (bouton ou Échap). */
  onEffacer?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  enterKeyHint?: 'search' | 'enter' | 'go'
}) {
  const interne = useRef<HTMLInputElement | null>(null)
  const ref = inputRef ?? interne

  useEffect(() => {
    const champ = ref.current
    if (!raccourci || !champ) return
    inscrire(champ)
    return () => retirer(champ)
  }, [raccourci, ref])

  const efface = () => { onChange(''); onEffacer?.(); ref.current?.focus() }
  const haut = taille === 'sm' ? 'h-9' : 'h-10'

  return (
    <div className={`group relative flex items-center gap-2 ${haut} min-w-0 rounded-full border border-[var(--border)] bg-[var(--bg-card)] pl-3.5 pr-2 transition-[border-color,box-shadow,background-color] duration-200
      hover:border-[var(--border-strong)] focus-within:border-[var(--brand)] focus-within:bg-[var(--bg-elevated)]
      focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_16%,transparent)] ${className}`}>
      <Search size={taille === 'sm' ? 15 : 16} aria-hidden="true"
        className="shrink-0 text-[var(--text-disabled)] transition-all duration-200 group-focus-within:text-[var(--brand)] group-focus-within:scale-110" />
      <input
        ref={ref} value={value} autoFocus={autoFocus} type="search" autoComplete="off" spellCheck={false} enterKeyHint={enterKeyHint}
        onChange={e => onChange(e.target.value)} onFocus={onFocus}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            if (value) { e.preventDefault(); e.stopPropagation(); efface() } else ref.current?.blur()
          }
          onKeyDown?.(e)
        }}
        placeholder={placeholder} aria-label={ariaLabel ?? placeholder}
        className="flex-1 min-w-0 h-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-disabled)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && compteur && <span className="hidden sm:inline shrink-0 text-xs text-[var(--text-muted)] tabular-nums">{compteur}</span>}
      {value ? (
        <button type="button" onClick={efface} aria-label="Effacer la recherche" title="Effacer (Échap)"
          className="shrink-0 size-6 inline-flex items-center justify-center rounded-full bg-[var(--text-muted)]/15 text-[var(--text-muted)] hover:bg-[var(--text-muted)]/30 hover:text-[var(--text)] transition-colors">
          <X size={13} />
        </button>
      ) : raccourci ? (
        <kbd aria-hidden="true" className="hidden sm:inline-flex group-focus-within:hidden shrink-0 h-5 min-w-5 px-1.5 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] text-[0.6875rem] font-mono text-[var(--text-muted)]">/</kbd>
      ) : null}
      {droite}
    </div>
  )
}
