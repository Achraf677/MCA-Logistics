import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { bornesMois, colisPourReleve } from '../../shared/lib/journeesColis'
import { journeesDuClient } from '../../shared/lib/journeesColis.queries'

/**
 * Relevé de messagerie : colis du mois comptés depuis les journées de colis VALIDÉES du client
 * (elles-mêmes préremplies depuis les tournées scannées). Une seule saisie : on propose le
 * nombre, le bureau le reprend d'un geste ; les journées pas encore validées sont signalées.
 */
export function ColisDesJournees({ clientId, date, valeur, onReprendre }: {
  clientId: string
  date: string
  valeur: number | null
  onReprendre: (colis: number) => void
}) {
  const [r, setR] = useState<ReturnType<typeof colisPourReleve> | null>(null)

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let annule = false
    const { du, au } = bornesMois(date)
    journeesDuClient(clientId, du, au).then(({ data, error }) => { if (!annule) setR(error ? null : colisPourReleve(data)) })
    return () => { annule = true }
  }, [clientId, date])

  if (!r || (r.validees === 0 && r.nonValidees === 0)) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2 text-sm">
      <ClipboardCheck size={16} className="shrink-0 text-[var(--text-muted)]" />
      <span className="flex-1 min-w-0 text-[var(--text)]">
        Journées validées : <strong className="tabular-nums">{r.colis.toLocaleString('fr-FR')}</strong> colis
        <span className="text-[var(--text-muted)]"> ({r.domicile} domicile · {r.relais} relais, {r.validees} jour{r.validees > 1 ? 's' : ''})</span>
        {r.nonValidees > 0 && (
          <span className="block text-xs text-[var(--warning)]">
            {r.nonValidees} journée{r.nonValidees > 1 ? 's' : ''} pas encore validée{r.nonValidees > 1 ? 's' : ''} (Équipe › À valider) : non comptée{r.nonValidees > 1 ? 's' : ''}.
          </span>
        )}
      </span>
      {valeur !== r.colis && r.validees > 0 && (
        <button type="button" onClick={() => onReprendre(r.colis)}
          className="min-h-9 px-3 rounded-[var(--r-md)] border border-[var(--border-strong)] text-sm font-medium text-[var(--text)]">
          Reprendre
        </button>
      )}
    </div>
  )
}
