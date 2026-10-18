import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScanText, Trash2, ClipboardList } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Drawer } from '../../shared/ui/Drawer'
import { Field } from '../../shared/ui/Field'
import { ScanFeuilleRoute } from '../../shared/ui/ScanFeuilleRoute'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  LIBELLE_STATUT_TOURNEE, avancementPct, compteursTournee, type ArretColis, type TourneeColis,
} from '../../shared/lib/tourneesColis'
import {
  arretsDesTournees, listerTourneesColis, membresPourTournee, nomsClients, supprimerTourneeColis,
} from '../../shared/lib/tourneesColis.queries'

type Membre = { id: string; full_name: string; clients_messagerie: string[] }

/**
 * Tournées de colis du jour (messagerie) : une ligne par feuille de route scannée —
 * salarié, client, avancement des arrêts et des colis, statut. Le bureau (droit
 * `planning.tournees : update`) peut aussi scanner la feuille d'un salarié.
 */
export function TourneesColisDuJour({ companyId, date }: { companyId: string; date: string }) {
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutScanner = can('planning.tournees', 'update')
  const peutSupprimer = can('planning.tournees', 'delete')
  const [tournees, setTournees] = useState<TourneeColis[]>([])
  const [arrets, setArrets] = useState<ArretColis[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(false)
  const [scanOuvert, setScanOuvert] = useState(false)
  const [membres, setMembres] = useState<Membre[]>([])
  const [membreId, setMembreId] = useState('')
  const [noms, setNoms] = useState<Map<string, string>>(new Map())
  const [aSupprimer, setASupprimer] = useState<TourneeColis | null>(null)
  const [suppression, setSuppression] = useState(false)

  const recharger = useCallback(async () => {
    const t = await listerTourneesColis({ du: date, au: date })
    setCharge(true)
    if (t.error) { setErreur(t.error.message); setTournees([]); setArrets([]); return }
    setErreur(null)
    setTournees(t.data)
    const a = await arretsDesTournees(t.data.map(x => x.id))
    setArrets(a.data)
  }, [date])

  useEffect(() => { recharger() }, [recharger])

  // Salariés et noms de leurs clients : seulement quand on ouvre le scanner.
  useEffect(() => {
    if (!scanOuvert || membres.length) return
    membresPourTournee().then(async ({ data }) => {
      setMembres(data)
      setNoms(await nomsClients([...new Set(data.flatMap(m => m.clients_messagerie))]))
    })
  }, [scanOuvert, membres.length])

  const lignes = useMemo(() => tournees.map(t => {
    const c = compteursTournee(arrets.filter(a => a.tournee_id === t.id))
    return { t, c, pct: avancementPct(c) }
  }), [tournees, arrets])

  const membre = membres.find(m => m.id === membreId) ?? null
  const clientsMembre = useMemo(
    () => (membre?.clients_messagerie ?? []).map(id => ({ id, name: noms.get(id) ?? 'Client' })),
    [membre, noms],
  )

  const supprimer = async () => {
    if (!aSupprimer) return
    setSuppression(true)
    const { error } = await supprimerTourneeColis(aSupprimer.id)
    setSuppression(false)
    setASupprimer(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée de colis supprimée', 'success')
    recharger()
  }

  // Rien à montrer et rien à faire : le bloc ne prend pas de place.
  if (!charge || (!peutScanner && !erreur && tournees.length === 0)) return null

  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <ClipboardList size={15} className="text-[var(--text-muted)]" />
        <span className="flex-1 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Tournées de colis du jour
        </span>
        {peutScanner && !erreur && (
          <Button size="compact" onClick={() => setScanOuvert(true)}>
            <ScanText size={14} /> Scanner pour un salarié
          </Button>
        )}
      </div>
      <div className="p-3">
        {erreur ? (
          <p className="text-sm text-[var(--text-muted)]">{erreur}</p>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Aucune feuille de route scannée ce jour.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {lignes.map(({ t, c, pct }) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <strong className="text-[var(--text)]">{t.team_members?.full_name ?? 'Salarié'}</strong>
                    {t.clients?.name && <span className="text-[var(--text-muted)]">{t.clients.name}</span>}
                    <Badge color={t.statut === 'cloturee' ? 'muted' : t.statut === 'en_cours' ? 'info' : 'warning'}>
                      {LIBELLE_STATUT_TOURNEE[t.statut]}
                    </Badge>
                  </span>
                  <div className="h-1.5 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden" aria-hidden>
                    <div className="h-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)] tabular-nums">
                    <span>Arrêts {c.arretsTraites} / {c.arrets}</span>
                    <span>Colis {c.colisTraites} / {c.colis}</span>
                    <span className="text-[var(--success)]">{c.colisLivres} livrés</span>
                    {c.colisAttente > 0 && <span className="text-[var(--warning)]">{c.colisAttente} en attente</span>}
                    {c.colisRetour > 0 && <span className="text-[var(--danger)]">{c.colisRetour} en retour</span>}
                    {c.collectes > 0 && <span>Collectes {c.collectesTraitees} / {c.collectes}</span>}
                  </span>
                </div>
                {peutSupprimer && t.statut !== 'cloturee' && (
                  <BoutonIcone icone={Trash2} taille="sm" libelle="Supprimer cette tournée de colis"
                    onClick={() => setASupprimer(t)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer open={scanOuvert} onClose={() => { setScanOuvert(false); setMembreId('') }}
        title="Scanner une feuille de route" width="max-w-[48rem]">
        <div className="flex flex-col gap-4">
          <Field label="Salarié">
            <select value={membreId} onChange={e => setMembreId(e.target.value)} className="field">
              <option value="">Choisir…</option>
              {membres.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </Field>
          {membre && (
            <ScanFeuilleRoute key={membre.id} companyId={companyId} memberId={membre.id} nomSalarie={membre.full_name}
              date={date} clients={clientsMembre}
              onAnnuler={() => { setScanOuvert(false); setMembreId('') }}
              onCree={() => { setScanOuvert(false); setMembreId(''); recharger() }} />
          )}
        </div>
      </Drawer>

      <ConfirmDialog open={aSupprimer != null} title="Supprimer cette tournée de colis ?"
        message={`Feuille de ${aSupprimer?.team_members?.full_name ?? 'ce salarié'} : les arrêts et leurs statuts seront effacés.`}
        loading={suppression} onConfirm={supprimer} onCancel={() => setASupprimer(null)} />
    </div>
  )
}
