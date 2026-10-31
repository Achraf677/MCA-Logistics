import { useState } from 'react'
import { Camera, Check, Flag, Pause, X } from 'lucide-react'
import { PhotosSynthese } from './PhotosSynthese'

/** Une ligne de contrôle : coche verte si fait, croix rouge sinon. */
function Controle({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-2 text-base font-semibold ${ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
      <span className={`size-7 shrink-0 inline-flex items-center justify-center rounded-full ${ok ? 'bg-[var(--success)] text-black' : 'bg-[var(--danger)] text-white'}`}>
        {ok ? <Check size={18} /> : <X size={18} />}
      </span>
      <span className="text-[var(--text)]">{children}</span>
    </p>
  )
}

/**
 * Clôture de la tournée (feuille qui monte du bas) : deux contrôles, tous les arrêts traités (une pause ne compte pas)
 * et au moins une photo de la synthèse. « Terminer » n'est possible que si les deux sont verts.
 */
export function FeuilleCloture({ tourneeId, companyId, resume, restants, enPause, enCours, onTerminer, onFermer }: {
  tourneeId: string
  companyId: string | null
  resume: string
  restants: number
  enPause: number
  enCours: boolean
  onTerminer: () => void
  onFermer: () => void
}) {
  const [nb, setNb] = useState(0)
  const pret = restants === 0 && nb > 0
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
          <Controle ok={restants === 0}>
            {restants === 0 ? 'Tous les arrêts sont traités' : `Il reste ${restants} arrêt${restants > 1 ? 's' : ''} à traiter`}
          </Controle>
          {enPause > 0 && (
            <p className="flex items-center gap-2 text-sm text-[var(--warning)]"><Pause size={14} /> dont {enPause} en pause : à reprendre et traiter</p>
          )}
          {restants > 0 && (
            <button type="button" onClick={onFermer}
              className="min-h-12 px-4 inline-flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border-strong)] text-base font-semibold text-[var(--text)]">
              Voir les arrêts restants
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-[var(--r-lg)] border border-[var(--border)]">
          <Controle ok={nb > 0}>{nb > 0 ? `Photo de la synthèse (${nb})` : 'Photo de la synthèse manquante'}</Controle>
          <PhotosSynthese tourneeId={tourneeId} companyId={companyId} onNombre={setNb} />
        </div>

        <button type="button" disabled={enCours || !pret} onClick={onTerminer}
          className="min-h-16 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] text-lg font-bold bg-[var(--success)] text-black disabled:opacity-40 active:scale-[0.98]">
          {pret ? <Flag size={22} /> : <Camera size={22} />} {pret ? 'Terminer' : 'À compléter pour terminer'}
        </button>
        <button type="button" onClick={onFermer} className="min-h-12 inline-flex items-center justify-center text-base text-[var(--text-muted)] underline">
          Pas maintenant
        </button>
      </div>
    </div>
  )
}
