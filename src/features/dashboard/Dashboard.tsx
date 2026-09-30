import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import {
  ChevronRight, Euro, FileClock, Wallet, TrendingUp, Plus,
  CalendarClock, Truck, CheckCircle2, AlarmClock, AlertTriangle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { DriverAvatar } from '../../shared/ui/DriverAvatar'
import { LineChart } from '../../shared/ui/LineChart'
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
  resumeJour, aEncaisser, resteAFacturer,
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

  const load = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    const aujourdhui = isoLocal(now)
    const douze = moisDeLaPeriode('12m', now)
    const r = await getDashboard(douze[0].debut, douze[douze.length - 1].fin, aujourdhui)
    setErreur(r.erreur?.message ?? null)
    setD({
      tendance12: agregerParMois(douze, r.livraisons, r.charges),
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
  const marge = ceMois ? ceMois.caHtCts - ceMois.chargesHtCts : 0

  const nouvelle = () => { setSelected(null); setDrawerOpen(true) }
  const ouvrir = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  const prenom = profile?.full_name?.trim().split(/\s+/)[0]
  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Shell pageTitle="Dashboard">
      <div className="space-y-5 min-w-0">

        {/* ── En-tête compact ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[var(--fs-h3)] font-semibold leading-tight truncate">
              {prenom ? `Bonjour ${prenom}` : 'Bonjour'}
            </h2>
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)] first-letter:uppercase">{dateDuJour}</p>
          </div>
          <Button variant="primary" size="compact" onClick={nouvelle}>
            <Plus size={14} /> <span className="hidden sm:inline">Nouvelle livraison</span><span className="sm:hidden">Livraison</span>
          </Button>
        </div>

        {erreur && <p className="text-[var(--fs-sm)] text-[var(--danger)]">{erreur}</p>}

        {/* ── Aujourd'hui ── */}
        <section className="glass rounded-[var(--r-xl)] p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Aujourd'hui</span>
            <button onClick={() => navigate('/calendrier')}
              className="inline-flex items-center gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)]">
              Planning <ChevronRight size={13} />
            </button>
          </div>
          {loading || !d ? <Skeleton className="h-16" /> : (
            <div className="grid grid-cols-5 gap-1.5">
              <CaseJour icone={<CalendarClock size={15} />} valeur={d.jour.aFaire} libelle="À faire" onClick={() => navigate('/livraisons')} />
              <CaseJour icone={<Truck size={15} />} valeur={d.jour.enCours} libelle="En cours" onClick={() => navigate('/livraisons')} />
              <CaseJour icone={<CheckCircle2 size={15} />} valeur={d.jour.livrees} libelle="Livrées" ton="success" onClick={() => navigate('/livraisons')} />
              <CaseJour icone={<AlarmClock size={15} />} valeur={d.jour.enRetard} libelle="En retard" ton={d.jour.enRetard ? 'danger' : undefined} onClick={() => navigate('/livraisons')} />
              <CaseJour icone={<AlertTriangle size={15} />} valeur={d.jour.echecs} libelle="Échecs" ton={d.jour.echecs ? 'danger' : undefined} onClick={() => navigate('/livraisons')} />
            </div>
          )}
        </section>

        {/* ── Argent ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 [&>*]:min-w-0">
          {loading || !d || !ceMois ? (
            [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[88px]" />)
          ) : (
            <>
              <Lien onClick={() => navigate('/livraisons')}>
                <KpiCard label="CA HT du mois" value={formatCents(ceMois.caHtCts)} tone="success"
                  icon={<Euro size={18} />}
                  delta={moisPrecedent ? evolution(moisPrecedent.caHtCts, ceMois.caHtCts) ?? undefined : undefined}
                  sub={`${ceMois.nb} livraison${ceMois.nb > 1 ? 's' : ''}`}
                  spark={tendance.map(t => t.caHtCts)} />
              </Lien>
              <Lien onClick={() => navigate('/livraisons')}>
                <KpiCard label="Reste à facturer" value={formatCents(d.aFacturer.totalCts)} tone={d.aFacturer.nb ? 'warning' : 'neutral'}
                  icon={<FileClock size={18} />}
                  sub={`${d.aFacturer.nb} livrée${d.aFacturer.nb > 1 ? 's' : ''} non facturée${d.aFacturer.nb > 1 ? 's' : ''} · HT`} />
              </Lien>
              <Lien onClick={() => navigate('/encaissement')}>
                <KpiCard label="À encaisser" value={formatCents(d.encaisser.totalCts)} tone={d.encaisser.nbRetard ? 'danger' : 'info'}
                  icon={<Wallet size={18} />}
                  sub={d.encaisser.nbRetard
                    ? `dont ${formatCents(d.encaisser.retardCts)} en retard (${d.encaisser.nbRetard})`
                    : `${d.encaisser.nb} facture${d.encaisser.nb > 1 ? 's' : ''} · TTC`} />
              </Lien>
              <Lien onClick={() => navigate('/charges')}>
                <KpiCard label="Marge du mois" value={formatCents(marge)} tone={marge >= 0 ? 'violet' : 'danger'}
                  icon={<TrendingUp size={18} />}
                  sub={`CA − ${formatCents(ceMois.chargesHtCts)} de charges HT`}
                  spark={tendance.map(t => t.caHtCts - t.chargesHtCts)} />
              </Lien>
            </>
          )}
        </div>

        {/* ── Tendance ── */}
        <section className="glass rounded-[var(--r-xl)] p-4 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <span className="block font-display font-semibold text-[var(--fs-h3)] text-[var(--text)]">Chiffre d'affaires HT</span>
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                {PERIODES.find(p => p.cle === periode)?.libelle}
              </span>
            </div>
            <BoutonIcone libelle="Réglages de la courbe" actif={reglages} onClick={() => setReglages(o => !o)} />
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
            ? <Skeleton className="h-[220px]" />
            : <LineChart
                key={periode}
                points={tendance.map(t => ({ label: t.libelle, value: t.caHtCts }))}
                formatValue={formatCents}
                formatAxisY={(v: number) => {
                  if (v === 0) return '0'
                  const eur = Math.round(v / 100)
                  return eur >= 1000 ? `${Math.round(eur / 1000)} k€` : `${eur} €`
                }}
              />}
        </section>

        {/* ── Activité récente ── */}
        <section className="glass rounded-[var(--r-xl)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              Activité récente
            </span>
            <Button variant="ghost" size="compact" onClick={() => navigate('/livraisons')}>
              Voir tout <ChevronRight size={13} />
            </Button>
          </div>

          {loading || !d ? (
            <div className="p-4 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : d.recentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-muted)]">
              <p className="text-[var(--fs-sm)]">Aucune livraison enregistrée.</p>
              <Button variant="primary" onClick={nouvelle}>Créer une livraison</Button>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[var(--fs-sm)]">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] text-left">
                      {['Date', 'Client', 'Chauffeur', 'Montant HT', 'Statut'].map(h => (
                        <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.recentes.map(row => (
                      <tr key={row.id} onClick={() => ouvrir(row)}
                        className="border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]">
                        <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{dateCourte(row.date)}</td>
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {row.team_members?.full_name
                            ? <span className="inline-flex items-center gap-2"><DriverAvatar name={row.team_members.full_name} />{row.team_members.full_name}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--text)]">{formatCents(effectiveHtCts(row))}</td>
                        <td className="px-4 py-3"><Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden flex flex-col divide-y divide-[var(--border)]">
                {d.recentes.map(row => (
                  <button key={row.id} onClick={() => ouvrir(row)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-[var(--text)] truncate">{row.clients?.name ?? '—'}</span>
                      <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>{STATUS_LABELS[row.statut]}</Badge>
                    </div>
                    <div className="flex items-end justify-between gap-2 mt-0.5">
                      <span className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">
                        {dateCourte(row.date)}{row.team_members?.full_name && ` · ${row.team_members.full_name}`}
                      </span>
                      <span className="font-mono text-[var(--fs-sm)] text-[var(--text)]">{formatCents(effectiveHtCts(row))}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <Suspense fallback={null}>
        <DrawerLivraison open={drawerOpen} onClose={() => setDrawerOpen(false)} delivery={selected} onSaved={load} />
      </Suspense>
    </Shell>
  )
}

/** 'AAAA-MM-JJ' → '30/09' sans passer par UTC. */
function dateCourte(iso: string): string {
  const [, m, j] = iso.split('-')
  return `${j}/${m}`
}

/** Rend une carte KPI cliquable sans toucher au composant partagé. */
function Lien({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-left min-w-0 rounded-[var(--r-xl)]">
      {children}
    </button>
  )
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
      className={`flex flex-col items-center gap-0.5 py-2 rounded-[var(--r-md)] transition-colors hover:bg-[var(--bg-card-hover)] ${
        ton === 'danger' ? 'bg-[var(--danger)]/10' : 'bg-[var(--bg-elevated)]'
      }`}>
      <span className={`${ton ? couleur : 'text-[var(--text-muted)]'}`}>{icone}</span>
      <span className={`font-mono text-xl font-semibold leading-none ${couleur}`}>{valeur}</span>
      <span className="text-[10px] sm:text-[var(--fs-xs)] text-[var(--text-muted)] text-center leading-tight">{libelle}</span>
    </button>
  )
}
