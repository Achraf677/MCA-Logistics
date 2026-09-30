import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import {
  ChevronRight, Euro, FileClock, Wallet, Plus,
  CalendarClock, Truck, CheckCircle2, AlarmClock, AlertTriangle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { BarresMensuelles } from '../../shared/ui/BarresMensuelles'
import { BoutonIcone, PanneauReglages } from '../../shared/ui/BoutonIcone'
import { formatCents, effectiveHtCts } from '../../shared/lib/money'
// Chargé à la demande : c'est le plus gros bloc du site (formulaire à 5
// onglets + génération de PDF), inutile tant qu'on ne l'ouvre pas.
const DrawerLivraison = lazy(() =>
  import('../livraisons/DrawerLivraison').then(m => ({ default: m.DrawerLivraison })))
import { STATUS_LABELS, STATUS_COLORS } from '../livraisons/livraisons.logic'
import type { DeliveryRow } from '../livraisons/livraisons.types'
import { getDashboard } from './dashboard.queries'
import {
  isoLocal, moisDeLaPeriode, agregerParMois, evolution,
  resumeJour, aEncaisser, resteAFacturer, eurosArrondis, eurosCourts,
  type PeriodeTendance, type PointTendance, type ResumeJour,
} from './dashboard.logic'

const PERIODES: Array<{ cle: PeriodeTendance; libelle: string }> = [
  { cle: '6m', libelle: '6 derniers mois' },
  { cle: '12m', libelle: '12 derniers mois' },
  { cle: 'ytd', libelle: 'Depuis janvier' },
]

interface Donnees {
  tendance12: PointTendance[]
  jour: ResumeJour
  aFacturer: { totalCts: number; nb: number }
  encaisser: { totalCts: number; retardCts: number; nbRetard: number; nb: number }
  recentes: DeliveryRow[]
}

/**
 * Accueil — « où en est la société », en 10 secondes.
 *
 * De haut en bas : la JOURNÉE (express : qu'est-ce qui roule, qu'est-ce qui
 * coince), l'ARGENT (fait, à facturer, à encaisser, marge), la TENDANCE, puis
 * l'activité récente. Un chauffeur n'arrive jamais ici (PilotageSection le
 * renvoie sur Mes courses).
 */
export function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [periode, setPeriode] = useState<PeriodeTendance>('6m')
  const [reglages, setReglages] = useState(false)
  // Barres plus basses sur téléphone : moins de défilement.
  const [grandEcran] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)

  const load = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    const aujourdhui = isoLocal(now)
    const douze = moisDeLaPeriode('12m', now)
    const r = await getDashboard(douze[0].debut, douze[douze.length - 1].fin, aujourdhui)
    setErreur(r.erreur?.message ?? null)
    setD({
      tendance12: agregerParMois(douze, r.livraisons),
      jour: resumeJour(r.jour, aujourdhui, now.getHours() * 60 + now.getMinutes()),
      aFacturer: resteAFacturer(r.livrees),
      encaisser: aEncaisser(r.facturees, aujourdhui),
      recentes: r.recentes,
    })
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Découpe en mémoire : changer de période ne refait aucune requête.
  const tendance = useMemo(() => {
    if (!d) return []
    const cles = new Set(moisDeLaPeriode(periode, new Date()).map(m => m.cle))
    return d.tendance12.filter(p => cles.has(p.cle))
  }, [d, periode])

  const ceMois = d?.tendance12[d.tendance12.length - 1]
  const moisPrecedent = d?.tendance12[d.tendance12.length - 2]
  const variation = ceMois && moisPrecedent ? evolution(moisPrecedent.caHtCts, ceMois.caHtCts) : null

  const nouvelle = () => { setSelected(null); setDrawerOpen(true) }
  const ouvrir = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  const prenom = profile?.full_name?.trim().split(/\s+/)[0]
  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Shell pageTitle="Dashboard">
      {/* TOUT SUR UN ÉCRAN (PC) : en-tête · journée + argent · tendance | activité. */}
      <div className="flex flex-col gap-4 min-w-0">

        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate">
            <span className="font-display text-[var(--fs-h3)] font-semibold">{prenom ? `Bonjour ${prenom}` : 'Bonjour'}</span>
            <span className="ml-2 text-[var(--fs-sm)] text-[var(--text-muted)] first-letter:uppercase hidden sm:inline">· {dateDuJour}</span>
          </p>
          <Button variant="primary" size="compact" onClick={nouvelle}>
            <Plus size={14} /> <span className="hidden sm:inline">Nouvelle livraison</span><span className="sm:hidden">Livraison</span>
          </Button>
        </div>

        {erreur && <p className="text-[var(--fs-sm)] text-[var(--danger)]">{erreur}</p>}

        {/* ── Journée + argent ── */}
        <div className="grid gap-3 lg:grid-cols-[1.4fr_2fr] [&>*]:min-w-0">
          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center justify-between pb-2">
              <span className={titreCls}>Aujourd'hui</span>
              <button onClick={() => navigate('/calendrier')}
                className="inline-flex items-center gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)]">
                Planning <ChevronRight size={13} />
              </button>
            </div>
            {loading || !d ? <Skeleton className="h-[58px]" /> : (
              <div className="grid grid-cols-5 gap-1.5">
                <CaseJour icone={<CalendarClock size={14} />} valeur={d.jour.aFaire} libelle="À faire" onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<Truck size={14} />} valeur={d.jour.enCours} libelle="En cours" onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<CheckCircle2 size={14} />} valeur={d.jour.livrees} libelle="Livrées" ton="success" onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<AlarmClock size={14} />} valeur={d.jour.enRetard} libelle="Retard" ton={d.jour.enRetard ? 'danger' : undefined} onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<AlertTriangle size={14} />} valeur={d.jour.echecs} libelle="Échecs" ton={d.jour.echecs ? 'danger' : undefined} onClick={() => navigate('/livraisons')} />
              </div>
            )}
          </section>

          <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
            {loading || !d || !ceMois ? [0, 1, 2].map(i => <Skeleton key={i} className="h-[98px]" />) : (
              <>
                <Chiffre libelle="CA HT du mois" court="CA du mois" icone={<Euro size={14} />} valeur={eurosArrondis(ceMois.caHtCts)}
                  detail={variation
                    ? <span style={{ color: variation.dir === 'up' ? 'var(--success)' : 'var(--danger)' }}>{variation.dir === 'up' ? '+' : ''}{variation.value} vs mois dernier</span>
                    : `${ceMois.nb} livraison${ceMois.nb > 1 ? 's' : ''}`}
                  onClick={() => navigate('/livraisons')} />
                <Chiffre libelle="Reste à facturer" court="À facturer" icone={<FileClock size={14} />} valeur={eurosArrondis(d.aFacturer.totalCts)}
                  ton={d.aFacturer.nb ? 'warning' : undefined}
                  detail={`${d.aFacturer.nb} livrée${d.aFacturer.nb > 1 ? 's' : ''} · HT`}
                  onClick={() => navigate('/livraisons')} />
                <Chiffre libelle="À encaisser" court="À encaisser" icone={<Wallet size={14} />} valeur={eurosArrondis(d.encaisser.totalCts)}
                  ton={d.encaisser.nbRetard ? 'danger' : undefined}
                  detail={d.encaisser.nbRetard
                    ? `dont ${eurosArrondis(d.encaisser.retardCts)} en retard`
                    : `${d.encaisser.nb} facture${d.encaisser.nb > 1 ? 's' : ''} · TTC`}
                  onClick={() => navigate('/encaissement')} />
              </>
            )}
          </div>
        </div>

        {/* ── Tendance | Activité ── */}
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <span className={titreCls}>Chiffre d'affaires HT</span>
                <span className="block text-[var(--fs-xs)] text-[var(--text-muted)]">{PERIODES.find(p => p.cle === periode)?.libelle}</span>
              </div>
              <BoutonIcone libelle="Réglages du graphique" actif={reglages} onClick={() => setReglages(o => !o)} />
            </div>
            {reglages && (
              <div className="mb-3">
                <PanneauReglages titre="Période">
                  <div className="flex flex-wrap gap-1">
                    {PERIODES.map(p => (
                      <button key={p.cle} type="button" onClick={() => { setPeriode(p.cle); setReglages(false) }}
                        className={`min-h-[36px] px-3 rounded-[var(--r-md)] text-[var(--fs-xs)] font-medium transition-colors ${
                          periode === p.cle ? 'bg-[var(--brand)] text-white' : 'border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}>
                        {p.libelle}
                      </button>
                    ))}
                  </div>
                </PanneauReglages>
              </div>
            )}
            {loading
              ? <Skeleton className="h-[278px]" />
              : <BarresMensuelles
                  hauteur={grandEcran ? 230 : 140}
                  points={tendance.map(t => ({ libelle: t.libelle, valeur: t.caHtCts }))}
                  formatCourt={eurosCourts}
                  formatLong={formatCents} />}
          </section>

          <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
              <span className={titreCls}>Activité récente</span>
              <button onClick={() => navigate('/livraisons')}
                className="inline-flex items-center gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)]">
                Tout voir <ChevronRight size={13} />
              </button>
            </div>
            {loading || !d ? (
              <div className="p-3 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
            ) : d.recentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-10 gap-3 text-[var(--text-muted)]">
                <p className="text-[var(--fs-sm)]">Aucune livraison enregistrée.</p>
                <Button variant="primary" size="compact" onClick={nouvelle}>Créer une livraison</Button>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {d.recentes.map(row => (
                  <button key={row.id} onClick={() => ouvrir(row)}
                    className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{row.clients?.name ?? '—'}</span>
                      <span className="block text-[var(--fs-xs)] text-[var(--text-muted)] truncate">
                        {dateCourte(row.date)}{row.team_members?.full_name && ` · ${row.team_members.full_name}`}
                      </span>
                    </span>
                    <span className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-3 shrink-0">
                      <span className="font-mono text-[var(--fs-sm)] text-[var(--text)]">{formatCents(effectiveHtCts(row))}</span>
                      <span className="sm:w-[92px] flex justify-end whitespace-nowrap [&_*]:whitespace-nowrap">
                        <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Suspense fallback={null}>
        <DrawerLivraison open={drawerOpen} onClose={() => setDrawerOpen(false)} delivery={selected} onSaved={load} />
      </Suspense>
    </Shell>
  )
}

const titreCls = 'text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest'

/** Un chiffre d'argent : compact, cliquable, arrondi à l'euro. */
function Chiffre({ libelle, court, icone, valeur, detail, ton, onClick }: {
  libelle: string
  /** Libellé mobile (un tiers d'écran de large). */
  court: string
  icone: React.ReactNode
  valeur: string
  detail: React.ReactNode
  ton?: 'warning' | 'danger'
  onClick: () => void
}) {
  const couleur = ton === 'danger' ? 'var(--danger)' : ton === 'warning' ? 'var(--warning)' : 'var(--text)'
  return (
    <button type="button" onClick={onClick}
      className="text-left flex flex-col gap-1 p-3 rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]
        hover:border-[var(--brand)] transition-colors min-w-0">
      <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[var(--fs-xs)] font-semibold uppercase tracking-wide text-[var(--text-muted)] truncate">
        <span className="hidden sm:inline-flex">{icone}</span>
        <span className="sm:hidden">{court}</span><span className="hidden sm:inline">{libelle}</span>
      </span>
      <span className="font-mono font-semibold text-base sm:text-2xl leading-tight truncate" style={{ color: couleur }}>{valeur}</span>
      <span className="text-[10px] sm:text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{detail}</span>
    </button>
  )
}

/** 'AAAA-MM-JJ' → '30/09' sans passer par UTC. */
function dateCourte(iso: string): string {
  const [, m, j] = iso.split('-')
  return `${j}/${m}`
}

/** Une case du bloc « Aujourd'hui » : un chiffre, un mot, un clic. */
function CaseJour({ icone, valeur, libelle, ton, onClick }: {
  icone: React.ReactNode
  valeur: number
  libelle: string
  ton?: 'success' | 'danger'
  onClick: () => void
}) {
  const couleur = ton === 'danger' ? 'text-[var(--danger)]' : ton === 'success' ? 'text-[var(--success)]' : 'text-[var(--text)]'
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-1.5 rounded-[var(--r-md)] transition-colors hover:bg-[var(--bg-card-hover)] ${
        ton === 'danger' ? 'bg-[var(--danger)]/10' : 'bg-[var(--bg-elevated)]'
      }`}>
      <span className={`${ton ? couleur : 'text-[var(--text-muted)]'}`}>{icone}</span>
      <span className={`font-mono text-lg font-semibold leading-none ${couleur}`}>{valeur}</span>
      <span className="text-[10px] sm:text-[var(--fs-xs)] text-[var(--text-muted)] text-center leading-tight">{libelle}</span>
    </button>
  )
}
