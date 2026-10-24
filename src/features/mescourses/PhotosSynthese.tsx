import { useEffect, useRef, useState } from 'react'
import { Camera, Images, Loader2, Trash2 } from 'lucide-react'
import { useToast } from '../../shared/ui/useToast'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { ajouterPhotoSynthese, photosSynthese, retirerPhotoSynthese, urlPhotoArret } from '../../shared/lib/tourneesColis.queries'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'

const BTN = 'min-h-14 px-3 inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] text-base font-semibold border border-[var(--border)] text-[var(--text)] disabled:opacity-40 active:scale-[0.98]'

/** Vignette d'une photo (lien signé chargé à la demande) ; un appui l'ouvre en grand. */
function Vignette({ doc, onRetirer }: { doc: DocumentRow; onRetirer?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let annule = false
    urlPhotoArret(doc).then(u => { if (!annule) setUrl(u) })
    return () => { annule = true }
  }, [doc])
  return (
    <div className="relative size-24 shrink-0 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
      {url ? (
        <button type="button" onClick={() => ouvrirDocument(url, { titre: 'Synthèse de tournée', type: 'image' })} aria-label="Voir la photo" className="size-full"><img src={url} alt="Synthèse" className="size-full object-cover" /></button>
      ) : <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-[var(--text-muted)]" />}
      {onRetirer && (
        <button type="button" onClick={onRetirer} aria-label="Retirer la photo"
          className="absolute top-1 right-1 size-8 inline-flex items-center justify-center rounded-full bg-black/70 text-white">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

/**
 * Photos de la synthèse de fin de tournée : plusieurs photos possibles, prises avec l'appareil ou choisies
 * dans la galerie. Chaque photo part tout de suite (rien à perdre si on quitte l'écran).
 */
export function PhotosSynthese({ tourneeId, companyId, modifiable = true, onNombre }: {
  tourneeId: string
  companyId: string | null
  /** Retrait des photos possible (tournée pas encore clôturée) ; l'ajout reste possible après. */
  modifiable?: boolean
  onNombre?: (n: number) => void
}) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [envoi, setEnvoi] = useState(0)
  const appareil = useRef<HTMLInputElement>(null)
  const galerie = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let annule = false
    photosSynthese([tourneeId]).then(({ data, error }) => {
      if (annule) return
      if (error) toast(error.message, 'error')
      setDocs(data); onNombre?.(data.length)
    })
    return () => { annule = true }
  }, [tourneeId]) // eslint-disable-line react-hooks/exhaustive-deps -- chargé une fois par tournée

  const ajouter = async (fichiers: FileList | null) => {
    const liste = [...(fichiers ?? [])]
    if (appareil.current) appareil.current.value = ''
    if (galerie.current) galerie.current.value = ''
    if (!liste.length || !companyId) return
    setEnvoi(n => n + liste.length)
    for (const f of liste) {
      const { data, error } = await ajouterPhotoSynthese(f, companyId, tourneeId)
      setEnvoi(n => n - 1)
      if (error || !data) { toast(error?.message ?? 'Photo non enregistrée', 'error'); continue }
      setDocs(prev => { const m = [...prev, data]; onNombre?.(m.length); return m })
    }
  }

  const retirer = async (doc: DocumentRow) => {
    const { error } = await retirerPhotoSynthese(doc)
    if (error && !/non effacé/i.test(error.message)) { toast(error.message, 'error'); return }
    setDocs(prev => { const m = prev.filter(d => d.id !== doc.id); onNombre?.(m.length); return m })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={BTN} onClick={() => appareil.current?.click()}><Camera size={20} /> Prendre une photo</button>
        <button type="button" className={BTN} onClick={() => galerie.current?.click()}><Images size={20} /> Galerie</button>
      </div>
      <input ref={appareil} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => ajouter(e.target.files)} />
      <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={e => ajouter(e.target.files)} />
      {(docs.length > 0 || envoi > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {docs.map(d => <Vignette key={d.id} doc={d} onRetirer={modifiable ? () => retirer(d) : undefined} />)}
          {Array.from({ length: envoi }, (_, i) => (
            <div key={`e${i}`} className="size-24 shrink-0 rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] inline-flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
