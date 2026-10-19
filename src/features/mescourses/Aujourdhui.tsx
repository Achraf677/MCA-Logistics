import { useEffect, useState, type ReactNode } from 'react'
import { Flag, Loader2, Route as RouteIcon, ScanText } from 'lucide-react'
import { Skeleton } from '../../shared/ui/Skeleton'
import { avancementParCategorie, type CategorieArret } from '../../shared/lib/tourneesColisRoute'
import { compteursTournee, type CompteursTournee } from '../../shared/lib/tourneesColis'
import { listerTourneesColis, arretsDesTournees, type ScanSuivi } from '../../shared/lib/tourneesColis.queries'
import { jourParis } from '../../shared/lib/relaisPoste'
import { getMesCourses } from './mescourses.queries'
import type { EtatFiche, MaFiche } from './mescourses.types'
import { Carte, MessageErreur, GardeFiche, boutonPrimaireCls } from './EspaceCommun'

interface Recap { c: CompteursTournee; categories: CategorieArret[]; tournees: number; terminees: number; km: number | null; minutes: number | null }

/**
 * « Aujourd'hui » : le récap de ma journée en un coup d'œil (colis livrés / en attente / retours,
 * arrêts faits, kilomètres prévus), lu depuis mes tournées du jour. Les éventuelles courses express
 * du jour s'affichent dessous (`express`), seulement s'il y en a.
 */
export function Aujourdhui({ fiche, scan, onOuvrirTournee, express }: { fiche: EtatFiche; scan: ScanSuivi | null; onOuvrirTournee: () => void; express: ReactNode }) {
  const [aExpress, setAExpress] = useState(false)
  useEffect(() => {
    const j = jourParis()
    getMesCourses(j, j).then(({ data }) => setAExpress((data ?? []).length > 0))
  }, [])
  return (
    <div className="flex flex-col gap-4">
      {scan && <CarteScan scan={scan} onOuvrir={onOuvrirTournee} />}
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
        c: compteursTournee(a.data), categories: avancementParCategorie(a.data), tournees: t.data.length, terminees: t.data.filter(x => x.statut === 'cloturee').length,
        km: km > 0 ? Math.round(km) : null, minutes: minutes > 0 ? minutes : null,
      })
    })()
    return () => { annule = true }
  }, [fiche.id])

  if (recap === undefined) return <Skeleton className="h-48" />
  if (!recap) {
    return (
      <Carte>
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
    <div className="flex flex-col gap-3">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {fini
        ? <p className="flex items-center justify-center gap-2 min-h-14 text-lg font-semibold text-[var(--success)]"><Flag size={20} /> Tournée terminée</p>
        : <button className={`${boutonPrimaireCls} w-full min-h-14 text-base`} onClick={onOuvrirTournee}><RouteIcon size={20} /> Continuer ma tournée</button>}
      <Carte>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-4xl font-bold tabular-nums text-[var(--text)]">{c.arretsTraites}<span className="text-xl font-medium text-[var(--text-muted)]"> / {c.arrets} arrêts</span></span>
            <span className="text-xl font-semibold tabular-nums text-[var(--text-muted)]">{pct} %</span>
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
        <p className="text-sm text-[var(--text-muted)]">{c.colisTraites} / {c.colis} colis traités</p>
      </Carte>
      <Carte className="gap-3">
        <ul className="flex flex-col gap-3">
          {recap.categories.map(cat => (
            <li key={cat.type} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-base">
                <span className="font-semibold" style={{ color: cat.couleur }}>{cat.libelle}</span>
                <span className="tabular-nums text-[var(--text)]">{cat.traites} / {cat.total}</span>
              </div>
              <div className="h-3 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden" aria-hidden>
                <div className="h-full" style={{ width: `${cat.total ? Math.round((cat.traites / cat.total) * 100) : 0}%`, background: cat.couleur }} />
              </div>
            </li>
          ))}
        </ul>
        {(recap.km != null || recap.minutes != null) && (
          <p className="pt-3 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            {recap.km != null && <>Trajet prévu : <strong className="text-[var(--text)]">{recap.km} km</strong></>}
            {recap.km != null && recap.minutes != null && ' · '}
            {recap.minutes != null && <>environ <strong className="text-[var(--text)]">{Math.floor(recap.minutes / 60)} h {String(recap.minutes % 60).padStart(2, '0')}</strong></>}
          </p>
        )}
      </Carte>
    </div>
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

/** Lecture de la feuille de route (faite sur le serveur) : avancement, ou « prête à vérifier ». */
function CarteScan({ scan, onOuvrir }: { scan: ScanSuivi; onOuvrir: () => void }) {
  const total = scan.pages.length
  const faites = scan.pages.filter(p => p.etat === 'ok' || p.etat === 'erreur').length
  const enCours = scan.statut === 'en_cours'
  const pct = total ? Math.round((faites / total) * 100) : 0
  return (
    <Carte>
      <div className="flex items-center gap-3">
        {enCours ? <Loader2 size={22} className="animate-spin text-[var(--brand)] shrink-0" /> : <ScanText size={22} className="text-[var(--brand)] shrink-0" />}
        <p className="flex-1 min-w-0 text-base font-semibold text-[var(--text)]">
          {enCours ? `Lecture de ta feuille : ${faites} / ${total} page${total > 1 ? 's' : ''}`
            : scan.statut === 'pret' ? 'Ta feuille est lue : vérifie et crée ta tournée'
            : scan.statut === 'brouillon' ? 'Scan de ta feuille commencé : reprends-le'
            : 'Lecture de ta feuille impossible'}
        </p>
      </div>
      {enCours && (
        <div className="h-3 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
          <div className="h-full bg-[var(--brand)] transition-[width] duration-500" style={{ width: `${Math.max(pct, 6)}%` }} />
        </div>
      )}
      <button className={`${boutonPrimaireCls} w-full`} onClick={onOuvrir}>
        <RouteIcon size={18} /> {enCours ? 'Voir la lecture' : scan.statut === 'pret' ? 'Voir mes arrêts' : scan.statut === 'brouillon' ? 'Reprendre' : 'Réessayer'}
      </button>
    </Carte>
  )
}
