import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, BarChart3, AlertTriangle } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { formatMoney } from '../../shared/lib/money'
import { toLocalISO } from '../../shared/lib/dates'
import { downloadCSV } from '../../shared/lib/download'
import { rapportParSalarie, rapportCsv, type JourneeColis } from '../../shared/lib/journeesColis'
import { listerJournees } from '../../shared/lib/journeesColis.queries'
import { getTeamMembers } from './equipe.queries'
import { dateFr } from './equipe.logic'
import type { TeamMember } from './equipe.types'
import {
  bornesPeriode, libellePeriode, nomFichierRapport, rapportParJour, totalRapport, filtrerJournees,
  optionsDistinctes,
} from './journees.logic'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'

type Mode = 'jour' | 'mois'

/**
 * Équipe › Rapports : colis validés par salarié sur un jour ou un mois, montant dû
 * (domicile × tarif + relais × tarif, sur le validé seulement), vue par jour, export CSV.
 */
export function RapportsColis() {
  const aujourdhui = toLocalISO(new Date())
  const [mode, setMode] = useState<Mode>('mois')
  const [jour, setJour] = useState(aujourdhui)
  const [mois, setMois] = useState(aujourdhui.slice(0, 7))
  const [membreId, setMembreId] = useState('')
  const [clientId, setClientId] = useState('')
  const [journees, setJournees] = useState<JourneeColis[]>([])
  const [membres, setMembres] = useState<TeamMember[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const valeur = mode === 'jour' ? jour : mois

  useEffect(() => {
    getTeamMembers().then(({ data }) => setMembres((data ?? []) as TeamMember[]))
  }, [])

  const charger = useCallback(async () => {
    const b = bornesPeriode(mode, valeur)
    if (!b) return
    setChargement(true)
    const { data, error } = await listerJournees({ ...b, memberId: membreId || undefined })
    setJournees(data)
    setErreur(error ? error.message : null)
    setChargement(false)
  }, [mode, valeur, membreId])

  useEffect(() => { void charger() }, [charger])

  const clients = useMemo(() => optionsDistinctes(journees, 'client'), [journees])
  const filtrees = useMemo(() => filtrerJournees(journees, { clientId }), [journees, clientId])
  const lignes = useMemo(() => rapportParSalarie(filtrees, membres.map(m => ({
    id: m.id, full_name: m.full_name,
    tarif_domicile_cts: m.tarif_domicile_cts ?? null, tarif_relais_cts: m.tarif_relais_cts ?? null,
  }))), [filtrees, membres])
  const total = useMemo(() => totalRapport(lignes), [lignes])
  const parJour = useMemo(() => rapportParJour(filtrees), [filtrees])

  const exporter = () => downloadCSV(rapportCsv(lignes, valeur), nomFichierRapport(valeur))

  const cellule = 'px-3 py-2 text-right tabular-nums'
  const entete = 'px-3 py-2 text-right font-medium'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
          {(['jour', 'mois'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-sm ${mode === m ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'}`}>
              {m === 'jour' ? 'Jour' : 'Mois'}
            </button>
          ))}
        </div>
        {mode === 'jour'
          ? <input type="date" className="field !w-auto" value={jour} onChange={e => e.target.value && setJour(e.target.value)} />
          : <input type="month" className="field !w-auto" value={mois} onChange={e => e.target.value && setMois(e.target.value)} />}
        <div className="w-52"><ListeDeroulante valeur={membreId} onChange={setMembreId} ariaLabel="Salarié"
          options={[{ valeur: '', libelle: 'Tous les salariés' }, ...membres.map(m => ({ valeur: m.id, libelle: m.full_name }))]} /></div>
        <div className="w-52"><ListeDeroulante valeur={clientId} onChange={setClientId} ariaLabel="Client"
          options={[{ valeur: '', libelle: 'Tous les clients' }, ...clients.map(c => ({ valeur: c.id, libelle: c.nom }))]} /></div>
        <Button variant="secondary" size="compact" className="ml-auto" disabled={lignes.length === 0} onClick={exporter}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      {erreur ? (
        <p className="py-10 text-center text-sm text-[var(--danger)]">Rapport non chargé : {erreur}</p>
      ) : chargement && journees.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--text-muted)]">Chargement…</p>
      ) : lignes.length === 0 ? (
        <EmptyState icon={<BarChart3 size={28} />} title="Aucune journée sur la période"
          description={`Rien de déclaré pour ${libellePeriode(mode, valeur)}.`} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 min-w-0">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Par salarié — {libellePeriode(mode, valeur)} (colis validés)
            </p>
            <div className="overflow-auto max-h-[calc(100dvh-17rem)] rounded-[var(--r-lg)] border border-[var(--border)]">
              <table className="w-full text-sm min-w-[44rem]">
                <thead className="sticky top-0 bg-[var(--bg-card)] z-10">
                  <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left font-medium">Salarié</th>
                    <th className={entete}>Jours</th>
                    <th className={entete}>Domicile</th>
                    <th className={entete}>Relais</th>
                    <th className={entete}>Litiges</th>
                    <th className={entete}>En attente</th>
                    <th className={entete}>À corriger</th>
                    <th className={entete}>Dû au salarié</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {lignes.map(l => (
                    <tr key={l.member_id}>
                      <td className="px-3 py-2 truncate max-w-[12rem]">{l.nom}</td>
                      <td className={cellule}>{l.totaux.valides.jours}</td>
                      <td className={cellule}>{l.totaux.valides.domicile}</td>
                      <td className={cellule}>{l.totaux.valides.relais}</td>
                      <td className={cellule}>{l.totaux.valides.litige}</td>
                      <td className={`${cellule} ${l.totaux.enAttente > 0 ? 'text-[var(--info)]' : ''}`}>{l.totaux.enAttente}</td>
                      <td className={`${cellule} ${l.totaux.aCorriger > 0 ? 'text-[var(--danger)]' : ''}`}>{l.totaux.aCorriger}</td>
                      <td className={`${cellule} font-semibold`}>
                        {l.du_cts == null
                          ? <span className="inline-flex items-center gap-1 text-[var(--warning)] font-normal"><AlertTriangle size={13} /> tarif manquant</span>
                          : formatMoney(l.du_cts)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-[var(--bg-card)]">
                  <tr className="border-t border-[var(--border-strong)] font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className={cellule} />
                    <td className={cellule}>{total.domicile}</td>
                    <td className={cellule}>{total.relais}</td>
                    <td className={cellule}>{total.litige}</td>
                    <td className={cellule}>{total.enAttente}</td>
                    <td className={cellule}>{total.aCorriger}</td>
                    <td className={cellule}>{formatMoney(total.du_cts)}{total.tarifsManquants.length > 0 && ' + ?'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {total.tarifsManquants.length > 0 && (
              <p className="text-xs text-[var(--warning)]">
                Tarif au colis manquant pour {total.tarifsManquants.join(', ')} : le saisir dans sa fiche (Membres › fiche › Messagerie).
              </p>
            )}
            {(total.enAttente > 0 || total.aCorriger > 0) && (
              <p className="text-xs text-[var(--text-muted)]">
                Le dû ne compte que les journées validées : {total.enAttente} en attente, {total.aCorriger} à corriger.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Par jour (validé ou déclaré)</p>
            <div className="overflow-auto max-h-[calc(100dvh-17rem)] rounded-[var(--r-lg)] border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg-card)] z-10">
                  <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className={entete}>Domicile</th>
                    <th className={entete}>Relais</th>
                    <th className={entete}>Litiges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {parJour.map(l => (
                    <tr key={l.date}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {dateFr(l.date)}
                        {l.nonValidees > 0 && <span className="ml-1 text-[var(--info)]" title="Journées envoyées ou à corriger : nombres déclarés">({l.nonValidees} non validée{l.nonValidees > 1 ? 's' : ''})</span>}
                      </td>
                      <td className={cellule}>{l.domicile}</td>
                      <td className={cellule}>{l.relais}</td>
                      <td className={cellule}>{l.litige}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
