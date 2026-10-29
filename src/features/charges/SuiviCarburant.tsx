import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Fuel, Gauge, Plus, Truck } from 'lucide-react'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { formatMoney } from '../../shared/lib/money'
import { libelleCarte } from '../../shared/lib/cartesBancaires'
import { useCartes } from '../../shared/lib/useCartesBancaires'
import { libelleMois } from '../../shared/lib/mois'
import type { TicketInbox } from '../../shared/lib/receiptsInbox.queries'
import {
  csvCarburant, moisDe, moisDecale, pleinManuelEnLigne, pleinsDuMois, totalLitres, totalPleins, totauxParVehicule,
} from './carburantJustifs.logic'
import { PleinManuelDrawer } from './PleinManuelDrawer'
import type { PleinManuel } from './pleinsManuels.queries'

const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Vue « Carburant » des Justificatifs : les tickets payés avec la carte carburant, mois par mois et véhicule par véhicule.
 * Informatif : rien n'est envoyé à Pennylane (la facture de la carte arrive en fin de mois). Remplace le bloc-notes.
 */
export function SuiviCarburant({ tickets, manuels, vehicules, membres, noms, companyId, peutEcrire, peutSupprimer, onOuvrir, onManuelsChange }: {
  tickets: TicketInbox[]
  /** Pleins saisis à la main, sans justificatif. */
  manuels: PleinManuel[]
  vehicules: Array<{ id: string; label: string; plate: string | null }>
  membres: Array<{ id: string; full_name: string }>
  noms: Record<string, string>
  companyId: string
  peutEcrire: boolean
  peutSupprimer: boolean
  onOuvrir: (id: string) => void
  onManuelsChange: () => Promise<void>
}) {
  const cartesBancaires = useCartes()
  const [saisie, setSaisie] = useState<{ plein: PleinManuel | null } | null>(null)
  const [mois, setMois] = useState(() => moisDe(new Date()))
  const moisCourant = moisDe(new Date())
  const nomVehicule = (id: string) => vehicules.find(v => v.id === id)?.label ?? 'Véhicule supprimé'
  const nomDeclarant = (t: { uploaded_by?: string | null; manuel?: true; fait_par?: string | null }) =>
    t.manuel
      ? (membres.find(m => m.id === t.fait_par)?.full_name ?? 'Saisie manuelle')
      : (t.uploaded_by ? (noms[t.uploaded_by] ?? 'Inconnu') : 'Inconnu')

  const pleins = useMemo(
    () => pleinsDuMois<Plein>([...tickets, ...manuels.map(pleinManuelEnLigne)], mois),
    [tickets, manuels, mois])
  const total = totalPleins(pleins)
  const litres = totalLitres(pleins)
  const parVehicule = useMemo(() => totauxParVehicule(pleins, nomVehicule), [pleins, vehicules]) // eslint-disable-line react-hooks/exhaustive-deps
  const sansMontant = pleins.filter(p => p.montant_ttc_cts == null).length

  const exporter = () => {
    const csv = csvCarburant(pleins, nomVehicule, c => libelleCarte(c, cartesBancaires), nomDeclarant)
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carburant-${mois}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
          <button type="button" aria-label="Mois précédent" onClick={() => setMois(m => moisDecale(m, -1))}
            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"><ChevronLeft size={16} /></button>
          <span className="min-w-[9rem] text-center font-display font-semibold text-[var(--text)]">{libelleMois(mois)}</span>
          <button type="button" aria-label="Mois suivant" onClick={() => setMois(m => moisDecale(m, 1))} disabled={mois >= moisCourant}
            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        {mois !== moisCourant && <Button variant="secondary" size="compact" onClick={() => setMois(moisCourant)}>Mois en cours</Button>}
        <span className="ml-auto flex items-center gap-2">
          {peutEcrire && <Button variant="primary" size="compact" onClick={() => setSaisie({ plein: null })}><Plus size={14} /> Ajouter un plein</Button>}
          <Button variant="secondary" size="compact" onClick={exporter} disabled={pleins.length === 0}><Download size={14} /> Exporter (CSV)</Button>
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tuile icone={<Fuel size={13} />} libelle="Total du mois" valeur={formatMoney(total)} detail="carte carburant, TTC" />
        <Tuile icone={<Gauge size={13} />} libelle="Pleins" valeur={String(pleins.length)}
          detail={pleins.length === 0 ? 'aucun ce mois-ci' : litres > 0 ? `${litres.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L · ${formatMoney(Math.round(total / pleins.length))} en moyenne` : `${formatMoney(Math.round(total / pleins.length))} en moyenne`} />
        <Tuile icone={<Truck size={13} />} libelle="Véhicules" valeur={String(parVehicule.filter(v => v.cle !== 'sans-vehicule').length)}
          detail={sansMontant > 0 ? `${sansMontant} sans montant` : 'ayant fait le plein'} className="col-span-2 lg:col-span-1" />
      </div>

      {pleins.length === 0 ? (
        <EmptyState icon={<Fuel size={40} />} title="Aucun plein ce mois-ci"
          description="Les tickets déposés avec « Carte carburant » et les pleins que tu ajoutes à la main apparaissent ici." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
            <h3 className="font-display font-semibold text-[var(--text)]">Par véhicule</h3>
            <ul className="flex flex-col gap-3">
              {parVehicule.map(v => (
                <li key={v.cle} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate font-medium text-[var(--text)]">{v.libelle}</span>
                    <span className="text-xs text-[var(--text-muted)]">{v.nb} plein{v.nb > 1 ? 's' : ''}</span>
                    <span className="font-mono font-semibold tabular-nums text-[var(--text)]">{formatMoney(v.totalCts)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-deep)] overflow-hidden" aria-label={`${v.partPct} % du mois`}>
                    <div className="h-full rounded-full" style={{ width: `${v.partPct}%`, background: v.cle === 'sans-vehicule' ? 'var(--warning)' : 'var(--brand)' }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <h3 className="font-display font-semibold text-[var(--text)] px-4 py-3 border-b border-[var(--border)]">Jour par jour</h3>
            <ul className="divide-y divide-[var(--border)]">
              {pleins.map(p => {
                const jour = p.date_depense ?? p.created_at.slice(0, 10)
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => (p.manuel ? setSaisie({ plein: manuels.find(m => m.id === p.id) ?? null }) : onOuvrir(p.id))}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)]">
                      <span className="w-11 shrink-0 font-mono text-xs text-[var(--text-muted)]">{jourCourt(jour)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--text)]">
                          {p.vehicle_id ? nomVehicule(p.vehicle_id) : <span className="text-[var(--warning)]">Véhicule non précisé</span>}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
                          <AvatarInitiales nom={nomDeclarant(p)} taille="sm" /> {nomDeclarant(p)}{p.carte ? ` · ${libelleCarte(p.carte, cartesBancaires)}` : ''}
                          {p.manuel && p.litres != null && p.prix_litre != null && ` · ${p.litres.toLocaleString('fr-FR')} L × ${p.prix_litre.toLocaleString('fr-FR', { minimumFractionDigits: 3 })} €`}
                          {p.manuel && p.note && ` · ${p.note}`}
                        </span>
                      </span>
                      {p.manuel && <Badge color="muted">Sans justificatif</Badge>}
                      <span className="font-mono font-semibold tabular-nums text-[var(--text)] shrink-0">
                        {p.montant_ttc_cts != null ? formatMoney(p.montant_ttc_cts) : <span className="font-sans text-[var(--danger)]">À saisir</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}
      {saisie && (
        <PleinManuelDrawer key={saisie.plein?.id ?? 'nouveau'} plein={saisie.plein} companyId={companyId} vehicules={vehicules} membres={membres} peutSupprimer={peutSupprimer}
          onClose={() => setSaisie(null)} onEnregistre={async () => { setSaisie(null); await onManuelsChange() }} />
      )}
    </div>
  )
}

type Plein = (TicketInbox & { manuel?: undefined }) | ReturnType<typeof pleinManuelEnLigne>

function Tuile({ icone, libelle, valeur, detail, className = '' }: { icone: React.ReactNode; libelle: string; valeur: string; detail: string; className?: string }) {
  return (
    <div className={`rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-3 flex flex-col min-w-0 ${className}`}>
      <span className="inline-flex items-center gap-1.5 mb-2 text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{icone} {libelle}</span>
      <span className="font-mono font-semibold text-base sm:text-2xl leading-tight truncate text-[var(--text)]">{valeur}</span>
      <span className="pt-1 text-[0.6875rem] sm:text-xs text-[var(--text-muted)] truncate">{detail}</span>
    </div>
  )
}
