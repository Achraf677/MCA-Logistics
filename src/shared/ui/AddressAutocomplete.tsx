import { useState, useEffect, useRef } from 'react'
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

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

/**
 * Champ d'adresse avec autocomplétion + géocodage via Photon (Komoot/OSM, UE, sans clé).
 * Saisie libre toujours permise : `onChange` reflète le texte ; `onSelect` ne se
 * déclenche qu'en cas de choix dans la liste (avec lat/lng).
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
  // Empêche une requête de se relancer juste après une sélection.
  const justSelected = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounce + fetch Photon.
  useEffect(() => {
    if (justSelected.current) { justSelected.current = false; return }
    const q = value.trim()
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

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handlePick = (s: AddressSuggestion) => {
    justSelected.current = true
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
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          autoComplete="off"
          className={inputCls}
        />
        {loading && (
          <Loader2
            size={16}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
          />
        )}

        {open && suggestions.length > 0 && (
          <ul className="absolute z-[70] left-0 right-0 mt-1 max-h-60 overflow-auto rounded-[var(--r-md)]
            bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg py-1">
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
          </ul>
        )}
      </div>
      {suggestFailed && !loading && (
        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] italic">
          Suggestions indisponibles — l'adresse sera localisée à l'enregistrement.
        </span>
      )}
    </div>
  )
}
