import { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, Search, X, Brain } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { toLocalISO } from '../../shared/lib/dates'
import { getAlertesDetectionData, getAlertesBriefing } from './alertes.queries'
import { detectAlerts, summarizeAlerts } from './alertes.logic'
import type { Alert, AlertCategory, AlertSeverity } from './alertes.types'

// ── Métadonnées d'affichage ──────────────────────────────────────────────────

const SEVERITY_ORDER: AlertSeverity[] = ['critique', 'urgent', 'warning', 'info']

const SEVERITY_META: Record<AlertSeverity, { label: string; pill: string; soft: string; dot: string }> = {
  critique: { label: 'Critique', pill: 'bg-[var(--danger)] text-white',                 soft: 'bg-[var(--danger)]/12 text-[var(--danger)]',   dot: 'bg-[var(--danger)]' },
  urgent:   { label: 'Urgent',   pill: 'bg-[var(--danger)]/15 text-[var(--danger)]',    soft: 'bg-[var(--danger)]/12 text-[var(--danger)]',   dot: 'bg-[var(--danger)]' },
  warning:  { label: 'À surveiller', pill: 'bg-[var(--warning)]/15 text-[var(--warning)]', soft: 'bg-[var(--warning)]/12 text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
  info:     { label: 'Info',     pill: 'bg-[var(--info)]/15 text-[var(--info)]',        soft: 'bg-[var(--info)]/12 text-[var(--info)]',       dot: 'bg-[var(--info)]' },
}

// Route par table source (les routes sont des pages liste — pas de deep-link /:id).
const TABLE_ROUTE: Record<string, string> = {
  vehicles: '/vehicules',
  team_members: '/equipe',
  vehicle_maintenances: '/entretiens',
  deliveries: '/livraisons',
  incidents: '/incidents',
  inspections: '/inspections',
  companies: '/parametres',
}

const CATEGORY_LABEL: Record<AlertCategory, string> = {
  vehicule: 'Véhicule',
  chauffeur: 'Chauffeur',
  rh: 'RH',
  entretien: 'Entretien',
  livraison: 'Livraison',
  facture: 'Facture',
  incident: 'Incident',
  inspection: 'Inspection',
  conformite: 'Conformité',
}

// Filtres catégorie (chauffeur + rh regroupés en « Équipe »).
const CATEGORY_FILTERS: Array<{ key: string; label: string; match: AlertCategory[] }> = [
  { key: 'vehicule',   label: 'Véhicule',   match: ['vehicule'] },
  { key: 'equipe',     label: 'Équipe',     match: ['chauffeur', 'rh'] },
  { key: 'entretien',  label: 'Entretien',  match: ['entretien'] },
  { key: 'livraison',  label: 'Livraison',  match: ['livraison'] },
  { key: 'facture',    label: 'Facture',    match: ['facture'] },
  { key: 'incident',   label: 'Incident',   match: ['incident'] },
  { key: 'inspection', label: 'Inspection', match: ['inspection'] },
  { key: 'conformite', label: 'Conformité', match: ['conformite'] },
]

/** Échéance lisible à partir de daysLeft (déjà calculé par le moteur via les helpers de dates). */
function dueText(a: Alert): string | null {
  if (a.daysLeft == null) return null
  if (a.daysLeft < 0) return `en retard de ${-a.daysLeft} j`
  if (a.daysLeft === 0) return "aujourd'hui"
  return `dans ${a.daysLeft} j`
}

// ── Composants ───────────────────────────────────────────────────────────────

function SeverityPill({
  severity, count, active, onClick,
}: { severity: AlertSeverity; count: number; active: boolean; onClick: () => void }) {
  const m = SEVERITY_META[severity]
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-[var(--r-md)] border px-3 py-2 transition-colors
        ${active ? 'border-current ' + m.soft : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'}`}
    >
      <span className={`h-2 w-2 rounded-full ${m.dot}`} />
      <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{m.label}</span>
      <span className="text-[var(--fs-sm)] font-mono text-[var(--text-muted)]">{count}</span>
    </button>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-[var(--fs-xs)] font-medium transition-colors
        ${active
          ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
          : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--bg-card-hover)]'}`}
    >
      {label}
    </button>
  )
}

function AlertRow({ alert }: { alert: Alert }) {
  const navigate = useNavigate()
  const m = SEVERITY_META[alert.severity]
  const due = dueText(alert)
  const route = TABLE_ROUTE[alert.ref.table]
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{alert.title}</span>
          <span className={`inline-flex items-center rounded-[var(--r-sm)] px-1.5 py-0.5 text-[var(--fs-xs)] font-medium ${m.soft}`}>
            {m.label}
          </span>
          <span className="inline-flex items-center rounded-[var(--r-sm)] bg-[var(--border)] px-1.5 py-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
            {CATEGORY_LABEL[alert.category]}
          </span>
        </div>
        <p className="mt-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">{alert.detail}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {due && (
          <span className={`font-mono text-[var(--fs-xs)] ${alert.daysLeft != null && alert.daysLeft < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
            {due}
          </span>
        )}
        {route ? (
          <Button variant="ghost" size="compact" onClick={() => navigate(route)}>Voir →</Button>
        ) : (
          <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">{alert.ref.table}</span>
        )}
      </div>
    </div>
  )
}

// ── Écran ────────────────────────────────────────────────────────────────────

export function Alertes() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getAlertesDetectionData()
    setAlerts(detectAlerts(data))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const all = alerts ?? []
  const summary = useMemo(() => summarizeAlerts(all), [all])

  const runBriefing = useCallback(async () => {
    setBriefingLoading(true)
    setBriefingError(null)
    try {
      const text = await getAlertesBriefing(all, toLocalISO(new Date()))
      setBriefing(text)
    } catch (e) {
      setBriefingError(e instanceof Error ? e.message : 'Échec de la génération du briefing.')
    } finally {
      setBriefingLoading(false)
    }
  }, [all])

  // Filtrage (l'ordre du moteur est conservé — aucun tri concurrent).
  const filtered = useMemo(() => {
    const catMatch = categoryFilter
      ? CATEGORY_FILTERS.find(c => c.key === categoryFilter)?.match ?? []
      : null
    const q = search.trim().toLowerCase()
    return all.filter(a => {
      if (severityFilter && a.severity !== severityFilter) return false
      if (catMatch && !catMatch.includes(a.category)) return false
      if (q && !(`${a.title} ${a.detail}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [all, severityFilter, categoryFilter, search])

  // Regroupement par sévérité (ordre fixe critique→info), items déjà triés.
  const groups = useMemo(
    () => SEVERITY_ORDER
      .map(sev => ({ sev, items: filtered.filter(a => a.severity === sev) }))
      .filter(g => g.items.length > 0),
    [filtered],
  )

  const hasFilter = severityFilter !== null || categoryFilter !== null || search.trim() !== ''

  if (loading) {
    return (
      <Shell pageTitle="Alertes">
        <div className="max-w-3xl space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </Shell>
    )
  }

  return (
    <Shell pageTitle="Alertes">
      <div className="max-w-3xl space-y-4">

        {/* En-tête : résumé + pastilles cliquables */}
        <div className="flex items-center justify-between">
          <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">
            {summary.total === 0
              ? 'Aucune alerte active'
              : `${summary.total} alerte${summary.total > 1 ? 's' : ''} active${summary.total > 1 ? 's' : ''}`}
          </span>
          <Button variant="ghost" size="compact" onClick={load}>Actualiser</Button>
        </div>

        {/* Briefing IA du jour */}
        <div>
          <Button
            variant="primary"
            onClick={runBriefing}
            disabled={summary.total === 0 || briefingLoading}
            className="w-full sm:w-auto"
          >
            <Brain size={15} className="shrink-0" />
            {summary.total === 0
              ? 'Aucune alerte'
              : briefingLoading
                ? 'Génération…'
                : '🧠 Briefing du jour'}
          </Button>

          {briefingError && (
            <div className="mt-3 rounded-[var(--r-md)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-[var(--fs-sm)] text-[var(--danger)]">
              {briefingError}
            </div>
          )}

          {briefing !== null && (
            <div className="mt-3 rounded-[var(--r-lg)] border border-[var(--brand)]/30 bg-[var(--brand-soft)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--brand)]/20 px-4 py-2">
                <span className="flex items-center gap-2 text-[var(--fs-sm)] font-semibold text-[var(--brand)]">
                  <Brain size={15} /> Briefing du jour
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="compact" onClick={runBriefing} disabled={briefingLoading}>
                    {briefingLoading ? 'Génération…' : 'Régénérer'}
                  </Button>
                  <Button variant="ghost" size="compact" onClick={() => setBriefing(null)}>Fermer</Button>
                </div>
              </div>
              <p className="whitespace-pre-wrap px-4 py-3 text-[var(--fs-sm)] text-[var(--text)]">
                {briefing}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SEVERITY_ORDER.map(sev => (
            <SeverityPill
              key={sev}
              severity={sev}
              count={summary.parSeverite[sev]}
              active={severityFilter === sev}
              onClick={() => setSeverityFilter(prev => (prev === sev ? null : sev))}
            />
          ))}
        </div>

        {summary.total > 0 && (
          <>
            {/* Filtres catégorie */}
            <div className="flex flex-wrap gap-2">
              {CATEGORY_FILTERS.map(c => (
                <FilterChip
                  key={c.key}
                  label={c.label}
                  active={categoryFilter === c.key}
                  onClick={() => setCategoryFilter(prev => (prev === c.key ? null : c.key))}
                />
              ))}
            </div>

            {/* Recherche */}
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher une alerte…"
                className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-9 pr-9 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus:border-[var(--brand)] focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                  aria-label="Effacer la recherche"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </>
        )}

        {/* Liste groupée par sévérité */}
        {summary.total === 0 ? (
          <EmptyState
            icon={<Bell size={48} />}
            title="Aucune alerte 🎉"
            description="Tout est en ordre, rien à signaler pour le moment."
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Search size={48} />}
            title="Aucun résultat"
            description="Aucune alerte ne correspond aux filtres."
            action={{ label: 'Réinitialiser', onClick: () => { setSeverityFilter(null); setCategoryFilter(null); setSearch('') } }}
          />
        ) : (
          <div className="space-y-4">
            {hasFilter && (
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              </p>
            )}
            {groups.map(({ sev, items }) => (
              <div key={sev} className={`overflow-hidden rounded-[var(--r-lg)] border ${SEVERITY_META[sev].soft.includes('danger') ? 'border-[var(--danger)]/30' : SEVERITY_META[sev].soft.includes('warning') ? 'border-[var(--warning)]/30' : 'border-[var(--info)]/30'}`}>
                <div className={`flex items-center gap-2 px-4 py-2 ${SEVERITY_META[sev].soft}`}>
                  <span className={`h-2 w-2 rounded-full ${SEVERITY_META[sev].dot}`} />
                  <span className="text-[var(--fs-sm)] font-semibold">{SEVERITY_META[sev].label}</span>
                  <span className="text-[var(--fs-xs)] opacity-70">({items.length})</span>
                </div>
                <div className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
                  {items.map(a => <AlertRow key={a.id} alert={a} />)}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </Shell>
  )
}
