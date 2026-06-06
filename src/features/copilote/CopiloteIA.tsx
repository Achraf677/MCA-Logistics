import { useState, useRef } from 'react'
import { ScanText, Sparkles, Upload, FileText, Lock, X } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { useToast } from '../../shared/ui/useToast'
import { extractDeliveries } from './copilote.queries'
import type { ExtractedDelivery, ExtractInput } from './copilote.types'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // ~8 Mo

// Colonnes du tableau : [libellé, clé de l'objet, formatage].
const COLUMNS: Array<{
  label: string
  field: keyof ExtractedDelivery
  format: (d: ExtractedDelivery) => string
}> = [
  { label: 'Client',     field: 'client_name',      format: d => d.client_name ?? '' },
  { label: 'Type',       field: 'type',             format: d => d.type ?? '' },
  { label: 'Date',       field: 'date',             format: d => d.date ?? '' },
  { label: 'Enlèvement', field: 'pickup_address',   format: d => d.pickup_address ?? '' },
  { label: 'Livraison',  field: 'delivery_address', format: d => d.delivery_address ?? '' },
  { label: 'Km',         field: 'km',               format: d => (d.km != null ? String(d.km) : '') },
  { label: 'Poids (kg)', field: 'weight_kg',        format: d => (d.weight_kg != null ? String(d.weight_kg) : '') },
  { label: 'Montant HT', field: 'montant_ht_eur',   format: d => (d.montant_ht_eur != null ? `${d.montant_ht_eur} €` : '') },
  { label: 'Heure',      field: 'heure',            format: d => d.heure ?? '' },
]

function isMissing(d: ExtractedDelivery, field: keyof ExtractedDelivery): boolean {
  const value = d[field]
  return value == null || value === '' || (d.missing ?? []).includes(field)
}

export function CopiloteIA() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [mimeType, setMimeType]     = useState<string | null>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [instructions, setInstructions] = useState('')

  const [pending, setPending] = useState(false)
  const [deliveries, setDeliveries] = useState<ExtractedDelivery[] | null>(null)

  const hasSource = !!fileBase64 || pastedText.trim().length > 0

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast('Fichier trop volumineux (max ~8 Mo)', 'error')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result = "data:<mime>;base64,<data>" → on isole la partie base64 pure.
      const comma = result.indexOf(',')
      setFileBase64(comma >= 0 ? result.slice(comma + 1) : result)
      setMimeType(file.type)
      setFileName(file.name)
    }
    reader.onerror = () => toast('Lecture du fichier impossible', 'error')
    reader.readAsDataURL(file)
  }

  const clearFile = () => {
    setFileBase64(null)
    setMimeType(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAnalyze = async () => {
    if (!hasSource || pending) return
    setPending(true)
    setDeliveries(null)

    const input: ExtractInput = { instructions: instructions.trim() || undefined }
    if (fileBase64 && mimeType) {
      input.fileBase64 = fileBase64
      input.mimeType = mimeType
    } else {
      input.text = pastedText.trim()
    }

    const { data, error } = await extractDeliveries(input)
    setPending(false)
    if (error || data?.ok === false) {
      toast(error?.message ?? data?.error ?? "Échec de l'analyse", 'error')
      return
    }
    setDeliveries(data?.data?.deliveries ?? [])
  }

  return (
    <Shell pageTitle="Copilote IA">
      <div className="max-w-5xl flex flex-col gap-5">
        {/* Note RGPD */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-[var(--r-lg)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 text-[var(--fs-sm)] text-[var(--text-muted)]">
          <Lock size={16} className="text-[var(--warning)] shrink-0 mt-0.5" />
          <span>Le document est envoyé à Mistral (UE) pour lecture. N'inclus pas de données ultra-sensibles non nécessaires.</span>
        </div>

        {/* Zone 1 : feuille de route (fichier OU texte) */}
        <div className="flex flex-col gap-2">
          <label className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Feuille de route</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFile}
              className="hidden"
              id="copilote-file"
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              Importer un fichier (image / PDF)
            </Button>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]">
                <FileText size={13} className="text-[var(--text-muted)]" />
                {fileName}
                <button onClick={clearFile} aria-label="Retirer le fichier" className="text-[var(--text-disabled)] hover:text-[var(--text)]">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">— ou colle le texte de la feuille ci-dessous —</span>
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            rows={5}
            placeholder="Colle ici le texte de la feuille de route…"
            disabled={!!fileBase64}
            className="w-full rounded-[var(--r-md)] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)] resize-y disabled:opacity-40"
          />
        </div>

        {/* Zone 2 : précisions pour l'IA */}
        <div className="flex flex-col gap-2">
          <label htmlFor="copilote-instructions" className="text-[var(--fs-sm)] font-medium text-[var(--text)]">
            Précisions pour l'IA
          </label>
          <textarea
            id="copilote-instructions"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={2}
            placeholder="Ex. : tout à 25€ sauf Muller à 40, départ entrepôt Strasbourg…"
            className="w-full rounded-[var(--r-md)] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)] resize-y"
          />
        </div>

        <div>
          <Button variant="primary" onClick={handleAnalyze} disabled={!hasSource || pending}>
            <Sparkles size={14} className={pending ? 'animate-spin' : ''} />
            {pending ? 'Analyse…' : 'Analyser'}
          </Button>
        </div>

        {/* Résultat */}
        {deliveries !== null && (
          deliveries.length === 0 ? (
            <EmptyState
              icon={<ScanText size={48} />}
              title="Aucune livraison détectée"
              description="L'IA n'a rien trouvé d'exploitable — vérifie le document ou ajoute des précisions."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
                <table className="w-full text-[var(--fs-sm)]">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                      {COLUMNS.map(c => (
                        <th key={c.label} className="px-3 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d, i) => (
                      <tr key={i} className={`border-t border-[var(--border)] ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}>
                        {COLUMNS.map(c => {
                          const missing = isMissing(d, c.field)
                          return (
                            <td
                              key={c.label}
                              className={`px-3 py-2.5 ${missing ? 'text-[var(--warning)] italic' : 'text-[var(--text)]'}`}
                            >
                              {missing ? 'à compléter' : c.format(d)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--brand-soft)] text-[var(--brand)] text-[var(--fs-sm)] font-medium">
                <Lock size={13} />
                Lecture seule — rien n'est créé (création en B2)
              </div>
            </div>
          )
        )}
      </div>
    </Shell>
  )
}
