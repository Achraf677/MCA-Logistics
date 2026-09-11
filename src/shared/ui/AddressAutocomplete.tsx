import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Loader2 } from 'lucide-react'
import { parsePhotonResponse, photonUrl } from '../lib/photon'
import type { AddressSuggestion } from '../lib/photon'

interface Props {
  value: string
  onChange: (address: string) => void
  onSelect: (s: AddressSuggestion) => void
  placeholder?: string
  label?: string
  disabled?: boolean
}

const MIN_CHARS = 3
const DEBOUNCE_MS = 300

const inputCls = 'field'
/**
 * Champ d'adresse avec autocomplétion + géocodage via Photon (Komoot/OSM, UE, sans clé).
 * Saisie libre toujours permise : `onChange` reflète le texte ; `onSelect` ne se
 * déclenche qu'en cas de choix dans la liste (avec lat/lng).
 *
 * La liste est rendue dans un PORTAIL vers <body>, positionnée en `fixed` sous
 * le champ. En `absolute` dans le flux, elle était rognée par le conteneur
 * défilant du drawer (`overflow-y-auto`) dès qu'elle dépassait le bas du
 * panneau : on ne voyait que les premières lignes. Même famille de bug que les
 * modales rognées par un ancêtre `backdrop-filter`.
 */
export function AddressAutocomplete({
  value, onChange, onSelect, placeholder, label, disabled,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // Signale un échec réseau Photon → petit hint sous l'input. Le save-time
  // geocode (Edge `geocode`, BAN) prend le relais, donc l'utilisateur n'est
  // pas bloqué : l'adresse tapée sera quand même localisée à l'enregistrement.
  const [suggestFailed, setSuggestFailed] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  /**
   * Dernière adresse choisie dans la liste. Tant que le champ vaut exactement
   * cette valeur, on ne relance aucune recherche.
   *
   * Remplace un drapeau booléen à usage unique, qui ne protégeait que le rendu
   * suivant immédiat : si le parent retouchait la valeur après coup (reformatage,
   * second `set`), un rendu ultérieur relançait la recherche et la liste se
   * rouvrait toute seule sur l'adresse déjà choisie. Comparer la valeur est
   * insensible au nombre de rendus.
   */
  const dernierChoix = useRef<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  /** Position de la liste, calculée depuis le champ (référentiel écran). */
  const majPosition = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  // Debounce + fetch Photon.
  useEffect(() => {
    const q = value.trim()
    if (dernierChoix.current !== null && q === dernierChoix.current) return

    if (q.length < MIN_CHARS) {
      setSuggestions([]); setOpen(false); setLoading(false); setSuggestFailed(false); return
    }

    setLoading(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(photonUrl(q), { signal: ctrl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const parsed = parsePhotonResponse(json)
        setSuggestions(parsed)
        setOpen(parsed.length > 0)
        setSuggestFailed(false)
      } catch (err) {
        // AbortError = frappe suivante : normal, on n'affiche rien.
        // Autre erreur = Photon inaccessible : hint discret, saisie libre OK.
        if ((err as Error)?.name !== 'AbortError') setSuggestFailed(true)
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => { clearTimeout(timer); ctrl.abort() }
  }, [value])

  // Position initiale + suivi du défilement et du redimensionnement. En `fixed`,
  // la liste ne suit plus le champ toute seule : sans ça elle resterait en
  // place pendant qu'on fait défiler le drawer.
  useEffect(() => {
    if (!open) return
    majPosition()
    const suivre = () => majPosition()
    // `true` = phase de capture, pour attraper le défilement de N'IMPORTE quel
    // conteneur parent, pas seulement celui de la fenêtre.
    window.addEventListener('scroll', suivre, true)
    window.addEventListener('resize', suivre)
    return () => {
      window.removeEventListener('scroll', suivre, true)
      window.removeEventListener('resize', suivre)
    }
  }, [open, majPosition])

  // Fermeture au clic extérieur. La liste vivant hors de `boxRef` (portail),
  // elle doit être testée séparément, sinon cliquer dedans fermerait le menu
  // avant que le clic n'atteigne le bouton.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const cible = e.target as Node
      if (boxRef.current?.contains(cible)) return
      if (listRef.current?.contains(cible)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handlePick = (s: AddressSuggestion) => {
    dernierChoix.current = s.address.trim()
    onChange(s.address)
    onSelect(s)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1" ref={boxRef}>
      {label && (
        <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) { majPosition(); setOpen(true) } }}
          autoComplete="off"
          className={inputCls}
        />
        {loading && (
          <Loader2
            size={16}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
          />
        )}
      </div>

      {open && suggestions.length > 0 && rect && createPortal(
        <ul
          ref={listRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-[70] max-h-60 overflow-auto rounded-[var(--r-md)]
            bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg py-1"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.lat},${s.lng},${i}`}>
              <button
                type="button"
                onClick={() => handlePick(s)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left text-[var(--fs-sm)]
                  text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span>{s.address}</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}

      {suggestFailed && !loading && (
        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] italic">
          Suggestions indisponibles — l'adresse sera localisée à l'enregistrement.
        </span>
      )}
    </div>
  )
}
