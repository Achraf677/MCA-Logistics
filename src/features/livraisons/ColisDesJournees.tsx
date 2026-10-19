import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { bornesMois } from '../../shared/lib/journeesColis'
import { colisDesTourneesClient } from '../../shared/lib/tourneesColis.queries'

/**
 * Relevé de messagerie : colis du mois comptés DIRECTEMENT depuis les tournées TERMINÉES du client
 * (plus de journée de colis à valider : décision du 19/10/2026). Une seule saisie : on propose le
 * nombre, le bureau le reprend d'un geste ; les tournées pas encore terminées sont signalées.
 */
export function ColisDesJournees({ clientId, date, valeur, onReprendre }: {
  clientId: string
  date: string
  valeur: number | null
  onReprendre: (colis: number) => void
}) {
  const [r, setR] = useState<{ colis: number; domicile: number; relais: number; terminees: number; enCours: number } | null>(null)

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let annule = false
    const { du, au } = bornesMois(date)
    colisDesTourneesClient(clientId, du, au).then(({ data, error }) => { if (!annule) setR(error ? null : data) })
    return () => { annule = true }
  }, [clientId, date])

  if (!r || (r.terminees === 0 && r.enCours === 0)) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2 text-sm">
      <ClipboardCheck size={16} className="shrink-0 text-[var(--text-muted)]" />
      <span className="flex-1 min-w-0 text-[var(--text)]">
        Tournées terminées : <strong className="tabular-nums">{r.colis.toLocaleString('fr-FR')}</strong> colis
        <span className="text-[var(--text-muted)]"> ({r.domicile} domicile · {r.relais} relais, {r.terminees} tournée{r.terminees > 1 ? 's' : ''})</span>
        {r.enCours > 0 && (
          <span className="block text-xs text-[var(--warning)]">
            {r.enCours} tournée{r.enCours > 1 ? 's' : ''} pas encore terminée{r.enCours > 1 ? 's' : ''} : non comptée{r.enCours > 1 ? 's' : ''}.
          </span>
        )}
      </span>
      {valeur !== r.colis && r.terminees > 0 && (
        <button type="button" onClick={() => onReprendre(r.colis)}
          className="min-h-9 px-3 rounded-[var(--r-md)] border border-[var(--border-strong)] text-sm font-medium text-[var(--text)]">
          Reprendre
        </button>
      )}
    </div>
  )
}
