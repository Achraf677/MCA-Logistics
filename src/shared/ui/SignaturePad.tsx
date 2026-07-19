// Pad de signature tactile (canvas HTML5) — pour la lettre de voiture.
// Fonctionne doigt / stylet / souris. Export PNG data URL via toDataURL.
//
// Contrat :
//   - onCommit(png) est appelé quand l'utilisateur clique « Valider ».
//   - onClear est optionnel : appelé après effacement (utile pour ré-inviter à signer).
//   - `disabled` verrouille le pad (mode consultation d'une signature déjà validée).
//
// Aucun état côté parent nécessaire pendant la saisie : tout est buffered dans
// le canvas. Le tracé se fait uniquement au trait souple (lineJoin='round') pour
// une signature lisible même sur écran tactile petit.

import { useRef, useState, useEffect } from 'react'

interface Props {
  /** Signature déjà validée (data URL PNG) — affichée en aperçu, pad désactivé. */
  value?: string | null
  /** Callback quand l'utilisateur clique « Valider ». */
  onCommit: (png: string) => void
  /** Callback quand la signature est effacée. */
  onClear?: () => void
  /** Verrouille la saisie (lecture seule). */
  disabled?: boolean
  /** Hauteur du canvas en px (défaut 140). */
  height?: number
  /** Label affiché au-dessus du pad. */
  label?: string
}

export function SignaturePad({
  value, onCommit, onClear, disabled, height = 140, label,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPtRef  = useRef<{ x: number; y: number } | null>(null)
  const [hasStroke, setHasStroke] = useState(false)

  // Redimensionne au container. Le canvas garde son ratio pixels ↔ CSS pour
  // ne pas pixeliser sur écrans HiDPI (iPad, écrans Retina).
  useEffect(() => {
    const c = canvasRef.current
    if (!c || value) return  // pas de resize si déjà validée
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = c.clientHeight
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
  }, [value])

  const posFromEvent = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || value) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drawingRef.current = true
    const p = posFromEvent(e)
    lastPtRef.current = p
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = posFromEvent(e)
    const last = lastPtRef.current
    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    lastPtRef.current = p
    if (!hasStroke) setHasStroke(true)
  }

  const onUp = () => {
    drawingRef.current = false
    lastPtRef.current = null
  }

  const handleClear = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    setHasStroke(false)
    onClear?.()
  }

  const handleCommit = () => {
    const c = canvasRef.current
    if (!c) return
    // Export au format PNG. On garde la résolution native du canvas (DPR appliqué),
    // ce qui donne une signature nette dans le PDF.
    const png = c.toDataURL('image/png')
    onCommit(png)
  }

  // Mode "signature validée" : on affiche l'aperçu, sans pad interactif.
  if (value) {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
            {label}
          </label>
        )}
        <div className="rounded-[var(--r-md)] border border-[var(--success)]/40 bg-[var(--success)]/5 p-2">
          <img src={value} alt="Signature" className="block w-full h-auto" />
        </div>
        {!disabled && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="self-start text-[var(--fs-xs)] text-[var(--text-muted)]
              hover:text-[var(--danger)] transition-colors underline"
          >
            Effacer et re-signer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: 'none' }}
        className={`w-full rounded-[var(--r-md)] border border-[var(--border)] bg-white
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCommit}
          disabled={disabled || !hasStroke}
          className="px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--brand)] text-white text-[var(--fs-xs)]
            font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Valider la signature
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || !hasStroke}
          className="px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] text-[var(--fs-xs)]
            text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--brand)]
            transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Effacer
        </button>
      </div>
    </div>
  )
}

/** Géoloc navigator (Promise). Renvoie null si refusée / indisponible. */
export function tryGeoloc(): Promise<{ lat: number; lng: number; acc?: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        acc: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : undefined,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30_000 },
    )
  })
}
