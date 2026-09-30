import { useState, useRef } from 'react'
import { Camera, Check } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { uploadDocument } from '../../shared/lib/documents.queries'
import { MOTIFS_PROBLEME, LIBELLE_MOTIF, type MotifProbleme } from '../../shared/lib/problemeTerrain'

/**
 * Signaler un ÉCHEC sur un arrêt : absent, refus, adresse introuvable…
 *
 * Avant, le seul geste de fin était « Livrer » : face à un client absent, le
 * chauffeur mentait ou laissait la course en suspens sans rien dire. Ici il
 * choisit un motif (un doigt), ajoute s'il veut une photo (avis de passage,
 * porte fermée) et un mot. La course RESTE OUVERTE : c'est le bureau, alerté,
 * qui décide — relivrer, rapporter au dépôt, annuler.
 */
export function PanneauProbleme({ courseId, busy, onValider, onAnnuler }: {
  courseId: string
  busy: boolean
  onValider: (motif: MotifProbleme, note: string | null) => void
  onAnnuler: () => void
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const [motif, setMotif] = useState<MotifProbleme | null>(null)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const prendrePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !companyId) return
    setEnvoi(true)
    const { error } = await uploadDocument(file, companyId, {
      entity_type: 'delivery', entity_id: courseId, category: 'Autre',
      notes: `Problème terrain${motif ? ` : ${LIBELLE_MOTIF[motif]}` : ''}`,
    })
    setEnvoi(false)
    if (error) { toast(error.message, 'error'); return }
    setPhotos(n => n + 1)
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--danger)] p-3">
      <span className="text-[var(--fs-sm)] font-semibold text-[var(--danger)]">Que se passe-t-il ?</span>

      <div className="grid grid-cols-2 gap-2">
        {MOTIFS_PROBLEME.map(m => (
          <button key={m} type="button" onClick={() => setMotif(m)}
            className={`min-h-[44px] px-2 rounded-[var(--r-md)] border text-[var(--fs-sm)] transition-colors ${
              motif === m
                ? 'border-[var(--danger)] bg-[var(--danger)] text-white'
                : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--danger)]'
            }`}>
            {LIBELLE_MOTIF[m]}
          </button>
        ))}
      </div>

      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300}
        placeholder="Un mot pour le bureau (facultatif) — ex. avis de passage laissé"
        className="w-full px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
          text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)]" />

      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={prendrePhoto} />
      <button type="button" onClick={() => photoRef.current?.click()} disabled={envoi || busy}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[var(--r-md)]
          border border-dashed border-[var(--border)] text-[var(--fs-sm)] text-[var(--text-muted)]
          hover:text-[var(--text)] disabled:opacity-40">
        {photos > 0 ? <Check size={16} className="text-[var(--success)]" /> : <Camera size={16} />}
        {envoi ? 'Envoi…' : photos > 0 ? `${photos} photo${photos > 1 ? 's' : ''} — en ajouter` : 'Photo (facultatif)'}
      </button>

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1 min-h-[48px]" disabled={!motif || busy || envoi}
          onClick={() => motif && onValider(motif, note.trim() || null)}>
          {busy ? '…' : 'Signaler au bureau'}
        </Button>
        <Button variant="secondary" className="min-h-[48px]" onClick={onAnnuler} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
