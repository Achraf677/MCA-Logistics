import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronRight, Euro, FileClock, X, CalendarDays, BarChart3, History,
  CalendarClock, Truck, CheckCircle2, AlarmClock, AlertTriangle, TrendingUp, TrendingDown,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { Skeleton } from '../../shared/ui/Skeleton'
import { BarresMensuelles } from '../../shared/ui/BarresMensuelles'
import { BoutonIcone, PanneauReglages } from '../../shared/ui/BoutonIcone'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { MiniCourbe } from '../../shared/ui/MiniCourbe'
import { SectionCard, PastilleIcone, COULEUR_TON, type TonCarte } from '../../shared/ui/SectionCard'
import { formatCents, effectiveHtCts } from '../../shared/lib/money'
import { STATUS_LABELS, STATUS_COLORS } from '../livraisons/livraisons.logic'
import { getDashboard, getLivraisonsDuMois, type LigneMois } from './dashboard.queries'
import {
  isoLocal, moisDeLaPeriode, agregerParMois, evolution, libelleMoisLong,
  resumeJour, resteAFacturer, eurosArrondis, eurosCourts,
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
  recentes: LigneMois[]
}

/**
 * Accueil — « où en est la société », en 10 secondes. ÉCRAN DE CONSULTATION :
 * aucune modification ici ; chaque chiffre et chaque ligne mène à l'onglet où
 * l'on agit (une livraison s'ouvre dans Livraisons via `?ouvrir=<id>`).
 *
 * Tout tient sur un écran PC : en-tête · journée + argent · tendance | liste.
 * La liste de droite montre l'activité récente, ou les livraisons du mois
 * cliqué sur le graphique. Un chauffeur n'arrive jamais ici (PilotageSection).
 */
export function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [periode, setPeriode] = useState<PeriodeTendance>('6m')
  const [reglages, setReglages] = useState(false)
  // Mois cliqué sur le graphique (clé 'AAAA-MM') et ses livraisons.
  const [moisChoisi, setMoisChoisi] = useState<PointTendance | null>(null)
  const [lignesMois, setLignesMois] = useState<LigneMois[] | null>(null)
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

  const choisirMois = async (p: PointTendance) => {
    if (moisChoisi?.cle === p.cle) { fermerMois(); return }
    setMoisChoisi(p)
    setLignesMois(null)
    // Sur téléphone la liste est sous le graphique : on l'amène à l'écran.
    if (!grandEcran) requestAnimationFrame(() => document.getElementById('liste-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    const { data, error } = await getLivraisonsDuMois(p.debut, p.fin)
    if (error) setErreur(error.message)
    setLignesMois(data ?? [])
  }
  const fermerMois = () => { setMoisChoisi(null); setLignesMois(null) }

  const ceMois = d?.tendance12[d.tendance12.length - 1]
  const moisPrecedent = d?.tendance12[d.tendance12.length - 2]
  const variation = ceMois && moisPrecedent ? evolution(moisPrecedent.caHtCts, ceMois.caHtCts) : null
  const ouvrir = (id: string) => navigate(`/livraisons?ouvrir=${id}`)

  const prenom = profile?.full_name?.trim().split(/\s+/)[0]
  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const indexChoisi = moisChoisi ? tendance.findIndex(t => t.cle === moisChoisi.cle) : -1

  const moyenneCts = useMemo(() => {
    const v = tendance.filter(t => t.caHtCts > 0)
    return v.length ? v.reduce((t, p) => t + p.caHtCts, 0) / v.length : 0
  }, [tendance])
  const alertes = d ? d.jour.enRetard + d.jour.echecs : 0

  return (
    <Shell pageTitle="Dashboard">
      {/* PC : occupe EXACTEMENT la hauteur visible (écran − barre du haut − marges
          de <main>) ; la dernière ligne prend le reste, le graphique et la liste
          s'y ajustent. Plus rien à faire défiler, quelle que soit la résolution. */}
      <div className="flex flex-col gap-4 min-w-0 lg:h-[min(calc(100dvh-var(--topbar-h)-2.75rem),64rem)]">

        {/* ── En-tête : salutation, date, alerte du jour ── */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h1 className="min-w-0 truncate font-display text-2xl font-semibold leading-tight">
            {prenom ? `Bonjour ${prenom}` : 'Bonjour'}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {alertes > 0 && (
              <button type="button" onClick={() => navigate('/livraisons')}
                className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/15 transition-colors">
                <AlertTriangle size={13} />
                {d?.jour.enRetard ? `${d.jour.enRetard} en retard` : ''}
                {d?.jour.enRetard && d?.jour.echecs ? ' · ' : ''}
                {d?.jour.echecs ? `${d.jour.echecs} échec${d.jour.echecs > 1 ? 's' : ''}` : ''}
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs font-semibold first-letter:uppercase text-[var(--text-muted)]">
              <CalendarDays size={13} /> {dateDuJour}
            </span>
          </div>
        </header>
        <div className="-mt-2 h-0.5 w-24 rounded-full" style={{ background: 'var(--grad)' }} aria-hidden="true" />

        {erreur && <p className="text-sm text-[var(--danger)]">{erreur}</p>}

        {/* ── Journée + argent ── */}
        <div className="grid gap-4 lg:grid-cols-[1.55fr_1.15fr_0.9fr] [&>*]:min-w-0">
          <SectionCard titre="Aujourd'hui" icone={<CalendarDays size={15} />} ton="info"
            droite={(
              <button onClick={() => navigate('/planning-hub?tab=planning')}
                className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                Planning <ChevronRight size={13} />
              </button>
            )}
            corpsClassName="px-4 pb-4 pt-1 flex flex-col gap-3">
            {loading || !d ? <Skeleton className="h-[5.5rem]" /> : (
              <>
                <div className="grid grid-cols-5 gap-2 stagger">
                  <CaseJour icone={<CalendarClock size={14} />} valeur={d.jour.aFaire} libelle="À faire" ton="neutral" onClick={() => navigate('/livraisons')} />
                  <CaseJour icone={<Truck size={14} />} valeur={d.jour.enCours} libelle="En cours" ton="info" onClick={() => navigate('/livraisons')} />
                  <CaseJour icone={<CheckCircle2 size={14} />} valeur={d.jour.livrees} libelle="Livrées" ton="success" onClick={() => navigate('/livraisons')} />
                  <CaseJour icone={<AlarmClock size={14} />} valeur={d.jour.enRetard} libelle="Retard" ton="danger" alerte onClick={() => navigate('/livraisons')} />
                  <CaseJour icone={<AlertTriangle size={14} />} valeur={d.jour.echecs} libelle="Échecs" ton="danger" alerte onClick={() => navigate('/livraisons?filtre=echecs')} />
                </div>
                <RepartitionJour jour={d.jour} />
              </>
            )}
          </SectionCard>

          {loading || !d || !ceMois ? (
            <>
              <Skeleton className="h-[9.5rem]" />
              <Skeleton className="h-[9.5rem]" />
            </>
          ) : (
            <>
              <button type="button" onClick={() => choisirMois(ceMois)}
                className="group relative text-left rounded-[var(--r-xl)] border border-[var(--brand)]/35 shadow-[var(--shadow-card)] overflow-hidden p-4 flex flex-col transition-colors hover:border-[var(--brand)]"
                style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 26%, var(--bg-card)), var(--bg-card) 70%)' }}>
                <span className="flex items-center gap-2.5">
                  <PastilleIcone icone={<Euro size={15} />} ton="brand" />
                  <span className="font-display text-sm font-semibold uppercase tracking-wide">CA HT du mois</span>
                </span>
                <span className="mt-3 font-mono text-3xl xl:text-4xl font-semibold leading-none tabular-nums">{eurosArrondis(ceMois.caHtCts)}</span>
                <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {variation && (
                    <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] px-2 py-0.5 text-xs font-semibold"
                      style={{
                        color: variation.dir === 'up' ? 'var(--success)' : 'var(--danger)',
                        background: `color-mix(in srgb, ${variation.dir === 'up' ? 'var(--success)' : 'var(--danger)'} 16%, transparent)`,
                      }}>
                      {variation.dir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {variation.dir === 'up' ? '+' : ''}{variation.value}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">
                    {variation ? 'vs mois dernier · ' : ''}{ceMois.nb} livraison{ceMois.nb > 1 ? 's' : ''}
                  </span>
                </span>
                <MiniCourbe valeurs={d.tendance12.slice(-6).map(t => t.caHtCts)} couleur="var(--brand)"
                  className="mt-auto pt-2 h-12 w-full" />
              </button>

              <button type="button" onClick={() => navigate('/livraisons')}
                className="relative text-left rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] p-4 flex flex-col transition-colors hover:border-[var(--gold)]"
                style={{ boxShadow: `inset 3px 0 0 ${COULEUR_TON.gold}, var(--shadow-card)` }}>
                <span className="flex items-center gap-2.5">
                  <PastilleIcone icone={<FileClock size={15} />} ton="gold" />
                  <span className="font-display text-sm font-semibold uppercase tracking-wide">À facturer</span>
                </span>
                <span className="mt-3 font-mono text-3xl font-semibold leading-none tabular-nums"
                  style={{ color: d.aFacturer.nb ? 'var(--gold)' : 'var(--text)' }}>{eurosArrondis(d.aFacturer.totalCts)}</span>
                <span className="mt-2 text-xs text-[var(--text-muted)]">
                  {d.aFacturer.nb} livrée{d.aFacturer.nb > 1 ? 's' : ''} · HT
                </span>
                <span className="mt-auto pt-2 inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] group-hover:text-[var(--text)]">
                  Voir les livraisons <ChevronRight size={13} />
                </span>
              </button>
            </>
          )}
        </div>

        {/* ── Tendance | liste (activité récente ou mois cliqué) ── */}
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:flex-1 lg:min-h-0 [&>*]:min-w-0 lg:[&>*]:min-h-0">
          <SectionCard titre="Chiffre d'affaires HT" icone={<BarChart3 size={15} />} ton="brand"
            sous={`${PERIODES.find(p => p.cle === periode)?.libelle}${moyenneCts > 0 ? ` · moyenne ${eurosCourts(moyenneCts)} / mois` : ''} · clique un mois`}
            droite={<BoutonIcone libelle="Réglages du graphique" actif={reglages} onClick={() => setReglages(o => !o)} />}
            className="flex flex-col" corpsClassName="px-4 pb-4 pt-1 flex flex-col lg:flex-1 lg:min-h-0">
            {reglages && (
              <div className="mb-3">
                <PanneauReglages titre="Période">
                  <div className="flex flex-wrap gap-1">
                    {PERIODES.map(p => (
                      <button key={p.cle} type="button" onClick={() => { setPeriode(p.cle); setReglages(false) }}
                        className={`min-h-[2.5rem] px-3 rounded-[var(--r-md)] text-xs font-medium transition-colors ${
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
              ? <Skeleton className="h-[12rem] lg:flex-1" />
              : <div className="lg:flex-1 lg:min-h-0"><BarresMensuelles
                  hauteur={grandEcran ? undefined : 140}
                  points={tendance.map(t => ({ libelle: t.libelle, valeur: t.caHtCts }))}
                  selection={indexChoisi >= 0 ? indexChoisi : null}
                  onSelection={i => void choisirMois(tendance[i])}
                  formatCourt={eurosCourts}
                  formatLong={formatCents} /></div>}
          </SectionCard>

          <SectionCard
            titre={moisChoisi ? libelleMoisLong(moisChoisi.cle) : 'Activité récente'}
            icone={moisChoisi ? <BarChart3 size={15} /> : <History size={15} />}
            ton={moisChoisi ? 'brand' : 'violet'}
            sous={moisChoisi
              ? (lignesMois ? `${lignesMois.length} livraison${lignesMois.length > 1 ? 's' : ''} · ${formatCents(moisChoisi.caHtCts)} HT` : 'Chargement…')
              : undefined}
            droite={moisChoisi
              ? <BoutonIcone icone={X} libelle="Revenir à l'activité récente" onClick={fermerMois} />
              : (
                <button onClick={() => navigate('/livraisons')}
                  className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                  Tout voir <ChevronRight size={13} />
                </button>
              )}
            className="flex flex-col scroll-mt-4" corpsClassName="flex flex-col lg:flex-1 lg:min-h-0">
            <div id="liste-dashboard" className="flex flex-col lg:flex-1 lg:min-h-0">
              <ListeLivraisons
                lignes={moisChoisi ? lignesMois : (loading || !d ? null : d.recentes)}
                vide={moisChoisi ? 'Aucune livraison ce mois-ci.' : 'Aucune livraison enregistrée.'}
                onOuvrir={ouvrir}
                defilante={!!moisChoisi} />
            </div>
          </SectionCard>
        </div>
      </div>
    </Shell>
  )
}

/** Liste compacte de livraisons, lecture seule : un clic ouvre la livraison dans Livraisons. */
function ListeLivraisons({ lignes, vide, onOuvrir, defilante }: {
  lignes: LigneMois[] | null
  vide: string
  onOuvrir: (id: string) => void
  defilante: boolean
}) {
  if (!lignes) return <div className="p-3 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
  if (lignes.length === 0) {
    return <p className="flex-1 flex items-center justify-center py-10 text-sm text-[var(--text-muted)]">{vide}</p>
  }
  return (
    <div className={`flex flex-col divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)] overflow-y-auto lg:flex-1 lg:min-h-0 stagger ${defilante ? 'max-h-[20rem] lg:max-h-none' : ''}`}>
      {lignes.map(row => (
        <button key={row.id} onClick={() => onOuvrir(row.id)}
          className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
          <DriverAvatar name={row.team_members?.full_name ?? row.clients?.name ?? '?'} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--text)] truncate">{row.clients?.name ?? '—'}</span>
            <span className="block text-xs text-[var(--text-muted)] truncate">
              {dateCourte(row.date)}{row.team_members?.full_name && ` · ${row.team_members.full_name}`}
            </span>
          </span>
          <span className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-3 shrink-0">
            <span className="font-mono text-sm font-medium text-[var(--text)] tabular-nums">{formatCents(effectiveHtCts(row))}</span>
            <span className="sm:w-[6.5rem] flex justify-end whitespace-nowrap [&_*]:whitespace-nowrap">
              <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** 'AAAA-MM-JJ' → '30/09' sans passer par UTC. */
function dateCourte(iso: string): string {
  const [, m, j] = iso.split('-')
  return `${j}/${m}`
}

/** Une case du bloc « Aujourd'hui » : pastille d'icône colorée, gros chiffre, atténuée à zéro. */
function CaseJour({ icone, valeur, libelle, ton, alerte, onClick }: {
  icone: React.ReactNode
  valeur: number
  libelle: string
  ton: TonCarte
  /** Retard / échec : n'est mis en couleur (et en halo) que s'il y en a. */
  alerte?: boolean
  onClick: () => void
}) {
  const actif = !alerte || valeur > 0
  const couleur = actif ? COULEUR_TON[ton] : COULEUR_TON.neutral
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-[var(--r-lg)] border transition-colors hover:border-[var(--brand)] ${valeur === 0 ? 'opacity-60' : ''}`}
      style={{
        borderColor: alerte && valeur > 0 ? `color-mix(in srgb, ${couleur} 55%, transparent)` : 'var(--border)',
        background: `color-mix(in srgb, ${couleur} ${valeur > 0 ? 11 : 5}%, transparent)`,
        boxShadow: alerte && valeur > 0 ? `0 0 1.1rem -0.4rem ${couleur}` : undefined,
      }}>
      <span style={{ color: couleur }}>{icone}</span>
      <span className="font-display text-2xl font-semibold leading-none tabular-nums" style={{ color: valeur > 0 ? couleur : 'var(--text)' }}>{valeur}</span>
      <span className="text-xs text-[var(--text-muted)] leading-tight">{libelle}</span>
    </button>
  )
}

/** Barre fine de répartition (à faire / en cours / livrées) sous les cases de la journée. */
function RepartitionJour({ jour }: { jour: ResumeJour }) {
  const total = jour.aFaire + jour.enCours + jour.livrees
  const seg = [
    { n: jour.aFaire, c: 'var(--text-muted)' },
    { n: jour.enCours, c: 'var(--info)' },
    { n: jour.livrees, c: 'var(--success)' },
  ]
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--border)]" aria-hidden="true">
      {total > 0 && seg.map((s, i) => s.n > 0 && (
        <span key={i} style={{ width: `${(s.n / total) * 100}%`, background: s.c }} />
      ))}
    </div>
  )
}
