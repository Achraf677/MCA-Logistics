import { useState } from 'react'
import { Bot, Sparkles, Copy, ShieldAlert } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { useToast } from '../../shared/ui/useToast'
import { generateDraft } from './brouillons.queries'
import { DRAFT_TYPES, draftTypeLabel } from './brouillons.logic'
import type { DraftType } from './brouillons.types'

export function BrouillonsIA() {
  const { toast } = useToast()
  const [type, setType]       = useState<DraftType>('relance')
  const [prompt, setPrompt]   = useState('')
  const [result, setResult]   = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || pending) return
    setPending(true)
    setResult(null)
    const { data, error } = await generateDraft(trimmed, type)
    setPending(false)
    if (error || data?.ok === false) {
      toast(error?.message ?? data?.error ?? 'Échec de la génération', 'error')
      return
    }
    setResult(data?.data?.text ?? '')
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      toast('Brouillon copié')
    } catch {
      toast('Impossible de copier', 'error')
    }
  }

  return (
    <Shell pageTitle="Brouillons IA">
      <div className="max-w-3xl flex flex-col gap-5">
        {/* Note RGPD */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-[var(--r-lg)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 text-[var(--fs-sm)] text-[var(--text-muted)]">
          <ShieldAlert size={16} className="text-[var(--warning)] shrink-0 mt-0.5" />
          <span>N'écris pas de données client sensibles ici (IA gratuite).</span>
        </div>

        {/* Type de texte */}
        <div className="flex flex-col gap-2">
          <label className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Type de texte</label>
          <div className="flex flex-wrap gap-2">
            {DRAFT_TYPES.map(t => (
              <Button
                key={t}
                variant={t === type ? 'primary' : 'secondary'}
                onClick={() => setType(t)}
              >
                {draftTypeLabel(t)}
              </Button>
            ))}
          </div>
        </div>

        {/* Demande */}
        <div className="flex flex-col gap-2">
          <label htmlFor="brouillon-prompt" className="text-[var(--fs-sm)] font-medium text-[var(--text)]">
            Ta demande
          </label>
          <textarea
            id="brouillon-prompt"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={5}
            placeholder="Décris ce que tu veux rédiger…"
            className="w-full rounded-[var(--r-md)] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)] resize-y"
          />
        </div>

        <div>
          <Button variant="primary" onClick={handleGenerate} disabled={pending || !prompt.trim()}>
            <Sparkles size={14} className={pending ? 'animate-spin' : ''} />
            {pending ? 'Génération…' : 'Générer'}
          </Button>
        </div>

        {/* Résultat */}
        {result !== null && (
          result.trim() === '' ? (
            <EmptyState
              icon={<Bot size={48} />}
              title="Aucun texte généré"
              description="L'IA n'a rien renvoyé — reformule ta demande."
            />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Brouillon</span>
                <Button variant="secondary" onClick={handleCopy}>
                  <Copy size={14} />
                  Copier
                </Button>
              </div>
              <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[var(--fs-sm)] text-[var(--text)] whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )
        )}
      </div>
    </Shell>
  )
}
