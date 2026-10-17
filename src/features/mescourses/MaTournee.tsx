import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, ScanText, Check, MoreHorizontal, Trash2, Store, PackagePlus, Navigation2,
  ClipboardList, RotateCcw, MessageSquare,
} from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ScanFeuilleRoute } from '../../shared/ui/ScanFeuilleRoute'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import {
  LIBELLE_STATUT_ARRET, LIBELLE_STATUT_TOURNEE, LIBELLE_TYPE_ARRET,
  type ArretColis, type StatutArretColis, type TourneeColis,
} from '../../shared/lib/tourneesColis'
import {
  listerTourneesColis, arretsDesTournees, majArret, supprimerTourneeColis, nomsClients,
} from '../../shared/lib/tourneesColis.queries'
import type { EtatFiche, MaFiche } from './mescourses.types'
import { decalerJour, borneAujourdhui } from './espace.logic'
import { libelleDateCourte } from './mescourses.logic'
import {
  grouperParCommune, prochainArret, statutsProposes, libelleAdresse, libelleCompteurs, lireColisRemis,
  patchStatut, compteursTournee, familleStatut,
} from './tourneeColis.logic'
import { Carte, MessageErreur, GardeFiche, champCls, boutonPrimaireCls, boutonSecondaireCls } from './EspaceCommun'

const aujourdhui = () => toLocalISO(new Date())

const COULEUR_FAMILLE = { livre: 'success', attente: 'warning', retour: 'danger' } as const

/**
 * Ma tournée (messagerie) : le salarié scanne sa feuille de route du matin (une photo par
 * page), vérifie les arrêts lus, puis les traite un par un : « Livré » en un geste, ou une
 * autre issue selon le type (domicile, point relais, collecte). Ordre de la feuille, groupé
 * par commune (le tri par route viendra dans un lot suivant).
 */
export function MaTournee({ fiche }: { fiche: EtatFiche }) {
  return <GardeFiche fiche={fiche}>{f => <MaTourneeFiche fiche={f} />}</GardeFiche>
}

function MaTourneeFiche({ fiche }: { fiche: MaFiche }) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [date, setDate] = useState(aujourdhui)
  const [tournees, setTournees] = useState<TourneeColis[]>([])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [arrets, setArrets] = useState<ArretColis[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [scan, setScan] = useState(false)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [aSupprimer, setASupprimer] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const recharger = useCallback(async (garder?: string | null) => {
    setErreur(null)
    const t = await listerTourneesColis({ du: date, au: date, memberId: fiche.id })
    if (t.error) { setErreur(t.error.message); setTournees([]); setArrets([]); setChargement(false); return }
    setTournees(t.data)
    const ids = t.data.map(x => x.id)
    const a = await arretsDesTournees(ids)
    if (a.error) setErreur(a.error.message)
    setArrets(a.data)
    setChoisie(prev => {
      const cible = garder ?? prev
      return cible && ids.includes(cible) ? cible : (ids[ids.length - 1] ?? null)
    })
    setChargement(false)
  }, [date, fiche.id])

  useEffect(() => { setChargement(true); setScan(false); recharger() }, [recharger])

  useEffect(() => {
    let annule = false
    nomsClients(fiche.clients_messagerie).then(m => {
      if (!annule) setClients(fiche.clients_messagerie.map(id => ({ id, name: m.get(id) ?? 'Client' })))
    })
    return () => { annule = true }
  }, [fiche.clients_messagerie])

  const tournee = tournees.find(t => t.id === choisie) ?? null
  const arretsTournee = useMemo(() => arrets.filter(a => a.tournee_id === choisie), [arrets, choisie])
  const auj = aujourdhui()
  const estAujourdhui = date === auj

  const surGeste = (maj: ArretColis) => {
    setArrets(prev => prev.map(a => (a.id === maj.id ? maj : a)))
    if (tournee?.statut === 'a_faire' && maj.statut) {
      setTournees(prev => prev.map(t => (t.id === tournee.id ? { ...t, statut: 'en_cours' } : t)))
    }
  }

  const supprimer = async () => {
    if (!tournee) return
    setSuppression(true)
    const { error } = await supprimerTourneeColis(tournee.id)
    setSuppression(false)
    setASupprimer(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée supprimée', 'success')
    recharger(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BoutonIcone icone={ChevronLeft} libelle="Jour précédent" onClick={() => setDate(d => decalerJour(d, -1))} />
        <div className="flex-1 min-w-0 text-center">
          <span className="block text-base font-semibold text-[var(--text)] first-letter:uppercase">
            {estAujourdhui ? "Aujourd'hui" : libelleDateCourte(date)}
          </span>
          {!estAujourdhui && (
            <button onClick={() => setDate(auj)} className="text-xs text-[var(--brand)] underline min-h-7">
              Revenir à aujourd'hui
            </button>
          )}
        </div>
        <BoutonIcone icone={ChevronRight} libelle="Jour suivant" disabled={date >= auj}
          onClick={() => setDate(d => borneAujourdhui(decalerJour(d, 1), auj))} />
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {scan && companyId ? (
        <Carte>
          <h2 className="text-base font-semibold text-[var(--text)]">Scanner ma feuille de route</h2>
          <ScanFeuilleRoute companyId={companyId} memberId={fiche.id} date={date} clients={clients}
            basCollant="bottom-[calc(4rem+env(safe-area-inset-bottom))]"
            onAnnuler={() => setScan(false)}
            onCree={id => { setScan(false); setChargement(true); recharger(id) }} />
        </Carte>
      ) : chargement ? (
        <Skeleton className="h-64" />
      ) : !tournee ? (
        <Carte>
          <EmptyState icon={<ClipboardList size={28} />} title="Pas de tournée ce jour"
            description="Photographie ta feuille de route (une photo par page) : le site en fait la liste de tes arrêts." />
          {estAujourdhui && (
            <button type="button" className={boutonPrimaireCls} onClick={() => setScan(true)}>
              <ScanText size={18} /> Scanner ma feuille de route
            </button>
          )}
        </Carte>
      ) : (
        <>
          {tournees.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tournées du jour">
              {tournees.map((t, i) => (
                <button key={t.id} role="tab" aria-selected={t.id === choisie} onClick={() => setChoisie(t.id)}
                  className={`min-h-10 px-3 rounded-[var(--r-md)] border text-sm font-medium ${t.id === choisie
                    ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                  Feuille {i + 1}{t.clients?.name ? ` · ${t.clients.name}` : ''}
                </button>
              ))}
            </div>
          )}
          <VueTournee tournee={tournee} arrets={arretsTournee} onGeste={surGeste} />
          <div className="flex flex-wrap gap-2">
            {estAujourdhui && (
              <button type="button" className={`${boutonSecondaireCls} flex-1`} onClick={() => setScan(true)}>
                <ScanText size={16} /> Scanner une autre feuille
              </button>
            )}
            {tournee.statut !== 'cloturee' && (
              <button type="button" className={`${boutonSecondaireCls} flex-1`} onClick={() => setASupprimer(true)}>
                <Trash2 size={16} /> Supprimer cette tournée
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog open={aSupprimer} title="Supprimer cette tournée ?"
        message="Les arrêts et ce que tu y as noté seront effacés. À faire seulement si le scan est raté."
        confirmLabel="Supprimer" loading={suppression}
        onConfirm={supprimer} onCancel={() => setASupprimer(false)} />
    </div>
  )
}

// ── Une tournée : compteurs, puis arrêts groupés par commune ────────────────

function VueTournee({ tournee, arrets, onGeste }: {
  tournee: TourneeColis
  arrets: ArretColis[]
  onGeste: (a: ArretColis) => void
}) {
  const c = useMemo(() => compteursTournee(arrets), [arrets])
  const groupes = useMemo(() => grouperParCommune(arrets), [arrets])
  const prochain = prochainArret(arrets)
  const lib = libelleCompteurs(c)
  const total = c.arrets + c.collectes
  const pct = total ? Math.round(((c.arretsTraites + c.collectesTraitees) / total) * 100) : 0
  const verrouillee = tournee.statut === 'cloturee'

  const allerAuProchain = () => {
    if (!prochain) return
    document.getElementById(`arret-${prochain.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      {/* Compteur en tête, collé en haut pendant le défilement. */}
      <div className="sticky top-0 z-[5] -mx-1 px-1 pt-1 pb-2 bg-[var(--bg)]">
        <Carte className="gap-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Arrêts</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--text)]">{lib.arrets}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Colis</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--text)]">{lib.colis}</p>
              </div>
            </div>
            <Badge color={tournee.statut === 'cloturee' ? 'muted' : tournee.statut === 'en_cours' ? 'info' : 'warning'}>
              {LIBELLE_STATUT_TOURNEE[tournee.statut]}
            </Badge>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden" aria-hidden>
            <div className="h-full bg-[var(--success)] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <span><strong className="text-[var(--success)]">{c.colisLivres}</strong> livrés</span>
            <span><strong className="text-[var(--warning)]">{c.colisAttente}</strong> en attente</span>
            <span><strong className="text-[var(--danger)]">{c.colisRetour}</strong> en retour</span>
            {c.collectes > 0 && <span>{c.collectesTraitees} / {c.collectes} collectes</span>}
          </p>
          {prochain && !verrouillee && (
            <button type="button" onClick={allerAuProchain}
              className="min-h-10 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] text-sm font-medium text-[var(--text)]">
              <Navigation2 size={16} /> Prochain : {libelleAdresse(prochain)}
            </button>
          )}
        </Carte>
      </div>

      {groupes.map(g => (
        <section key={g.cle} className="flex flex-col gap-2">
          <h3 className="flex items-baseline gap-2 px-1 text-sm font-semibold text-[var(--text)]">
            <span className="flex-1 min-w-0 truncate">{g.commune}{g.cp ? ` ${g.cp}` : ''}</span>
            <span className="text-xs font-normal tabular-nums text-[var(--text-muted)]">{g.traites} / {g.arrets.length}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {g.arrets.map(a => (
              <LigneArret key={a.id} arret={a} tournee={tournee} verrouillee={verrouillee} onGeste={onGeste} />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

// ── Un arrêt : « Livré » en un geste, le reste dans le panneau ───────────────

function LigneArret({ arret, tournee, verrouillee, onGeste }: {
  arret: ArretColis
  tournee: TourneeColis
  verrouillee: boolean
  onGeste: (a: ArretColis) => void
}) {
  const { toast } = useToast()
  const [ouvert, setOuvert] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [remis, setRemis] = useState(String(arret.colis_remis ?? arret.quantite))
  const [note, setNote] = useState(arret.note ?? '')
  const { fait, autres } = statutsProposes(arret.type)
  const famille = familleStatut(arret.statut)

  const ecrire = async (patch: Parameters<typeof majArret>[1], fermer = true) => {
    setOccupe(true)
    const { data, error } = await majArret(arret, patch, tournee)
    setOccupe(false)
    if (error || !data) { toast(error?.message ?? 'Enregistrement impossible', 'error'); return }
    onGeste(data)
    setRemis(String(data.colis_remis ?? data.quantite)); setNote(data.note ?? '')
    if (fermer) setOuvert(false)
  }

  const geste = (s: StatutArretColis | null, colis?: number | null) => ecrire(patchStatut(arret, s, colis))

  const livrerPartiel = () => {
    const n = lireColisRemis(remis, arret.quantite)
    if (n == null) { toast('Nombre de colis remis invalide', 'error'); return }
    geste(fait, n)
  }

  return (
    <li id={`arret-${arret.id}`} className={`flex flex-col gap-2 p-3 rounded-[var(--r-lg)] border bg-[var(--bg-card)] ${
      arret.statut ? 'border-[var(--border)] opacity-80' : 'border-[var(--border-strong)]'}`}>
      <div className="flex items-center gap-3">
        <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[var(--text-muted)]">{arret.rang}</span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-[var(--text)] break-words">{libelleAdresse(arret)}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>{arret.quantite} colis</span>
            {arret.type !== 'c' && (
              <span className="inline-flex items-center gap-1">
                {arret.type === 'rc' ? <Store size={13} /> : <PackagePlus size={13} />} {LIBELLE_TYPE_ARRET[arret.type]}
              </span>
            )}
            {arret.statut && famille && (
              <Badge color={COULEUR_FAMILLE[famille]}>
                {LIBELLE_STATUT_ARRET[arret.statut]}
                {famille === 'livre' && arret.colis_remis != null && arret.colis_remis < arret.quantite
                  ? ` ${arret.colis_remis}/${arret.quantite}` : ''}
              </Badge>
            )}
            {arret.note && <span className="inline-flex items-center gap-1"><MessageSquare size={12} /> {arret.note}</span>}
          </p>
        </div>
        {!verrouillee && !arret.statut && (
          <button type="button" onClick={() => geste(fait)} disabled={occupe}
            className="min-h-12 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--success)] text-black text-sm font-semibold disabled:opacity-40">
            <Check size={18} /> {arret.type === 'col' ? 'Collecté' : arret.type === 'rc' ? 'Remis' : 'Livré'}
          </button>
        )}
        {!verrouillee && (
          <BoutonIcone icone={MoreHorizontal} libelle={ouvert ? 'Fermer' : 'Autres issues'} actif={ouvert}
            onClick={() => setOuvert(o => !o)} />
        )}
      </div>

      {ouvert && !verrouillee && (
        <div className="flex flex-col gap-3 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-wrap gap-2">
            {autres.map(s => (
              <button key={s} type="button" onClick={() => geste(s)} disabled={occupe}
                aria-pressed={arret.statut === s}
                className={`min-h-11 px-3 rounded-[var(--r-md)] border text-sm font-medium disabled:opacity-40 ${
                  arret.statut === s ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                {LIBELLE_STATUT_ARRET[s]}
              </button>
            ))}
          </div>

          {arret.quantite > 1 && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-[var(--text)]">
                Colis remis
                <input type="text" inputMode="numeric" value={remis} aria-label="Colis remis"
                  onChange={e => setRemis(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  className={`${champCls} w-24 text-center`} />
              </label>
              <span className="pb-3 text-sm text-[var(--text-muted)]">/ {arret.quantite}</span>
              <button type="button" onClick={livrerPartiel} disabled={occupe} className={`${boutonSecondaireCls} flex-1`}>
                <Check size={16} /> {LIBELLE_STATUT_ARRET[fait]} (partiel)
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <label className="flex-1 flex flex-col gap-1 text-sm font-medium text-[var(--text)]">
              Note
              <input value={note} onChange={e => setNote(e.target.value.slice(0, 300))}
                placeholder="Code, étage, voisin…" className={champCls} />
            </label>
            <button type="button" disabled={occupe || note.trim() === (arret.note ?? '')}
              onClick={() => ecrire({ note: note.trim() || null }, false)} className={boutonSecondaireCls}>
              Enregistrer
            </button>
          </div>

          {arret.statut && (
            <button type="button" onClick={() => geste(null)} disabled={occupe}
              className="self-start min-h-10 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] underline">
              <RotateCcw size={14} /> Effacer le statut
            </button>
          )}
        </div>
      )}
    </li>
  )
}
