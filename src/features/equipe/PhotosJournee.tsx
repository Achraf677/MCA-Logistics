import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, X, ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { urlPhoto } from '../../shared/lib/journeesColis.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'

/**
 * Photos d'une journée de colis (compteur de l'appareil) : vignettes, agrandissables en
 * plein écran. Liens signés (bucket privé, 1 h), demandés à l'affichage.
 */
export function PhotosJournee({ docs, taille = 'md' }: { docs: DocumentRow[]; taille?: 'sm' | 'md' }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  const [ouverte, setOuverte] = useState<number | null>(null)

  useEffect(() => {
    let vivant = true
    Promise.all(docs.map(async d => [d.id, await urlPhoto(d)] as const)).then(paires => {
      if (vivant) setUrls(Object.fromEntries(paires))
    })
    return () => { vivant = false }
  }, [docs])

  if (docs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--warning)]">
        <ImageOff size={14} /> Aucune photo du compteur
      </div>
    )
  }

  const cote = taille === 'sm' ? 'w-[4.5rem] h-[4.5rem]' : 'w-[6.5rem] h-[6.5rem]'
  const estImage = (d: DocumentRow) => (d.mime_type ?? '').startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(d.file_name)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {docs.map((d, i) => {
          const u = urls[d.id]
          return (
            <button key={d.id} type="button" onClick={() => setOuverte(i)} title="Agrandir"
              className={`${cote} rounded-[var(--r-md)] overflow-hidden border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center hover:border-[var(--border-strong)]`}>
              {u === undefined ? (
                <span className="text-xs text-[var(--text-disabled)]">…</span>
              ) : u && estImage(d) ? (
                <img src={u} alt={d.file_name} loading="lazy" className="w-full h-full object-cover" />
              ) : u ? (
                <FileText size={20} className="text-[var(--text-muted)]" />
              ) : (
                <ImageOff size={18} className="text-[var(--text-disabled)]" />
              )}
            </button>
          )
        })}
      </div>
      {ouverte != null && docs[ouverte] && createPortal(
        <Visionneuse
          url={urls[docs[ouverte].id] ?? null}
          nom={docs[ouverte].file_name}
          image={estImage(docs[ouverte])}
          position={`${ouverte + 1} / ${docs.length}`}
          onFermer={() => setOuverte(null)}
          onPrecedente={docs.length > 1 ? () => setOuverte((ouverte - 1 + docs.length) % docs.length) : undefined}
          onSuivante={docs.length > 1 ? () => setOuverte((ouverte + 1) % docs.length) : undefined}
        />,
        document.body,
      )}
    </>
  )
}

function Visionneuse({ url, nom, image, position, onFermer, onPrecedente, onSuivante }: {
  url: string | null; nom: string; image: boolean; position: string
  onFermer: () => void; onPrecedente?: () => void; onSuivante?: () => void
}) {
  useEffect(() => {
    // Écoute en capture sur window : Échap ferme la photo SANS fermer le tiroir dessous.
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onFermer() }
      if (e.key === 'ArrowLeft') onPrecedente?.()
      if (e.key === 'ArrowRight') onSuivante?.()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onFermer, onPrecedente, onSuivante])

  const bouton = 'w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80'
  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="flex items-center gap-3 px-4 py-3 text-white text-sm">
        <span className="truncate flex-1">{nom} · {position}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={bouton} title="Ouvrir dans un onglet">
            <ExternalLink size={16} />
          </a>
        )}
        <button type="button" className={bouton} onClick={onFermer} title="Fermer"><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 pb-4" onClick={onFermer}>
        {onPrecedente && (
          <button type="button" className={bouton} onClick={e => { e.stopPropagation(); onPrecedente() }} title="Précédente">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0 h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
          {!url ? (
            <p className="text-white/80 text-sm">Photo introuvable (lien expiré ou fichier retiré).</p>
          ) : image ? (
            <img src={url} alt={nom} className="max-w-full max-h-full object-contain rounded-[var(--r-md)]" />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-white underline text-sm">Ouvrir le fichier</a>
          )}
        </div>
        {onSuivante && (
          <button type="button" className={bouton} onClick={e => { e.stopPropagation(); onSuivante() }} title="Suivante">
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  )
}
