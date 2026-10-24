import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, X } from 'lucide-react'

/**
 * Visionneuse de document dans l'appli : un PDF ou une photo s'ouvre en plein écran SANS changer d'onglet.
 * `ouvrirDocument(url, { titre, type })` s'appelle de n'importe où (aucun contexte à brancher) ; une seule
 * `<VisionneuseDocument />` est montée à la racine. Échap ou clic hors du document : fermeture.
 * Un site qui interdit l'affichage intégré garde la sortie « Ouvrir dans un onglet » en haut.
 */

export type TypeDocument = 'image' | 'pdf'
interface Document { url: string; titre?: string; type?: TypeDocument }

const EVENEMENT = 'mca:ouvrir-document'

export function ouvrirDocument(url: string, opts: { titre?: string; type?: TypeDocument } = {}): void {
  window.dispatchEvent(new CustomEvent<Document>(EVENEMENT, { detail: { url, ...opts } }))
}

/** Image ou PDF ? Le type annoncé gagne ; sinon l'extension du lien (avant `?`) ; sinon PDF (factures Pennylane). */
export function typeDeDocument(url: string, type?: TypeDocument): TypeDocument {
  if (type) return type
  const chemin = url.split('?')[0].toLowerCase()
  return /\.(png|jpe?g|webp|gif|avif|heic|svg)$/.test(chemin) ? 'image' : 'pdf'
}

export function VisionneuseDocument() {
  const [doc, setDoc] = useState<Document | null>(null)

  useEffect(() => {
    const ouvre = (e: Event) => setDoc((e as CustomEvent<Document>).detail)
    window.addEventListener(EVENEMENT, ouvre)
    return () => window.removeEventListener(EVENEMENT, ouvre)
  }, [])

  useEffect(() => {
    if (!doc) return
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setDoc(null) }
    document.addEventListener('keydown', touche)
    const defilement = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', touche); document.body.style.overflow = defilement }
  }, [doc])

  if (!doc) return null
  const type = typeDeDocument(doc.url, doc.type)
  const bouton = 'h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm inline-flex items-center gap-2 transition-colors'

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col anim-backdrop" role="dialog" aria-modal="true" aria-label={doc.titre ?? 'Document'}>
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{doc.titre ?? (type === 'pdf' ? 'Document' : 'Photo')}</span>
        <a href={doc.url} target="_blank" rel="noopener noreferrer" className={bouton} title="Ouvrir dans un onglet">
          <ExternalLink size={16} /> <span className="hidden sm:inline">Ouvrir dans un onglet</span>
        </a>
        <a href={doc.url} download className={bouton} title="Télécharger"><Download size={16} /></a>
        <button type="button" onClick={() => setDoc(null)} className={bouton} aria-label="Fermer" title="Fermer (Échap)"><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 px-3 pb-4 flex items-center justify-center" onClick={() => setDoc(null)}>
        <div className="w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
          {type === 'image'
            ? <img src={doc.url} alt={doc.titre ?? 'Photo'} className="max-w-full max-h-full object-contain rounded-[var(--r-md)]" />
            : <iframe src={doc.url} title={doc.titre ?? 'Document'} className="w-full h-full max-w-5xl rounded-[var(--r-md)] bg-white" />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
