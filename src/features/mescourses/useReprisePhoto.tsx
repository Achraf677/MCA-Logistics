import { useRef } from 'react'

/** Ouvre la caméra / la galerie par programme (geste « Reprendre » d'une visionneuse). */
export function useReprisePhoto(onFichier: (f: File) => void, accept = 'image/*') {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input ref={ref} type="file" accept={accept} capture="environment" className="hidden"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFichier(f) }} />
  )
  return { input, ouvrir: () => ref.current?.click() }
}
