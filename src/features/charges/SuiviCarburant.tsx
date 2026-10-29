import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Droplets, Euro, Fuel, Plus } from 'lucide-react'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { formatMoney } from '../../shared/lib/money'
import { libelleCarte } from '../../shared/lib/cartesBancaires'
import { useCartes } from '../../shared/lib/useCartesBancaires'
import { libelleMois } from '../../shared/lib/mois'
import type { TicketInbox } from '../../shared/lib/receiptsInbox.queries'
import {
  SANS_VEHICULE, csvCarburant, litresEtPrixMoyen, moisDe, moisDecale, pleinManuelEnLigne, pleinsDuMois, totalPleins, totauxParVehicule,
} from './carburantJustifs.logic'
import { PleinManuelDrawer } from './PleinManuelDrawer'
import type { PleinManuel } from './pleinsManuels.queries'

/** Véhicules affichés d'office dans « Par véhicule » ; le reste derrière « Voir les N véhicules ». */
const RANGS_VISIBLES = 6
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
  // Véhicule sélectionné dans « Par véhicule » : filtre la liste du jour par jour (null = tous).
  const [vehiculeFiltre, setVehiculeFiltre] = useState<string | null>(null)
  const [voirTous, setVoirTous] = useState(false)
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
  const lp = useMemo(() => litresEtPrixMoyen(pleins), [pleins])
  const parVehicule = useMemo(() => totauxParVehicule(pleins, nomVehicule), [pleins, vehicules]) // eslint-disable-line react-hooks/exhaustive-deps
  // Le filtre véhicule disparaît tout seul si ce véhicule n'a aucun plein dans le mois affiché.
  const filtreActif = vehiculeFiltre && parVehicule.some(v => v.cle === vehiculeFiltre) ? vehiculeFiltre : null
  // Classement : les premiers véhicules seulement (avec 20 véhicules la liste serait interminable) ; le véhicule filtré reste toujours visible.
  const rangsVisibles = voirTous ? parVehicule : parVehicule.filter((v, i) => i < RANGS_VISIBLES || v.cle === filtreActif)
  const affiches = filtreActif ? pleins.filter(p => (p.vehicle_id || SANS_VEHICULE) === filtreActif) : pleins
  const totalAffiche = totalPleins(affiches)

  const exporter = () => {
    const csv = csvCarburant(affiches, nomVehicule, c => libelleCarte(c, cartesBancaires), nomDeclarant)
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carburant-${mois}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
          <button type="button" aria-label="Mois précédent" onClick={() => setMois(m => moisDecale(m, -1))}
            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"><ChevronLeft size={16} /></button>
          <span className="min-w-[9rem] text-center font-display font-semibold text-[var(--text)]">{libelleMois(mois)}</span>
          <button type="button" aria-label="Mois suivant" onClick={() => setMois(m => moisDecale(m, 1))} disabled={mois >= moisCourant}
            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        {mois !== moisCourant && <Button variant="secondary" size="compact" onClick={() => setMois(moisCourant)}>Mois en cours</Button>}
        {parVehicule.length > 1 && (
          <div className="w-full sm:w-60 order-last sm:order-none">
            <ListeDeroulante valeur={filtreActif ?? ''} onChange={v => setVehiculeFiltre(v || null)} recherche ariaLabel="Véhicule" placeholder="Tous les véhicules"
              options={[{ valeur: '', libelle: 'Tous les véhicules' }, ...parVehicule.map(v => ({ valeur: v.cle, libelle: v.libelle, detail: formatMoney(v.totalCts) }))]} />
          </div>
        )}
        <span className="ml-auto flex items-center gap-2">
          {peutEcrire && <Button variant="primary" size="compact" onClick={() => setSaisie({ plein: null })}><Plus size={14} /> Ajouter un plein</Button>}
          <Button variant="secondary" size="compact" onClick={exporter} disabled={affiches.length === 0}><Download size={14} /> Exporter (CSV)</Button>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tuile className="col-span-2 sm:col-span-1" icone={<Euro size={12} />} libelle="Total du mois" valeur={formatMoney(total)} detail="carte carburant, TTC" />
        <Tuile icone={<Droplets size={12} />} libelle="Litres" valeur={lp ? `${lp.litres.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L` : '—'}
          detail={lp ? 'pleins saisis à la main' : 'non saisis sur les tickets'} />
        <Tuile icone={<Fuel size={12} />} libelle="Prix moyen / litre" valeur={lp ? `${lp.prixMoyen.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €` : '—'}
          detail={lp ? 'pondéré par les litres' : 'litres non saisis'} />
      </div>

      {pleins.length === 0 ? (
        <EmptyState icon={<Fuel size={40} />} title="Aucun plein ce mois-ci"
          description="Les tickets « CB carburant » une fois validés, et les pleins ajoutés à la main, apparaissent ici." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <section aria-label="Par véhicule" className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text)] px-4 py-3 border-b border-[var(--border)]">
              Par véhicule
              <span className="text-xs font-normal text-[var(--text-muted)]">{parVehicule.length}</span>
              {filtreActif && <button type="button" onClick={() => setVehiculeFiltre(null)} className="ml-auto text-xs font-normal text-[var(--brand)] hover:underline">Tous</button>}
            </h3>
            <ul className={`divide-y divide-[var(--border)] ${voirTous ? 'max-h-[26rem] overflow-y-auto' : ''}`}>
              {rangsVisibles.map(v => {
                const actif = filtreActif === v.cle
                return (
                  <li key={v.cle}>
                    <button type="button" aria-pressed={actif} onClick={() => setVehiculeFiltre(actif ? null : v.cle)}
                      className={`w-full text-left px-4 py-2 flex flex-col gap-1 border-l-2 transition-colors ${
                        actif ? 'border-l-[var(--brand)] bg-[var(--brand)]/10' : 'border-l-transparent hover:bg-[var(--bg-card-hover)]'}`}>
                      <span className="flex items-baseline gap-2">
                        <span className={`flex-1 min-w-0 truncate text-sm ${v.cle === SANS_VEHICULE ? 'text-[var(--warning)]' : 'text-[var(--text)]'}`}>{v.libelle}</span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">{v.partPct} %</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text)] w-24 text-right">{formatMoney(v.totalCts)}</span>
                      </span>
                      <span className="h-1 rounded-full bg-[var(--bg-deep)] overflow-hidden" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${v.partPct}%`, background: v.cle === SANS_VEHICULE ? 'var(--warning)' : 'var(--brand)' }} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {parVehicule.length > RANGS_VISIBLES && (
              <button type="button" onClick={() => setVoirTous(o => !o)}
                className="w-full px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                {voirTous ? 'Réduire' : `Voir les ${parVehicule.length} véhicules`}
              </button>
            )}
          </section>

          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text)] px-4 py-3 border-b border-[var(--border)]">
              Jour par jour
              {filtreActif && (
                <button type="button" onClick={() => setVehiculeFiltre(null)}
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 text-xs font-normal text-[var(--text)]">
                  {parVehicule.find(v => v.cle === filtreActif)?.libelle} <span aria-hidden="true">×</span><span className="sr-only">Retirer le filtre</span>
                </button>
              )}
              <span className="ml-auto font-mono text-sm font-semibold tabular-nums">{formatMoney(totalAffiche)}</span>
            </h3>
            <ul className="divide-y divide-[var(--border)]">
              {affiches.map(p => {
                const jour = p.date_depense ?? p.created_at.slice(0, 10)
                const detailLitres = p.manuel && p.litres != null && p.prix_litre != null
                  ? `${p.litres.toLocaleString('fr-FR')} L · ${p.prix_litre.toLocaleString('fr-FR', { minimumFractionDigits: 3 })} €/L` : null
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => (p.manuel ? setSaisie({ plein: manuels.find(m => m.id === p.id) ?? null }) : onOuvrir(p.id))}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)]">
                      <span className="w-11 shrink-0 font-mono text-xs text-[var(--text-muted)]">{jourCourt(jour)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--text)]">
                          {p.vehicle_id ? nomVehicule(p.vehicle_id) : <span className="text-[var(--warning)]">Véhicule non précisé</span>}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] min-w-0">
                          <AvatarInitiales nom={nomDeclarant(p)} taille="sm" />
                          <span className="truncate">{nomDeclarant(p)}{p.carte ? ` · ${libelleCarte(p.carte, cartesBancaires)}` : ''}{p.manuel && p.note ? ` · ${p.note}` : ''}</span>
                        </span>
                      </span>
                      <span className="shrink-0 flex flex-col items-end">
                        <span className="font-mono font-semibold tabular-nums text-[var(--text)]">
                          {p.montant_ttc_cts != null ? formatMoney(p.montant_ttc_cts) : <span className="font-sans text-[var(--danger)]">À saisir</span>}
                        </span>
                        {detailLitres && <span className="text-[0.6875rem] text-[var(--text-muted)] tabular-nums">{detailLitres}</span>}
                        {p.manuel && !detailLitres && null}
                      </span>
                      {p.manuel && <span className="hidden sm:block shrink-0"><Badge color="muted">Sans justificatif</Badge></span>}
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
    <div className={`rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 flex flex-col min-w-0 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)] truncate">{icone} {libelle}</span>
      <span className="font-mono font-semibold text-lg sm:text-xl leading-tight truncate text-[var(--text)]">{valeur}</span>
      <span className="text-[0.6875rem] text-[var(--text-muted)] truncate">{detail}</span>
    </div>
  )
}
