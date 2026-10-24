import { FileText } from 'lucide-react'

/** Miniature d'un document (photo) : pictogramme sinon. */
export function MiniatureDoc({ mime, url, taille = 'md' }: { mime: string | null; url: string | undefined; taille?: 'md' | 'lg' }) {
  const dim = taille === 'lg' ? 'h-20 w-20' : 'h-11 w-11'
  return (
    <span className={`${dim} shrink-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] overflow-hidden flex items-center justify-center text-[var(--text-disabled)]`}>
      {url && mime?.startsWith('image/') ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <FileText size={taille === 'lg' ? 26 : 18} />}
    </span>
  )
}
