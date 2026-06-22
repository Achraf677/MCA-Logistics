import { useState, type MouseEvent } from 'react'
import { ExternalLink, Loader } from 'lucide-react'
import { supabase } from '../../app/providers'
import { useToast } from './useToast'

interface Props {
  /** ID facture fournisseur Pennylane. Si présent → URL fraîche via pennylane-file. */
  pennylane_id?: string | null
  /** URL directe pour les charges manuelles (non-Pennylane). */
  receipt_url?: string | null
  /** Texte affiché. Vide = icône seule. */
  label?: string
  iconSize?: number
  className?: string
}

/**
 * Ouvre le PDF d'une facture de façon fiable :
 * - Pennylane : récupère une URL fraîche via Edge Function pennylane-file
 *   (public_file_url est une URL signée à durée limitée — ne jamais utiliser la version stockée).
 * - Manuel : ouvre receipt_url directement.
 * Rend null si aucun lien disponible.
 */
export function FacturePdfLink({ pennylane_id, receipt_url, label = 'Facture', iconSize = 11, className }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  if (!pennylane_id && !receipt_url) return null

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()

    if (!pennylane_id) {
      window.open(receipt_url!, '_blank', 'noopener,noreferrer')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; url?: string }>(
      'pennylane-file',
      { body: { pennylane_id } },
    )
    setLoading(false)

    if (error || !data?.url) {
      toast('Impossible d\'accéder au PDF', 'error')
      return
    }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={className ?? 'inline-flex items-center gap-1 text-[var(--info)] hover:underline text-[var(--fs-xs)] disabled:opacity-50'}
    >
      {loading ? <Loader size={iconSize} className="animate-spin" /> : <ExternalLink size={iconSize} />}
      {label}
    </button>
  )
}
