import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronRight, Euro, FileClock, Wallet, X, CalendarDays, BarChart3, History,
  CalendarClock, Truck, CheckCircle2, AlarmClock, AlertTriangle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { Skeleton } from '../../shared/ui/Skeleton'
import { BarresMensuelles } from '../../shared/ui/BarresMensuelles'
import { BoutonIcone, PanneauReglages } from '../../shared/ui/BoutonIcone'
import { formatCents, effectiveHtCts } from '../../shared/lib/money'
import { STATUS_LABELS, STATUS_COLORS } from '../livraisons/livraisons.logic'
import { getDashboard, getLivraisonsDuMois, type LigneMois } from './dashboard.queries'
import {
  isoLocal, moisDeLaPeriode, agregerParMois, evolution, libelleMoisLong,
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

  return (
    <Shell pageTitle="Dashboard">
      {/* PC : occupe EXACTEMENT la hauteur visible (écran − barre du haut − marges
          de <main>) ; la dernière ligne prend le reste, le graphique et la liste
          s'y ajustent. Plus rien à faire défiler, quelle que soit la résolution. */}
      <div className="flex flex-col gap-3 min-w-0 lg:h-[min(calc(100dvh-var(--topbar-h)-2.75rem),56rem)]">

        <p className="min-w-0 truncate leading-tight">
          <span className="font-display text-lg font-semibold">{prenom ? `Bonjour ${prenom}` : 'Bonjour'}</span>
          <span className="ml-2 text-sm text-[var(--text-muted)]">· {dateDuJour}</span>
        </p>

        {erreur && <p className="text-sm text-[var(--danger)]">{erreur}</p>}

        {/* ── Journée + argent : 4 cartes au même gabarit ── */}
        <div className="grid gap-3 lg:grid-cols-[1.4fr_2fr] [&>*]:min-w-0">
          <section className={carteCls}>
            <EnteteCarte icone={<CalendarDays size={14} />} titre="Aujourd'hui"
              droite={(
                <button onClick={() => navigate('/calendrier')}
                  className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                  Planning <ChevronRight size={13} />
                </button>
              )} />
            {loading || !d ? <Skeleton className="h-[52px]" /> : (
              <div className="grid grid-cols-5 gap-1.5">
                <CaseJour icone={<CalendarClock size={13} />} valeur={d.jour.aFaire} libelle="À faire" onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<Truck size={13} />} valeur={d.jour.enCours} libelle="En cours" onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<CheckCircle2 size={13} />} valeur={d.jour.livrees} libelle="Livrées" ton="success" onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<AlarmClock size={13} />} valeur={d.jour.enRetard} libelle="Retard" ton={d.jour.enRetard ? 'danger' : undefined} onClick={() => navigate('/livraisons')} />
                <CaseJour icone={<AlertTriangle size={13} />} valeur={d.jour.echecs} libelle="Échecs" ton={d.jour.echecs ? 'danger' : undefined} onClick={() => navigate('/livraisons')} />
              </div>
            )}
          </section>

          <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
            {loading || !d || !ceMois ? [0, 1, 2].map(i => <Skeleton key={i} className="h-[92px]" />) : (
              <>
                <Chiffre libelle="CA HT du mois" court="CA du mois" icone={<Euro size={14} />} valeur={eurosArrondis(ceMois.caHtCts)}
                  detail={variation
                    ? <span style={{ color: variation.dir === 'up' ? 'var(--success)' : 'var(--danger)' }}>{variation.dir === 'up' ? '+' : ''}{variation.value} vs mois dernier</span>
                    : `${ceMois.nb} livraison${ceMois.nb > 1 ? 's' : ''}`}
                  onClick={() => choisirMois(ceMois)} />
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

        {/* ── Tendance | liste (activité récente ou mois cliqué) ── */}
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr] lg:flex-1 lg:min-h-0 [&>*]:min-w-0 lg:[&>*]:min-h-0">
          <section className={`${carteCls} flex flex-col`}>
            <EnteteCarte icone={<BarChart3 size={14} />} titre="Chiffre d'affaires HT"
              sous={`${PERIODES.find(p => p.cle === periode)?.libelle} · clique un mois pour ses livraisons`}
              droite={<BoutonIcone libelle="Réglages du graphique" actif={reglages} onClick={() => setReglages(o => !o)} />} />
            {reglages && (
              <div className="mb-3">
                <PanneauReglages titre="Période">
                  <div className="flex flex-wrap gap-1">
                    {PERIODES.map(p => (
                      <button key={p.cle} type="button" onClick={() => { setPeriode(p.cle); setReglages(false) }}
                        className={`min-h-[36px] px-3 rounded-[var(--r-md)] text-xs font-medium transition-colors ${
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
          </section>

          <section id="liste-dashboard" className={`${carteCls} !p-0 overflow-hidden flex flex-col scroll-mt-4`}>
            <div className="px-3 pt-3">
              {moisChoisi ? (
                <EnteteCarte icone={<BarChart3 size={14} />} titre={libelleMoisLong(moisChoisi.cle)}
                  sous={lignesMois ? `${lignesMois.length} livraison${lignesMois.length > 1 ? 's' : ''} · ${formatCents(moisChoisi.caHtCts)} HT` : 'Chargement…'}
                  droite={<BoutonIcone icone={X} libelle="Revenir à l'activité récente" onClick={fermerMois} />} />
              ) : (
                <EnteteCarte icone={<History size={14} />} titre="Activité récente"
                  droite={(
                    <button onClick={() => navigate('/livraisons')}
                      className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                      Tout voir <ChevronRight size={13} />
                    </button>
                  )} />
              )}
            </div>
            <ListeLivraisons
              lignes={moisChoisi ? lignesMois : (loading || !d ? null : d.recentes)}
              vide={moisChoisi ? 'Aucune livraison ce mois-ci.' : 'Aucune livraison enregistrée.'}
              onOuvrir={ouvrir}
              defilante={!!moisChoisi} />
          </section>
        </div>
      </div>
    </Shell>
  )
}

const carteCls = 'rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-3'
/** Libellé de carte, IDENTIQUE partout (taille en clair : `text-xs`
 *  est lu par Tailwind comme une couleur, pas comme une taille). */
const libelleCls = 'text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]'

/** En-tête commun à TOUTES les cartes : pictogramme + libellé, même style partout. */
function EnteteCarte({ icone, titre, sous, droite }: {
  icone: React.ReactNode
  titre: string
  sous?: string
  droite?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2 mb-2 min-h-[20px]">
      <div className="min-w-0">
        <span className={`inline-flex items-center gap-1.5 ${libelleCls}`}>
          {icone} {titre}
        </span>
        {sous && <span className="block text-[11px] sm:text-xs text-[var(--text-disabled)] truncate">{sous}</span>}
      </div>
      {droite}
    </div>
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
    <div className={`flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)] overflow-y-auto lg:flex-1 lg:min-h-0 ${defilante ? 'max-h-[20rem] lg:max-h-none' : ''}`}>
      {lignes.map(row => (
        <button key={row.id} onClick={() => onOuvrir(row.id)}
          className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--text)] truncate">{row.clients?.name ?? '—'}</span>
            <span className="block text-xs text-[var(--text-muted)] truncate">
              {dateCourte(row.date)}{row.team_members?.full_name && ` · ${row.team_members.full_name}`}
            </span>
          </span>
          <span className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-3 shrink-0">
            <span className="font-mono text-sm text-[var(--text)]">{formatCents(effectiveHtCts(row))}</span>
            <span className="sm:w-[92px] flex justify-end whitespace-nowrap [&_*]:whitespace-nowrap">
              <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** Un chiffre d'argent : même gabarit que la carte « Aujourd'hui », arrondi à l'euro. */
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
      className={`${carteCls} text-left flex flex-col min-w-0 hover:border-[var(--brand)] transition-colors`}>
      <span className={`inline-flex items-center gap-1.5 mb-2 min-h-[20px] truncate ${libelleCls}`}>
        <span className="hidden sm:inline-flex">{icone}</span>
        <span className="sm:hidden">{court}</span><span className="hidden sm:inline">{libelle}</span>
      </span>
      <span className="font-mono font-semibold text-base sm:text-2xl leading-tight truncate" style={{ color: couleur }}>{valeur}</span>
      <span className="mt-auto pt-1 text-[11px] sm:text-xs text-[var(--text-muted)] truncate">{detail}</span>
    </button>
  )
}

/** 'AAAA-MM-JJ' → '30/09' sans passer par UTC. */
function dateCourte(iso: string): string {
  const [, m, j] = iso.split('-')
  return `${j}/${m}`
}

/** Une case du bloc « Aujourd'hui » : même langage visuel que les chiffres voisins. */
function CaseJour({ icone, valeur, libelle, ton, onClick }: {
  icone: React.ReactNode
  valeur: number
  libelle: string
  ton?: 'success' | 'danger'
  onClick: () => void
}) {
  const couleur = ton === 'danger' ? 'var(--danger)' : ton === 'success' ? 'var(--success)' : 'var(--text)'
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-[var(--r-md)] border transition-colors hover:border-[var(--brand)] ${
        ton === 'danger' ? 'border-[var(--danger)]/40 bg-[var(--danger)]/10' : 'border-[var(--border)]'
      }`}>
      <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-[var(--text-muted)] leading-tight">
        <span className="hidden sm:inline-flex" style={{ color: ton ? couleur : undefined }}>{icone}</span>{libelle}
      </span>
      <span className="font-mono font-semibold text-base sm:text-2xl leading-tight" style={{ color: couleur }}>{valeur}</span>
    </button>
  )
}
