import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import { PhotosSynthese } from './PhotosSynthese'

/**
 * Clôture de la tournée (feuille qui monte du bas) : résumé, photos de la synthèse de fin de tournée
 * (appareil ou galerie, plusieurs possibles), puis « Terminer ». Les photos partent dès qu'elles sont
 * prises ; au moins une photo est OBLIGATOIRE pour terminer (depuis le 30/10/2026).
 */
export function FeuilleCloture({ tourneeId, companyId, resume, enCours, onTerminer, onFermer }: {
  tourneeId: string
  companyId: string | null
  resume: string
  enCours: boolean
  onTerminer: () => void
  onFermer: () => void
}) {
  const [nb, setNb] = useState(0)
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Terminer ma tournée">
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[90vh] overflow-y-auto flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]
        rounded-t-[var(--r-xl,1.25rem)] bg-[var(--bg-elevated)] border-t border-[var(--border-strong)]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-[var(--text)]">Terminer ma tournée</p>
            <p className="text-base text-[var(--text-muted)]">{resume}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            className="size-12 shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]">
            <X size={22} />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-3 rounded-[var(--r-lg)] border border-[var(--border)]">
          <p className="text-base font-semibold text-[var(--text)]">Photo de la synthèse de fin de tournée</p>
          <PhotosSynthese tourneeId={tourneeId} companyId={companyId} onNombre={setNb} />
        </div>
        <button type="button" disabled={enCours || nb === 0} onClick={onTerminer}
          className="min-h-16 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] text-lg font-bold bg-[var(--success)] text-black disabled:opacity-40 active:scale-[0.98]">
          <Flag size={22} /> {nb > 0 ? `Terminer (${nb} photo${nb > 1 ? 's' : ''})` : 'Ajoute une photo pour terminer'}
        </button>
        <button type="button" onClick={onFermer} className="min-h-12 inline-flex items-center justify-center text-base text-[var(--text-muted)] underline">
          Pas maintenant
        </button>
      </div>
    </div>
  )
}
