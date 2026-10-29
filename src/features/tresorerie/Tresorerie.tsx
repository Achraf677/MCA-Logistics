import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, Download, RefreshCw, SlidersHorizontal, Wallet, X } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { EmptyState } from '../../shared/ui/EmptyState'
import { GroupeMois } from '../../shared/ui/GroupeMois'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { downloadCSV } from '../../shared/lib/download'
import { formatMoney } from '../../shared/lib/money'
import { grouperParMois, moisOuvertParDefaut } from '../../shared/lib/mois'
import { useSync } from '../../app/SyncProvider'
import { getDonneesBrutes, getLatestSnapshot, getSnapshotsPennylane, getTransactions } from './tresorerie.queries'
import {
  amountColorClass, aUnJustificatif, detailBrut, FILTRES_VIDES, filtrerReleve, formatEntrees, formatSignedAmount, formatSorties,
  formatTxDate, jourLocal, LIBELLE_COMPTE, manqueUnJustificatif, nbFiltresActifs, operationTypeLabel, releveEnCsv, soldePennylane,
  totauxSelection, trierReleve, typesPresents, virementsInternes,
  type FiltresReleve, type TriReleve, type VueCompte,
} from './tresorerie.logic'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'

const VUES: Array<{ cle: VueCompte; libelle: string }> = [
  { cle: 'qonto', libelle: 'Qonto' },
  { cle: 'swan', libelle: 'Swan' },
  { cle: 'fusion', libelle: 'Fusion des deux relevés' },
]
const SENS: Array<{ cle: FiltresReleve['sens']; libelle: string }> = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'entrees', libelle: 'Entrées' },
  { cle: 'sorties', libelle: 'Sorties' },
]
const TRIS: Array<{ valeur: TriReleve; libelle: string }> = [
  { valeur: 'date_desc', libelle: 'Plus récentes' },
  { valeur: 'date_asc', libelle: 'Plus anciennes' },
  { valeur: 'montant_desc', libelle: 'Montant décroissant' },
  { valeur: 'montant_asc', libelle: 'Montant croissant' },
]
const JUSTIFS: Array<{ valeur: FiltresReleve['justif']; libelle: string }> = [
  { valeur: 'tous', libelle: 'Justificatif : tous' },
  { valeur: 'sans', libelle: 'Sans justificatif' },
  { valeur: 'avec', libelle: 'Avec justificatif' },
]

// Classes littérales (le scanner Tailwind ne voit pas les classes construites).
const COLONNES_TUILES: Record<VueCompte, string> = { qonto: 'lg:grid-cols-4', swan: 'lg:grid-cols-3', fusion: 'lg:grid-cols-5' }

const IconeSynchroEnCours = ({ size }: { size?: number }) => <RefreshCw size={size} className="animate-spin" />

/** Contrôle à segments : le choix actif a le contour rouge de la marque (convention du site). */
function Segments<T extends string>({ valeur, options, onChange, ariaLabel }: {
  valeur: T; options: Array<{ cle: T; libelle: string }>; onChange: (v: T) => void; ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex flex-wrap rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] p-0.5 gap-0.5">
      {options.map(o => (
        <button key={o.cle} type="button" aria-pressed={valeur === o.cle} onClick={() => onChange(o.cle)}
          className={`h-11 sm:h-9 px-3.5 rounded-[var(--r-sm)] border text-sm font-semibold whitespace-nowrap ${valeur === o.cle
            ? 'border-[var(--brand)] text-[var(--text)] bg-[var(--brand)]/10'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
          {o.libelle}
        </button>
      ))}
    </div>
  )
}

/** Pastille du compte : nom complet dès sm, initiale seule sur mobile (laisse la place au libellé). */
function PastilleCompte({ source }: { source: QontoTx['source'] }) {
  const couleur = source === 'swan' ? 'purple' : 'info'
  return (
    <>
      <span className="sm:hidden" title={LIBELLE_COMPTE[source]}><Badge color={couleur}>{LIBELLE_COMPTE[source][0]}</Badge></span>
      <span className="hidden sm:inline"><Badge color={couleur}>{LIBELLE_COMPTE[source]}</Badge></span>
    </>
  )
}

/**
 * Trésorerie : un relevé par compte (Qonto, Swan) ou les deux fusionnés avec une pastille par ligne. Lecture seule.
 * Les justificatifs se gèrent dans Charges (décision du 22/10/2026) : ici on voit seulement s'il y en a un.
 */
export function Tresorerie() {
  const [snapshot, setSnapshot] = useState<TreasurySnapshot | null>(null)
  const [soldeSwan, setSoldeSwan] = useState<number | null>(null)
  const [txs, setTxs] = useState<QontoTx[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState<FiltresReleve>(FILTRES_VIDES)
  const [tri, setTri] = useState<TriReleve>('date_desc')
  const [detail, setDetail] = useState<QontoTx | null>(null)
  const [filtresOuverts, setFiltresOuverts] = useState(false)
  const [brutDe, setBrutDe] = useState<{ id: string; raw: unknown } | null>(null)
  const maj = (p: Partial<FiltresReleve>) => setF(prev => ({ ...prev, ...p }))

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [snapRes, plRes, txRes] = await Promise.all([getLatestSnapshot(), getSnapshotsPennylane(), getTransactions()])
    if (snapRes.error) setError(snapRes.error.message)
    else setSnapshot(snapRes.data ?? null)
    setSoldeSwan(plRes.error ? null : soldePennylane(plRes.data ?? []))
    if (txRes.error) setError(txRes.error.message)
    else setTxs(txRes.data ?? [])
    setLoading(false)
  }, [])

  const { syncState, syncIfStale, forceSync } = useSync()
  useEffect(() => { syncIfStale('qonto'); syncIfStale('paiements') }, [syncIfStale])
  useEffect(() => { void load() }, [load, syncState.qonto.lastSyncAt, syncState.paiements.lastSyncAt])

  useEffect(() => {
    if (!detail) return
    let annule = false
    void getDonneesBrutes(detail.id).then(r => { if (!annule) setBrutDe({ id: detail.id, raw: r.data?.raw_data ?? null }) })
    return () => { annule = true }
  }, [detail])
  const brut = detail && brutDe?.id === detail.id ? brutDe.raw : null

  const internes = useMemo(() => virementsInternes(txs), [txs])
  const dansLaVue = useMemo(() => txs.filter(t => f.vue === 'fusion' || t.source === f.vue), [txs, f.vue])
  const types = useMemo(() => typesPresents(dansLaVue), [dansLaVue])
  const visibles = useMemo(() => trierReleve(filtrerReleve(txs, f), tri), [txs, f, tri])
  // Les virements entre les deux comptes ne comptent dans les totaux que si on regarde UN seul compte.
  const exclus = useMemo(() => (f.vue === 'fusion' ? internes : new Set<string>()), [f.vue, internes])
  const totaux = useMemo(() => totauxSelection(visibles, exclus), [visibles, exclus])
  const groupes = useMemo(() => grouperParMois(visibles, t => t.settled_at), [visibles])
  const ouvert = useMemo(() => moisOuvertParDefaut(groupes.map(g => g.cle), new Date()), [groupes])
  const nbFiltres = nbFiltresActifs(f)
  const nbAvances = nbFiltres - (f.sens !== 'tous' ? 1 : 0) - (f.q.trim() !== '' ? 1 : 0)
  const filtre = nbFiltres > 0
  const effacerTout = () => { setF({ ...FILTRES_VIDES, vue: f.vue }); setTri('date_desc') }
  const syncing = syncState.qonto.syncing

  const soldeQonto = snapshot?.balance_cts ?? null
  const soldeTotal = soldeQonto !== null || soldeSwan !== null ? (soldeQonto ?? 0) + (soldeSwan ?? 0) : null
  const euro = (v: number | null) => (v === null ? '—' : formatMoney(v))

  const exporter = () => {
    const nom = f.vue === 'fusion' ? 'releve-qonto-swan' : `releve-${f.vue}`
    downloadCSV(releveEnCsv(visibles, internes), `${nom}.csv`)
  }

  return (
    <Shell pageTitle="Trésorerie">
     <div className="flex flex-col min-w-0 lg:h-[min(calc(100dvh-var(--topbar-h)-2.75rem),64rem)]">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Segments valeur={f.vue} options={VUES} onChange={vue => setF({ ...FILTRES_VIDES, vue })} ariaLabel="Compte affiché" />
        <div className="ml-auto flex items-center gap-2">
          <BoutonIcone icone={syncing ? IconeSynchroEnCours : RefreshCw} libelle="Synchroniser Qonto et Swan" onClick={() => forceSync('qonto')} disabled={syncing} />
          <BoutonIcone icone={Download} libelle="Exporter le relevé affiché (CSV)" onClick={exporter} disabled={visibles.length === 0} />
        </div>
      </div>

      {loading ? (
        <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-5 mb-4 [&>*]:min-w-0">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[5.5rem]" />)}
        </div>
      ) : (
        <div className={`shrink-0 grid grid-cols-2 ${COLONNES_TUILES[f.vue]} gap-5 mb-4 stagger [&>*]:min-w-0`}>
          {f.vue === 'qonto' && <>
            <KpiCard label="Solde Qonto" value={euro(soldeQonto)} />
            <KpiCard label="Solde autorisé" value={snapshot ? formatMoney(snapshot.authorized_balance_cts) : '—'} />
          </>}
          {f.vue === 'swan' && <div className="col-span-2 lg:col-span-1"><KpiCard label="Solde Swan" value={euro(soldeSwan)} /></div>}
          {f.vue === 'fusion' && <>
            <div className="col-span-2 lg:col-span-1"><KpiCard label="Solde total" value={euro(soldeTotal)} /></div>
            <KpiCard label="Solde Qonto" value={euro(soldeQonto)} />
            <KpiCard label="Solde Swan" value={euro(soldeSwan)} />
          </>}
          <KpiCard label={`Entrées${filtre ? ' · sélection' : ''}`} value={formatMoney(totaux.entreesCts)} tone="success" icon={<ArrowDownLeft size={18} />} />
          <KpiCard label={`Sorties${filtre ? ' · sélection' : ''}`} value={formatMoney(totaux.sortiesCts)} tone="danger" icon={<ArrowUpRight size={18} />} />
        </div>
      )}

      {loading && <Skeleton className="shrink-0 h-10 w-full max-w-xl mb-4" />}
      {!loading && dansLaVue.length > 0 && (
        <div className="shrink-0 flex flex-col gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <BarreRecherche value={f.q} onChange={q => maj({ q })} placeholder="Chercher : libellé, montant, type, compte…" ariaLabel="Rechercher un mouvement"
              raccourci className="flex-1 min-w-[12rem] max-w-xl" compteur={`${visibles.length} sur ${dansLaVue.length}`} />
            <Segments valeur={f.sens} options={SENS} onChange={sens => maj({ sens })} ariaLabel="Sens" />
            <div className="w-52"><ListeDeroulante ariaLabel="Tri" valeur={tri} onChange={v => setTri(v as TriReleve)} options={TRIS} recherche={false} /></div>
            <Button variant="secondary" onClick={() => setFiltresOuverts(o => !o)}>
              <SlidersHorizontal size={14} /> Filtres{nbAvances > 0 ? ` (${nbAvances})` : ''}
            </Button>
            {(nbFiltres > 0 || tri !== 'date_desc') && (
              <Button variant="secondary" onClick={effacerTout}><X size={14} /> Tout effacer</Button>
            )}
          </div>
          {filtresOuverts && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">Du
                <input type="date" className="field h-11 sm:h-9" value={f.du} max={f.au || undefined} onChange={e => maj({ du: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">Au
                <input type="date" className="field h-11 sm:h-9" value={f.au} min={f.du || undefined} onChange={e => maj({ au: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">Montant min (€)
                <input inputMode="decimal" className="field h-11 sm:h-9 w-28" value={f.min} onChange={e => maj({ min: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">Montant max (€)
                <input inputMode="decimal" className="field h-11 sm:h-9 w-28" value={f.max} onChange={e => maj({ max: e.target.value })} />
              </label>
              {types.length > 0 && (
                <div className="w-48"><ListeDeroulante ariaLabel="Type d'opération" valeur={f.type} onChange={type => maj({ type })}
                  options={[{ valeur: '', libelle: 'Tous les types' }, ...types.map(t => ({ valeur: t, libelle: operationTypeLabel(t) }))]} /></div>
              )}
              <div className="w-52"><ListeDeroulante ariaLabel="Justificatif" valeur={f.justif} onChange={v => maj({ justif: v as FiltresReleve['justif'] })}
                options={JUSTIFS} recherche={false} /></div>
            </div>
          )}
          <p className="text-sm text-[var(--text-muted)]">
            {visibles.length} mouvement{visibles.length > 1 ? 's' : ''} ·{' '}
            <span className="text-[var(--success)]">{formatEntrees(totaux.entreesCts)}</span> ·{' '}
            <span className="text-[var(--danger)]">{formatSorties(totaux.sortiesCts)}</span> · net{' '}
            <strong className={totaux.netCts >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{totaux.netCts >= 0 ? '+' : '−'}{formatMoney(Math.abs(totaux.netCts))}</strong>
            {exclus.size > 0 && visibles.some(t => exclus.has(t.id)) && <> · virements entre Qonto et Swan non comptés</>}
          </p>
        </div>
      )}

      {/* Seule la liste défile (PC) ; marge basse pour que la bulle de l'assistant ne cache pas la dernière ligne. */}
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pb-24 lg:pr-1">
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-sm">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>Réessayer</Button>
        </div>
      ) : dansLaVue.length === 0 ? (
        <EmptyState icon={<Wallet size={48} />} title="Aucun mouvement"
          description={f.vue === 'swan' ? 'Aucune opération Swan pour l’instant — clique sur le bouton de synchronisation en haut à droite.' : 'Aucune donnée — clique sur le bouton de synchronisation en haut à droite.'} />
      ) : visibles.length === 0 ? (
        <EmptyState icon={<Wallet size={48} />} title="Aucun mouvement" description="Aucun mouvement ne correspond à ces filtres." />
      ) : (
        <div className="flex flex-col gap-3">
          {groupes.map(g => {
            const t = totauxSelection(g.rows, exclus)
            return (
              <GroupeMois key={`${g.cle}-${filtre}-${f.vue}`} titre={g.libelle} ouvertDefaut={filtre || g.cle === ouvert}
                resume={<>
                  <span>{g.rows.length} mouvement{g.rows.length > 1 ? 's' : ''}</span>
                  <span className="text-[var(--success)]">{formatEntrees(t.entreesCts)}</span>
                  <span className="text-[var(--danger)]">{formatSorties(t.sortiesCts)}</span>
                </>}>
                <ul className="divide-y divide-[var(--border)]">
                  {g.rows.map(tx => {
                    const manque = manqueUnJustificatif(tx, internes)
                    return (
                      <li key={tx.id}>
                        <button type="button" onClick={() => setDetail(tx)}
                          className="w-full text-left flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-2.5 hover:bg-[var(--bg-hover,transparent)]">
                          <span className="w-12 sm:w-16 shrink-0 font-mono text-xs text-[var(--text-muted)]">{formatTxDate(tx.settled_at).slice(0, 5)}</span>
                          {f.vue === 'fusion' && <span className="shrink-0"><PastilleCompte source={tx.source} /></span>}
                          <span className="flex-1 min-w-0 truncate font-medium text-[var(--text)]" title={tx.label ?? ''}>{tx.label ?? '—'}</span>
                          {internes.has(tx.id) && <Badge color="warning">Interne</Badge>}
                          {manque && <>
                            <span className="sm:hidden h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--danger)]" role="img" aria-label="Sans justificatif" title="Sans justificatif" />
                            <span className="hidden sm:block shrink-0"><Badge color="danger">Sans justificatif</Badge></span>
                          </>}
                          {tx.operation_type && <span className="hidden md:block shrink-0"><Badge color="muted">{operationTypeLabel(tx.operation_type)}</Badge></span>}
                          <span className={`shrink-0 font-mono font-semibold tabular-nums ${amountColorClass(tx.side)}`}>{formatSignedAmount(tx)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </GroupeMois>
            )
          })}
        </div>
      )}
      </div>
     </div>

      <Drawer open={detail !== null} onClose={() => setDetail(null)} title="Détail du mouvement">
        {detail && (
          <dl className="flex flex-col gap-3 p-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <PastilleCompte source={detail.source} />
              <span className={`font-mono text-lg font-semibold tabular-nums ${amountColorClass(detail.side)}`}>{formatSignedAmount(detail)}</span>
            </div>
            <Ligne titre="Libellé" valeur={detail.label ?? '—'} />
            <Ligne titre="Date" valeur={jourLocal(detail.settled_at) ? formatTxDate(detail.settled_at) : '—'} />
            <Ligne titre="Type" valeur={operationTypeLabel(detail.operation_type)} />
            <Ligne titre="Justificatif" valeur={aUnJustificatif(detail) ? 'Oui (rattaché ou classé)' : 'Aucun — à rattacher dans Charges'} />
            {internes.has(detail.id) && <Ligne titre="Virement" valeur="Entre Qonto et Swan (non compté dans les totaux de la fusion)" />}
            {detailBrut(brut).map(l => <Ligne key={l.libelle} titre={l.libelle} valeur={l.valeur} />)}
          </dl>
        )}
      </Drawer>
    </Shell>
  )
}

function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-3">
      <dt className="text-xs text-[var(--text-muted)]">{titre}</dt>
      <dd className="text-[var(--text)] break-words">{valeur}</dd>
    </div>
  )
}
