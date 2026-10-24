import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { BarreRecherche } from './BarreRecherche'

export interface OptionListe { valeur: string; libelle: string; detail?: string }

/**
 * Liste déroulante du site : remplace le `<select>` natif. Le menu s'ouvre sous le champ (au-dessus s'il manque de
 * place), avec recherche intégrée dès 7 choix, navigation au clavier (↑ ↓ Entrée Échap) et coche sur le choix actuel.
 * Rendue dans <body> : jamais coupée par le défilement d'un tiroir.
 */
export function ListeDeroulante({
  valeur, onChange, options, placeholder = 'Choisir…', disabled = false, invalide = false, ariaLabel, recherche,
}: {
  valeur: string
  onChange: (valeur: string) => void
  options: OptionListe[]
  placeholder?: string
  disabled?: boolean
  invalide?: boolean
  ariaLabel?: string
  /** Force (true) ou interdit (false) la recherche ; par défaut dès 7 choix. */
  recherche?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [q, setQ] = useState('')
  const [actif, setActif] = useState(0)
  const [pos, setPos] = useState<{ gauche: number; largeur: number; haut?: number; bas?: number; max: number } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const avecRecherche = recherche ?? options.length >= 7

  const filtrees = useMemo(() => {
    const mot = q.trim().toLowerCase()
    return mot ? options.filter(o => `${o.libelle} ${o.detail ?? ''}`.toLowerCase().includes(mot)) : options
  }, [options, q])
  const choisi = options.find(o => o.valeur === valeur)

  const ouvre = () => {
    if (disabled || !bouton.current) return
    const r = bouton.current.getBoundingClientRect()
    const dessous = window.innerHeight - r.bottom - 12
    const dessus = r.top - 12
    const enHaut = dessous < 220 && dessus > dessous
    setPos({
      gauche: r.left, largeur: r.width, max: Math.max(160, Math.min(320, enHaut ? dessus : dessous)),
      ...(enHaut ? { bas: window.innerHeight - r.top + 6 } : { haut: r.bottom + 6 }),
    })
    setQ(''); setActif(Math.max(0, options.findIndex(o => o.valeur === valeur))); setOuvert(true)
  }
  const ferme = () => { setOuvert(false); bouton.current?.focus() }
  const choisit = (v: string) => { onChange(v); setOuvert(false); bouton.current?.focus() }

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      const c = e.target as Node
      if (!menu.current?.contains(c) && !bouton.current?.contains(c)) setOuvert(false)
    }
    const defile = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    window.addEventListener('scroll', defile, true)
    window.addEventListener('resize', defile)
    return () => {
      document.removeEventListener('pointerdown', dehors)
      window.removeEventListener('scroll', defile, true)
      window.removeEventListener('resize', defile)
    }
  }, [ouvert])

  // L'option active reste visible quand on navigue au clavier.
  useEffect(() => {
    if (ouvert) menu.current?.querySelector<HTMLElement>('[data-actif="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [actif, ouvert])

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif(a => Math.min(filtrees.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtrees[actif]; if (o) choisit(o.valeur) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ferme() }
  }

  return (
    <>
      <button ref={bouton} type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={ouvert}
        onClick={() => (ouvert ? ferme() : ouvre())}
        onKeyDown={e => { if (!ouvert && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); ouvre() } }}
        className={`field w-full flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed transition-[border-color,box-shadow]
          ${invalide ? '!border-[var(--danger)]' : ''} ${ouvert ? '!border-[var(--brand)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_16%,transparent)]' : ''}`}>
        <span className={`truncate ${choisi ? 'text-[var(--text)]' : 'text-[var(--text-disabled)]'}`}>{choisi?.libelle ?? placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${ouvert ? 'rotate-180 text-[var(--brand)]' : ''}`} />
      </button>

      {ouvert && pos && createPortal(
        <div ref={menu} onKeyDown={clavier}
          className="fixed z-[90] flex flex-col rounded-[var(--r-lg)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden anim-backdrop"
          style={{ left: pos.gauche, width: pos.largeur, top: pos.haut, bottom: pos.bas, maxHeight: pos.max }}>
          {avecRecherche && (
            <div className="p-2 border-b border-[var(--border)] shrink-0">
              <BarreRecherche value={q} onChange={v => { setQ(v); setActif(0) }} placeholder="Chercher…" autoFocus taille="sm" onKeyDown={clavier} />
            </div>
          )}
          <ul role="listbox" className="overflow-y-auto py-1" tabIndex={-1} onKeyDown={clavier}>
            {filtrees.length === 0 && <li className="px-3 py-2 text-sm text-[var(--text-muted)]">Aucun résultat</li>}
            {filtrees.map((o, i) => {
              const courant = o.valeur === valeur
              return (
                <li key={o.valeur} role="option" aria-selected={courant} data-actif={i === actif}>
                  <button type="button" onClick={() => choisit(o.valeur)} onMouseEnter={() => setActif(i)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${i === actif ? 'bg-[var(--brand)]/12' : ''} ${courant ? 'text-[var(--brand)] font-medium' : 'text-[var(--text)]'}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{o.libelle}</span>
                      {o.detail && <span className="block truncate text-xs text-[var(--text-muted)]">{o.detail}</span>}
                    </span>
                    {courant && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
