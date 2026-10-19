import { useEffect, useState, type ReactNode } from 'react'
import { Flag, Route as RouteIcon, ClipboardList } from 'lucide-react'
import { Skeleton } from '../../shared/ui/Skeleton'
import { compteursTournee, type CompteursTournee } from '../../shared/lib/tourneesColis'
import { listerTourneesColis, arretsDesTournees } from '../../shared/lib/tourneesColis.queries'
import { jourParis } from '../../shared/lib/relaisPoste'
import { getMesCourses } from './mescourses.queries'
import type { EtatFiche, MaFiche } from './mescourses.types'
import { Carte, TitreCarte, MessageErreur, GardeFiche, boutonPrimaireCls } from './EspaceCommun'

interface Recap { c: CompteursTournee; tournees: number; terminees: number; km: number | null; minutes: number | null }

/**
 * « Aujourd'hui » : le récap de ma journée en un coup d'œil (colis livrés / en attente / retours,
 * arrêts faits, kilomètres prévus), lu depuis mes tournées du jour. Les éventuelles courses express
 * du jour s'affichent dessous (`express`), seulement s'il y en a.
 */
export function Aujourdhui({ fiche, onOuvrirTournee, express }: { fiche: EtatFiche; onOuvrirTournee: () => void; express: ReactNode }) {
  const [aExpress, setAExpress] = useState(false)
  useEffect(() => {
    const j = jourParis()
    getMesCourses(j, j).then(({ data }) => setAExpress((data ?? []).length > 0))
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <GardeFiche fiche={fiche}>{f => <RecapJour fiche={f} onOuvrirTournee={onOuvrirTournee} />}</GardeFiche>
      {aExpress && express}
    </div>
  )
}

function RecapJour({ fiche, onOuvrirTournee }: { fiche: MaFiche; onOuvrirTournee: () => void }) {
  const [recap, setRecap] = useState<Recap | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    const jour = jourParis()
    ;(async () => {
      const t = await listerTourneesColis({ du: jour, au: jour, memberId: fiche.id })
      if (annule) return
      if (t.error) { setErreur(t.error.message); setRecap(null); return }
      if (!t.data.length) { setRecap(null); return }
      const a = await arretsDesTournees(t.data.map(x => x.id))
      if (annule) return
      if (a.error) setErreur(a.error.message)
      const km = t.data.reduce((s, x) => s + (x.trajet?.km_total ?? 0), 0)
      const minutes = t.data.reduce((s, x) => s + (x.trajet?.duree_min ?? 0), 0)
      setRecap({
        c: compteursTournee(a.data), tournees: t.data.length, terminees: t.data.filter(x => x.statut === 'cloturee').length,
        km: km > 0 ? Math.round(km) : null, minutes: minutes > 0 ? minutes : null,
      })
    })()
    return () => { annule = true }
  }, [fiche.id])

  if (recap === undefined) return <Skeleton className="h-48" />
  if (!recap) {
    return (
      <Carte>
        <TitreCarte icone={<ClipboardList size={18} />}>Aujourd’hui</TitreCarte>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        <p className="text-sm text-[var(--text-muted)]">Pas de tournée de colis aujourd’hui.</p>
        <button className={`${boutonPrimaireCls} w-full`} onClick={onOuvrirTournee}><RouteIcon size={18} /> Ma tournée</button>
      </Carte>
    )
  }
  const { c } = recap
  const pct = c.arrets > 0 ? Math.round((c.arretsTraites / c.arrets) * 100) : 0
  const fini = recap.terminees === recap.tournees
  return (
    <Carte>
      <TitreCarte icone={<ClipboardList size={18} />}>Aujourd’hui</TitreCarte>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold tabular-nums text-[var(--text)]">{c.arretsTraites}<span className="text-lg font-medium text-[var(--text-muted)]"> / {c.arrets} arrêts</span></span>
          <span className="text-lg font-semibold tabular-nums text-[var(--text-muted)]">{pct} %</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-[var(--bg-elevated)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Chiffre n={c.colisLivres} libelle="Livrés" couleur="var(--success)" />
        <Chiffre n={c.colisAttente} libelle="En attente" couleur="var(--warning)" />
        <Chiffre n={c.colisRetour} libelle="Retours" couleur="var(--danger)" />
      </div>
      {(recap.km != null || recap.minutes != null) && (
        <p className="text-sm text-[var(--text-muted)]">
          {recap.km != null && <>Trajet prévu : <strong className="text-[var(--text)]">{recap.km} km</strong></>}
          {recap.km != null && recap.minutes != null && ' · '}
          {recap.minutes != null && <>environ <strong className="text-[var(--text)]">{Math.floor(recap.minutes / 60)} h {String(recap.minutes % 60).padStart(2, '0')}</strong></>}
        </p>
      )}
      {fini
        ? <p className="flex items-center gap-2 text-base font-semibold text-[var(--success)]"><Flag size={18} /> Tournée terminée</p>
        : <button className={`${boutonPrimaireCls} w-full`} onClick={onOuvrirTournee}><RouteIcon size={18} /> Continuer ma tournée</button>}
    </Carte>
  )
}

function Chiffre({ n, libelle, couleur }: { n: number; libelle: string; couleur: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] py-2">
      <span className="block text-2xl font-bold tabular-nums" style={{ color: couleur }}>{n}</span>
      <span className="block text-xs text-[var(--text-muted)]">{libelle}</span>
    </div>
  )
}
