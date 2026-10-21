import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScanText, Trash2, ClipboardList, Map as IconeCarte, Route, RotateCcw, Radio } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Drawer } from '../../shared/ui/Drawer'
import { Field } from '../../shared/ui/Field'
import { ScanFeuilleRoute } from '../../shared/ui/ScanFeuilleRoute'
import { useToast } from '../../shared/ui/useToast'
import { Skeleton } from '../../shared/ui/Skeleton'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  LIBELLE_STATUT_TOURNEE, avancementPct, compteursTournee, type ArretColis, type TourneeColis,
} from '../../shared/lib/tourneesColis'
import { toLocalISO } from '../../shared/lib/dates'
import type { DocumentRow } from '../../shared/lib/documents.types'
import {
  arretsDesTournees, listerTourneesColis, membresPourTournee, nomsClients, supprimerTourneeColis,
  calculerItineraire, rouvrirTournee, positionsLivreurs, trouverScan, photosSynthese, urlPhotoArret, type PositionLivreur,
} from '../../shared/lib/tourneesColis.queries'
import { ilYA, libelleDistance, modeOrdre, positionAncienne, prochainDansOrdre } from '../../shared/lib/tourneesColisRoute'
import { colorForIndex } from './tours.palette'

const CarteTournee = lazy(() => import('../../shared/ui/CarteTournee'))

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
  const [syntheses, setSyntheses] = useState<Map<string, DocumentRow[]>>(new Map())
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(false)
  const [scanOuvert, setScanOuvert] = useState(false)
  const [membres, setMembres] = useState<Membre[]>([])
  const [membreId, setMembreId] = useState('')
  // Scan déjà envoyé pour ce salarié (undefined = recherche en cours) : on le retrouve au lieu d'en refaire un.
  const [scanMembre, setScanMembre] = useState<string | null | undefined>(undefined)
  const [noms, setNoms] = useState<Map<string, string>>(new Map())
  const [aSupprimer, setASupprimer] = useState<TourneeColis | null>(null)
  const [suppression, setSuppression] = useState(false)
  const [carte, setCarte] = useState(false)
  const [masques, setMasques] = useState<Set<string>>(new Set())
  const [positions, setPositions] = useState<PositionLivreur[]>([])
  const [calcul, setCalcul] = useState<string | null>(null)
  const [aRouvrir, setARouvrir] = useState<TourneeColis | null>(null)
  const [aCalculer, setACalculer] = useState<TourneeColis | null>(null)
  const [maintenant, setMaintenant] = useState(() => Date.now())

  const demande = useRef(0)
  const recharger = useCallback(async () => {
    const n = ++demande.current
    const t = await listerTourneesColis({ du: date, au: date })
    if (n !== demande.current) return
    setCharge(true)
    if (t.error) { setErreur(t.error.message); setTournees([]); setArrets([]); return }
    const a = await arretsDesTournees(t.data.map(x => x.id))
    if (n !== demande.current) return
    if (a.error) { setErreur(a.error.message); return }
    setErreur(null)
    setTournees(t.data)
    setArrets(a.data)
    const ph = await photosSynthese(t.data.map(x => x.id))
    if (n !== demande.current) return
    const m = new Map<string, DocumentRow[]>()
    for (const d of ph.data) if (d.entity_id) m.set(d.entity_id, [...(m.get(d.entity_id) ?? []), d])
    setSyntheses(m)
  }, [date])

  useEffect(() => { recharger() }, [recharger])

  // Suivi en direct : positions partagées par les livreurs, relues toutes les 30 s (et
  // l'avancement des tournées avec), seulement pour aujourd'hui.
  const estAujourdhui = date === toLocalISO(new Date())
  useEffect(() => {
    if (!estAujourdhui) return
    let annule = false
    const lire = () => positionsLivreurs().then(({ data }) => { if (!annule) { setPositions(data); setMaintenant(Date.now()) } })
    lire()
    const id = window.setInterval(() => { lire(); if (carte && !document.hidden) recharger() }, 30_000)
    return () => { annule = true; window.clearInterval(id) }
  }, [estAujourdhui, carte, recharger])

  // Salariés et noms de leurs clients : seulement quand on ouvre le scanner.
  useEffect(() => {
    if (!scanOuvert || membres.length) return
    membresPourTournee().then(async ({ data }) => {
      setMembres(data)
      setNoms(await nomsClients([...new Set(data.flatMap(m => m.clients_messagerie))]))
    })
  }, [scanOuvert, membres.length])

  // Une couleur par salarié (ordre alphabétique : stable d'un rechargement à l'autre).
  const couleurs = useMemo(() => {
    const noms = [...new Map(tournees.map(t => [t.member_id, t.team_members?.full_name ?? ''])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
    return new Map(noms.map(([id], i) => [id, colorForIndex(i)]))
  }, [tournees])

  const lignes = useMemo(() => tournees.map(t => {
    const siens = arrets.filter(a => a.tournee_id === t.id)
    const c = compteursTournee(siens)
    // Position de CETTE tournée, de moins de 3 h (une ligne oubliée ne traîne pas sur la carte).
    const pos = estAujourdhui ? positions.find(p => p.member_id === t.member_id && p.tournee_id === t.id
      && maintenant - new Date(p.maj_le).getTime() < 3 * 3_600_000) : undefined
    return { t, c, pct: avancementPct(c), arrets: siens, couleur: couleurs.get(t.member_id) ?? '#2563eb', pos }
  }), [tournees, arrets, couleurs, positions, estAujourdhui, maintenant])

  const visibles = lignes.filter(l => !masques.has(l.t.member_id))
  const couches = useMemo(() => visibles.map(l => {
    const mode = modeOrdre(l.t)
    return { id: l.t.id, couleur: l.couleur, arrets: l.arrets, mode, trajet: l.t.trajet ?? null, prochainId: prochainDansOrdre(l.arrets, mode)?.id ?? null }
  }), [visibles])
  const positionsCarte = visibles.filter(l => l.pos).map(l => ({
    id: l.t.member_id, lat: l.pos!.lat, lng: l.pos!.lng, couleur: l.couleur, ancien: positionAncienne(l.pos!.maj_le, maintenant),
    libelle: `${(l.t.team_members?.full_name ?? 'Salarié').split(' ')[0]} · ${ilYA(l.pos!.maj_le, maintenant)}`,
  }))

  const demanderCalcul = (t: TourneeColis) => {
    // Tournée déjà en route ou ordre posé à la main : un recalcul complet l'écraserait.
    if (t.statut === 'en_cours' || modeOrdre(t) === 'manuel') setACalculer(t)
    else void calculer(t)
  }

  const calculer = async (t: TourneeColis) => {
    setACalculer(null)
    setCalcul(t.id)
    const { data, error } = await calculerItineraire({ tourneeId: t.id, mode: 'tout' })
    setCalcul(null)
    if (error || !data) { toast(error?.message ?? 'Calcul impossible', 'error'); return }
    toast(data.message ?? `Itinéraire calculé : ${libelleDistance(data.km_total * 1000)}`, 'success')
    recharger()
  }

  const rouvrir = async () => {
    if (!aRouvrir) return
    const { error } = await rouvrirTournee(aRouvrir.id)
    setARouvrir(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée rouverte : le salarié peut de nouveau la modifier', 'success')
    recharger()
  }

  const basculerMasque = (id: string) => setMasques(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const membre = membres.find(m => m.id === membreId) ?? null
  useEffect(() => {
    if (!membreId) return
    let annule = false
    trouverScan(membreId).then(s => { if (!annule) setScanMembre(s?.id ?? null) })
    return () => { annule = true }
  }, [membreId])
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
        {lignes.length > 0 && (
          <Button size="compact" variant={carte ? 'primary' : 'secondary'} onClick={() => setCarte(v => !v)}>
            <IconeCarte size={14} /> Carte du jour
          </Button>
        )}
        {peutScanner && !erreur && (
          <Button size="compact" onClick={() => setScanOuvert(true)}>
            <ScanText size={14} /> Scanner pour un salarié
          </Button>
        )}
      </div>
      <div className="p-3 flex flex-col gap-3">
        {carte && lignes.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Salariés affichés">
              {lignes.filter((l, i, tab) => tab.findIndex(x => x.t.member_id === l.t.member_id) === i).map(l => {
                const siennes = lignes.filter(x => x.t.member_id === l.t.member_id)
                const km = siennes.reduce((s, x) => s + (x.t.trajet?.km_total ?? 0), 0)
                const pct = Math.round(siennes.reduce((s, x) => s + x.pct, 0) / siennes.length)
                const masque = masques.has(l.t.member_id)
                return (
                  <button key={l.t.member_id} type="button" aria-pressed={!masque} onClick={() => basculerMasque(l.t.member_id)}
                    className={`min-h-10 px-3 inline-flex items-center gap-2 rounded-[var(--r-md)] border text-xs ${
                      masque ? 'border-[var(--border)] opacity-50' : 'border-[var(--border-strong)]'}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.couleur }} />
                    <strong className="text-[var(--text)]">{l.t.team_members?.full_name ?? 'Salarié'}</strong>
                    <span className="text-[var(--text-muted)] tabular-nums">{pct} %{km ? ` · ${libelleDistance(km * 1000)}` : ''}</span>
                  </button>
                )
              })}
            </div>
            <Suspense fallback={<Skeleton className="h-[26rem]" />}>
              <CarteTournee couches={couches} positions={positionsCarte} hauteur="h-[26rem]" />
            </Suspense>
          </>
        )}
        {erreur ? (
          <p className="text-sm text-[var(--text-muted)]">{erreur}</p>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Aucune feuille de route scannée ce jour.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {lignes.map(({ t, c, pct, couleur, pos, arrets: siens }) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                {carte && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: couleur }} aria-hidden />}
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
                    {siens.some(a => !a.statut && a.en_pause_le) && (
                      <span className="text-[var(--warning)]">{siens.filter(a => !a.statut && a.en_pause_le).length} en pause</span>
                    )}
                    {c.collectes > 0 && <span>Collectes {c.collectesTraitees} / {c.collectes}</span>}
                    {t.trajet && <span>{libelleDistance(t.trajet.km_total * 1000)}{modeOrdre(t) === 'manuel' ? ' · ordre manuel' : ''}</span>}
                    {(syntheses.get(t.id) ?? []).map((d, i) => (
                      <button key={d.id} type="button" className="underline text-[var(--text)]"
                        onClick={async () => { const u = await urlPhotoArret(d); if (u) window.open(u, '_blank', 'noopener'); else toast('Photo introuvable', 'error') }}>
                        Synthèse {i + 1}
                      </button>
                    ))}
                    {pos && (
                      <span className={`inline-flex items-center gap-1 ${positionAncienne(pos.maj_le, maintenant) ? '' : 'text-[var(--success)]'}`}>
                        <Radio size={11} /> position {ilYA(pos.maj_le, maintenant)}
                      </span>
                    )}
                  </span>
                </div>
                {peutScanner && t.statut !== 'cloturee' && (
                  <BoutonIcone icone={Route} taille="sm" libelle={calcul === t.id ? 'Calcul…' : "Calculer l'itinéraire"}
                    disabled={calcul != null} onClick={() => demanderCalcul(t)} />
                )}
                {peutScanner && t.statut === 'cloturee' && (
                  <BoutonIcone icone={RotateCcw} taille="sm" libelle="Rouvrir la tournée" onClick={() => setARouvrir(t)} />
                )}
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
            <select value={membreId} onChange={e => { setScanMembre(undefined); setMembreId(e.target.value) }} className="field">
              <option value="">Choisir…</option>
              {membres.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </Field>
          {membre && scanMembre !== undefined && (
            <ScanFeuilleRoute key={`${membre.id}-${scanMembre ?? ''}`} companyId={companyId} memberId={membre.id} nomSalarie={membre.full_name}
              date={date} clients={clientsMembre} reprendre={scanMembre}
              onAnnuler={() => { setScanOuvert(false); setMembreId('') }}
              onCree={() => { setScanOuvert(false); setMembreId(''); recharger() }} />
          )}
        </div>
      </Drawer>

      <ConfirmDialog open={aSupprimer != null} title="Supprimer cette tournée de colis ?"
        message={`Feuille de ${aSupprimer?.team_members?.full_name ?? 'ce salarié'} : les arrêts et leurs statuts seront effacés.`}
        loading={suppression} onConfirm={supprimer} onCancel={() => setASupprimer(null)} />

      <ConfirmDialog open={aCalculer != null} title="Recalculer l'itinéraire ?"
        message="La tournée est en cours ou son ordre a été posé à la main : le recalcul complet remplace cet ordre."
        confirmLabel="Recalculer" onConfirm={() => aCalculer && calculer(aCalculer)} onCancel={() => setACalculer(null)} />

      <ConfirmDialog open={aRouvrir != null} title="Rouvrir cette tournée ?"
        message={`Feuille de ${aRouvrir?.team_members?.full_name ?? 'ce salarié'} : il pourra de nouveau changer les statuts. Sa journée de colis n'est pas modifiée.`}
        confirmLabel="Rouvrir" onConfirm={rouvrir} onCancel={() => setARouvrir(null)} />
    </div>
  )
}
