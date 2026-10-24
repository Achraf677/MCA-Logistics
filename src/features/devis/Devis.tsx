import { useState, useEffect, useCallback, useMemo } from 'react'
import { FileText, Send, CheckCircle2, AlarmClock } from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { Badge }       from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { useToast }    from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
import { listQuotes }  from './devis.queries'
import { STATUS_LABELS, STATUS_COLORS, isExpiredDisplay, resumeDevis } from './devis.logic'
import { DrawerDevis } from './DrawerDevis'
import type { Quote, QuoteStatus }  from './devis.types'
import { PRESTATION_LABELS } from '../../shared/lib/prestations'
import type { ActionKey } from '../../shared/actions/ActionBar'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { toLocalISO, dateCourte } from '../../shared/lib/dates'

// ── Composant principal ────────────────────────────────────────────────────────

export function Devis() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutCreer = can('livraisons.devis', 'create')

  const [quotes, setQuotes]     = useState<Quote[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]   = useState<Quote | null>(null)
  // Filtres : mêmes gestes que la liste des livraisons (recherche, statut, client).
  const [saisie, setSaisie]       = useState('')
  const [statut, setStatut]       = useState<QuoteStatus | 'all'>('all')
  const [clientId, setClientId]   = useState('')
  /** Posé par la tuile « Validité dépassée » : envoyés dont la validité est passée. */
  const [depassesSeuls, setDepassesSeuls] = useState(false)

  const aujourdhui = toLocalISO(new Date())
  const annee = Number(aujourdhui.slice(0, 4))

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await listQuotes()
    if (error) {
      setLoadError((error as { message?: string }).message ?? 'Erreur de chargement')
      toast('Erreur de chargement des devis', 'error')
    } else {
      setQuotes(data ?? [])
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNew = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  const openEdit = (q: Quote) => {
    setSelected(q)
    setDrawerOpen(true)
  }

  const handleSaved = () => load()

  const clientsListe = useMemo(() => {
    const m = new Map<string, string>()
    for (const q of quotes) if (q.clients?.name) m.set(q.client_id, q.clients.name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [quotes])

  const visibles = useMemo(() => {
    const t = saisie.trim().toLowerCase()
    return quotes.filter(q =>
      (statut === 'all' || q.statut === statut)
      && (!depassesSeuls || isExpiredDisplay(q.valid_until, q.statut, aujourdhui))
      && (!clientId || q.client_id === clientId)
      && (!t || [q.clients?.name, q.description, q.pennylane_quote_number, q.reference_client]
        .some(v => v?.toLowerCase().includes(t))))
  }, [quotes, saisie, statut, clientId, depassesSeuls, aujourdhui])

  const resume = useMemo(() => resumeDevis(quotes, aujourdhui), [quotes, aujourdhui])

  const aDesFiltres = statut !== 'all' || !!clientId || !!saisie.trim() || depassesSeuls
  const reinitialiser = () => { setStatut('all'); setClientId(''); setSaisie(''); setDepassesSeuls(false) }
  const choisir = (s: QuoteStatus, depasses = false) => {
    const dejaActif = statut === s && depassesSeuls === depasses
    setStatut(dejaActif ? 'all' : s)
    setDepassesSeuls(dejaActif ? false : depasses)
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau' && peutCreer) openNew()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Shell pageTitle="Devis" actions={peutCreer ? ['nouveau'] : []} onAction={handleAction}>
      {/* PC : même hauteur utile que Livraisons — le tableau défile à l'intérieur. */}
      <div className="flex flex-col gap-3 min-w-0 lg:h-[calc(100dvh-var(--topbar-h)-6.75rem)]">

        {/* ── Chiffres : les devis à suivre (un clic filtre la liste) ── */}
        {!loadError && (quotes.length > 0 || loading) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 [&>*]:min-w-0">
            {loading ? [0, 1, 2].map(i => <Skeleton key={i} className="h-[5.5rem]" />) : (
              <>
                <ChiffreCarte libelle="En attente de réponse" icone={<Send size={14} />}
                  valeur={formatMoney(resume.attente.totalTtcCts)}
                  detail={`${resume.attente.nb} devis envoyé${resume.attente.nb > 1 ? 's' : ''} · TTC`}
                  actif={statut === 'envoye' && !depassesSeuls}
                  onClick={() => choisir('envoye')} titre="Afficher les devis envoyés" />
                <ChiffreCarte libelle="Acceptés à traiter" icone={<CheckCircle2 size={14} />}
                  valeur={formatMoney(resume.acceptes.totalTtcCts)}
                  detail={`${resume.acceptes.nb} devis accepté${resume.acceptes.nb > 1 ? 's' : ''} · TTC`}
                  actif={statut === 'accepte'}
                  onClick={() => choisir('accepte')} titre="Afficher les devis acceptés" />
                <ChiffreCarte libelle="Validité dépassée" icone={<AlarmClock size={14} />}
                  valeur={String(resume.depasses.nb)}
                  ton={resume.depasses.nb ? 'warning' : undefined}
                  detail={resume.depasses.nb ? `${formatMoney(resume.depasses.totalTtcCts)} à relancer · TTC` : 'Aucun devis à relancer'}
                  actif={depassesSeuls}
                  onClick={() => choisir('envoye', true)} titre="Afficher les devis envoyés dont la validité est passée" />
              </>
            )}
          </div>
        )}

        {/* ── Liste : filtres en tête, tableau défilant ── */}
        <section className={`${carteCls} flex flex-col min-w-0 lg:flex-1 lg:min-h-0 overflow-hidden`}>
          {!loading && !loadError && quotes.length > 0 && (
            <div className="flex flex-col gap-2 p-3 pb-2 border-b border-[var(--border)]">
              <div className="flex flex-wrap items-center gap-2">
                <BarreRecherche value={saisie} onChange={setSaisie} placeholder="Chercher un devis : client, libellé, n°, référence…" ariaLabel="Rechercher un devis"
                  raccourci taille="sm" className="flex-1 min-w-[12rem] basis-full sm:basis-auto" />
                <select value={statut} onChange={e => { setStatut(e.target.value as QuoteStatus | 'all'); setDepassesSeuls(false) }}
                  aria-label="Statut" className={`${champCls} sm:w-[9rem]`}>
                  <option value="all">Tous statuts</option>
                  {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  aria-label="Client" className={`${champCls} sm:w-[11rem]`}>
                  <option value="">Tous clients</option>
                  {clientsListe.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 min-w-0 text-xs text-[var(--text-muted)]">
                <span className="truncate">
                  <b className="font-semibold text-[var(--text)]">{visibles.length}</b>
                  {` devis`}{depassesSeuls ? ' · validité dépassée' : statut !== 'all' ? ` · ${STATUS_LABELS[statut]}` : ''}
                </span>
                {aDesFiltres && (
                  <button type="button" onClick={reinitialiser}
                    className="shrink-0 underline underline-offset-2 hover:text-[var(--text)]">
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
            {loading ? (
              <div className="p-3 flex flex-col gap-2">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8" />)}</div>
            ) : loadError ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <p className="text-[var(--danger)] text-sm">{loadError}</p>
                <Button variant="secondary" onClick={load}>Réessayer</Button>
              </div>
            ) : quotes.length === 0 ? (
              <EmptyState
                icon={<FileText size={40} />}
                title="Aucun devis"
                description="Créez votre premier devis pour commencer."
                action={peutCreer ? { label: '+ Nouveau devis', onClick: openNew } : undefined}
              />
            ) : visibles.length === 0 ? (
              <EmptyState icon={<FileText size={40} />} title="Aucun devis" description="Aucun devis ne correspond aux filtres." />
            ) : (
              <>
                {/* PC : tableau compact */}
                <table className="hidden md:table w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[5rem]" />
                    <col className="w-[7.5rem]" />
                    <col className="w-[14rem]" />
                    <col className="w-[9rem]" />
                    <col />
                    <col className="w-[8rem]" />
                    <col className="w-[12rem]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)]">
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      <th className="px-2 py-1.5 font-medium">N° devis</th>
                      <th className="px-2 py-1.5 font-medium">Client</th>
                      <th className="px-2 py-1.5 font-medium">Prestation</th>
                      <th className="px-2 py-1.5 font-medium">Libellé</th>
                      <th className="px-2 py-1.5 font-medium text-right">TTC</th>
                      <th className="px-2 py-1.5 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(q => {
                      const expired = isExpiredDisplay(q.valid_until, q.statut, aujourdhui)
                      return (
                        <tr key={q.id} onClick={() => openEdit(q)}
                          className="border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]">
                          <td className="px-2 py-1 font-mono text-xs whitespace-nowrap text-[var(--text)]">{dateCourte(q.date, annee)}</td>
                          <td className="px-2 py-1 font-mono text-xs truncate">
                            {q.pennylane_quote_number
                              ? <span className="text-[var(--text)]">{q.pennylane_quote_number}</span>
                              : <span className="text-[var(--text-disabled)]">—</span>}
                          </td>
                          <td className="px-2 py-1 truncate font-medium text-[var(--text)]" title={q.clients?.name ?? ''}>{q.clients?.name ?? '—'}</td>
                          <td className="px-2 py-1 truncate text-[var(--text-muted)]">{q.prestation ? PRESTATION_LABELS[q.prestation] : '—'}</td>
                          <td className="px-2 py-1 truncate text-[var(--text-muted)]" title={q.description ?? ''}>{q.description ?? '—'}</td>
                          <td className="px-2 py-1 text-right font-mono whitespace-nowrap text-[var(--text)]">
                            {q.amount_ttc_cts != null ? formatMoney(q.amount_ttc_cts) : '—'}
                          </td>
                          <td className="px-2 py-1 text-xs">
                            <span className="inline-flex items-center gap-1.5">
                              <Badge color={STATUS_COLORS[q.statut]}>{STATUS_LABELS[q.statut]}</Badge>
                              {expired && (
                                <span title={q.valid_until ? `Valable jusqu'au ${dateCourte(q.valid_until, annee)}` : undefined}
                                  className="inline-flex items-center text-[var(--warning)]"><AlarmClock size={14} /></span>
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Mobile : lignes compactes */}
                <div className="md:hidden flex flex-col divide-y divide-[var(--border)]">
                  {visibles.map(q => {
                    const expired = isExpiredDisplay(q.valid_until, q.statut, aujourdhui)
                    return (
                      <button key={q.id} type="button" onClick={() => openEdit(q)}
                        className="w-full text-left px-3 py-2.5 flex flex-col gap-1 hover:bg-[var(--bg-card-hover)] transition-colors">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[var(--text)] truncate">{q.clients?.name ?? '—'}</span>
                          <Badge color={STATUS_COLORS[q.statut]}>{STATUS_LABELS[q.statut]}</Badge>
                        </span>
                        <span className="text-sm text-[var(--text-muted)] truncate">{q.description ?? '—'}</span>
                        <span className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                          <span className="font-mono">
                            {dateCourte(q.date, annee)}{q.pennylane_quote_number ? ` · ${q.pennylane_quote_number}` : ''}
                            {expired && <span className="ml-1.5 text-[var(--warning)]">· validité dépassée</span>}
                          </span>
                          <span className="font-mono font-semibold text-[var(--text)]">
                            {q.amount_ttc_cts != null ? formatMoney(q.amount_ttc_cts) : '—'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <DrawerDevis
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        quote={selected}
        onSaved={handleSaved}
      />
    </Shell>
  )
}

const carteCls = 'rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]'
// Même champ que la liste des livraisons.
const champCls = `h-8 min-w-0 px-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-xs placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--brand)] transition-colors`
