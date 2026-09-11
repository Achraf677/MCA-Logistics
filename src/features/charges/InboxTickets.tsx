import { useState, useEffect, useCallback } from 'react'
import { Inbox, ExternalLink, Check, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import {
  listerTicketsATraiter, classerTicket, urlTicket,
  type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'

/**
 * Tickets envoyés par les chauffeurs, en attente de traitement.
 *
 * Deux issues seulement, et c'est volontaire : « Traité » quand la charge
 * correspondante a été saisie, « Ignorer » pour un doublon, un ticket illisible
 * ou hors activité. Pas de troisième voie du genre « plus tard » : une file
 * d'attente qui autorise à repousser indéfiniment cesse d'être une file.
 *
 * Le panneau disparaît quand la boîte est vide — il n'a rien à dire dans ce cas.
 */
export function InboxTickets({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<TicketInbox[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await listerTicketsATraiter()
    setTickets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const ouvrir = async (t: TicketInbox) => {
    const url = await urlTicket(t)
    if (!url) { toast('Fichier introuvable', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const classer = async (t: TicketInbox, statut: 'traite' | 'ignore') => {
    setBusyId(t.id)
    const { error } = await classerTicket(t.id, statut)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(statut === 'traite' ? 'Ticket classé comme traité' : 'Ticket ignoré')
    await charger()
    onChanged?.()
  }

  if (loading || tickets.length === 0) return null

  return (
    <div className="mb-6 glass rounded-[var(--r-xl)] px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Inbox size={16} className="text-[var(--brand)]" />
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Tickets reçus des chauffeurs
        </span>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-[var(--brand)] text-white text-[var(--fs-xs)] font-semibold">
          {tickets.length}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-[var(--border)]">
        {tickets.map(t => (
          <div key={t.id} className="py-2.5 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-[var(--fs-sm)] text-[var(--text)] truncate">
                {t.note || t.file_name}
              </p>
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                {new Date(t.created_at).toLocaleString('fr-FR')}
              </p>
            </div>

            <button
              onClick={() => ouvrir(t)}
              className="inline-flex items-center gap-1 text-[var(--fs-xs)] text-[var(--brand)] hover:underline min-h-[36px] px-1"
            >
              <ExternalLink size={13} /> Voir
            </button>

            <Button
              variant="secondary"
              size="compact"
              onClick={() => classer(t, 'traite')}
              disabled={busyId === t.id}
            >
              <Check size={13} /> Traité
            </Button>

            <Button
              variant="ghost"
              size="compact"
              onClick={() => classer(t, 'ignore')}
              disabled={busyId === t.id}
              className="text-[var(--text-muted)]"
            >
              <X size={13} /> Ignorer
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
