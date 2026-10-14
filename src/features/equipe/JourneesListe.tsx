import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { toLocalISO } from '../../shared/lib/dates'
import {
  COULEUR_STATUT_JOURNEE, LIBELLE_STATUT_JOURNEE, colisRetenus, estCorrigee, totauxJournees,
  type JourneeColis, type StatutJournee,
} from '../../shared/lib/journeesColis'
import { listerJournees } from '../../shared/lib/journeesColis.queries'
import { getTeamMembers } from './equipe.queries'
import { dateFr } from './equipe.logic'
import { bornesPeriode, filtrerJournees, optionsDistinctes } from './journees.logic'
import { DrawerJournee } from './DrawerJournee'

const STATUTS: StatutJournee[] = ['envoyee', 'validee', 'refusee', 'brouillon']

/** Équipe › Journées : consultation d'un mois (filtres salarié / client / statut), détail en tiroir. */
export function JourneesListe() {
  const [mois, setMois] = useState(() => toLocalISO(new Date()).slice(0, 7))
  const [membreId, setMembreId] = useState('')
  const [clientId, setClientId] = useState('')
  const [statut, setStatut] = useState<StatutJournee | ''>('')
  const [journees, setJournees] = useState<JourneeColis[]>([])
  const [membres, setMembres] = useState<Array<{ id: string; full_name: string }>>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<JourneeColis | null>(null)

  useEffect(() => {
    getTeamMembers().then(({ data }) => setMembres((data ?? []).map(m => ({ id: m.id, full_name: m.full_name }))))
  }, [])

  const charger = useCallback(async () => {
    const b = bornesPeriode('mois', mois)
    if (!b) return
    setChargement(true)
    const { data, error } = await listerJournees({ ...b, memberId: membreId || undefined })
    setJournees(data)
    setErreur(error ? error.message : null)
    setChargement(false)
    // Le tiroir ouvert suit la version fraîche (après correction / réouverture).
    setOuverte(o => (o ? data.find(x => x.id === o.id) ?? o : o))
  }, [mois, membreId])

  useEffect(() => { void charger() }, [charger])

  const clients = useMemo(() => optionsDistinctes(journees, 'client'), [journees])
  const visibles = useMemo(() => filtrerJournees(journees, { clientId, statut }), [journees, clientId, statut])
  const t = useMemo(() => totauxJournees(visibles), [visibles])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" className="field !w-auto" value={mois} onChange={e => e.target.value && setMois(e.target.value)} />
        <select className="field !w-auto" value={membreId} onChange={e => setMembreId(e.target.value)}>
          <option value="">Tous les salariés</option>
          {membres.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select className="field !w-auto" value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select className="field !w-auto" value={statut} onChange={e => setStatut(e.target.value as StatutJournee | '')}>
          <option value="">Tous les statuts</option>
          {STATUTS.map(s => <option key={s} value={s}>{LIBELLE_STATUT_JOURNEE[s]}</option>)}
        </select>
        <Button variant="ghost" size="compact" onClick={() => void charger()} title="Actualiser"><RefreshCw size={14} /></Button>
        <p className="ml-auto text-sm text-[var(--text-muted)]">
          {visibles.length} journée{visibles.length > 1 ? 's' : ''} · domicile {t.domicile} · relais {t.relais} · litiges {t.litige}
          {t.enAttente > 0 && ` · ${t.enAttente} en attente`}
        </p>
      </div>

      {erreur ? (
        <p className="py-10 text-center text-sm text-[var(--danger)]">Journées non chargées : {erreur}</p>
      ) : chargement && journees.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--text-muted)]">Chargement…</p>
      ) : visibles.length === 0 ? (
        <EmptyState icon={<CalendarDays size={28} />} title="Aucune journée"
          description="Aucune journée de colis pour ces filtres." />
      ) : (
        <div className="overflow-auto max-h-[calc(100dvh-15rem)] rounded-[var(--r-lg)] border border-[var(--border)]">
          <table className="w-full text-sm min-w-[44rem]">
            <thead className="sticky top-0 bg-[var(--bg-card)] z-10">
              <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                <th className="text-left font-medium px-3 py-2">Date</th>
                <th className="text-left font-medium px-3 py-2">Salarié</th>
                <th className="text-left font-medium px-3 py-2">Client</th>
                <th className="text-right font-medium px-3 py-2">Domicile</th>
                <th className="text-right font-medium px-3 py-2">Relais</th>
                <th className="text-right font-medium px-3 py-2">Litiges</th>
                <th className="text-left font-medium px-3 py-2">Statut</th>
                <th className="text-left font-medium px-3 py-2">Corrigée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visibles.map(j => {
                const r = colisRetenus(j)
                const corrigee = estCorrigee(j) || !!j.motif_modification
                return (
                  <tr key={j.id} onClick={() => setOuverte(j)} className="cursor-pointer hover:bg-[var(--bg-card-hover)]">
                    <td className="px-3 py-2 font-mono text-xs">{dateFr(j.date)}</td>
                    <td className="px-3 py-2 truncate max-w-[12rem]">{j.team_members?.full_name ?? '—'}</td>
                    <td className="px-3 py-2 truncate max-w-[12rem] text-[var(--text-muted)]">{j.clients?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.domicile}</td>
                    <td className="px-3 py-2 text-right">{r.relais}</td>
                    <td className={`px-3 py-2 text-right ${r.litige > 0 ? 'text-[var(--warning)]' : ''}`}>{r.litige}</td>
                    <td className="px-3 py-2"><Badge color={COULEUR_STATUT_JOURNEE[j.statut]}>{LIBELLE_STATUT_JOURNEE[j.statut]}</Badge></td>
                    <td className="px-3 py-2">{corrigee ? <span className="text-[var(--warning)] font-medium">Oui</span> : <span className="text-[var(--text-muted)]">Non</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <DrawerJournee j={ouverte} onClose={() => setOuverte(null)} onChanged={() => void charger()} />
    </div>
  )
}
