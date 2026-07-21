import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Bell, RefreshCw, Brain, Link2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { toLocalISO } from '../../shared/lib/dates'
import { getAlertesDetectionData, getAlertesBriefing } from './alertes.queries'
import { detectAlerts } from './alertes.logic'
import { getAlertesMetier } from '../../shared/lib/alertesEngine.queries'
import { resumeAlertes } from '../../shared/lib/alertesEngine'
import { formatMoney } from '../../shared/lib/money'
import type { AlerteMetier, AlerteSeverite } from '../../shared/lib/alertesEngine'
import type { Alert, AlertCategory, AlertSeverity } from './alertes.types'

// Domaines métier gérés par le MOTEUR (source unique). Les échéances détaillées
// (detectAlerts) ne rendent QUE les catégories non couvertes par le moteur,
// pour éviter tout double comptage dans le badge.
const CATEGORIES_HORS_MOTEUR: AlertCategory[] = [
  'incident', 'inspection', 'chauffeur', 'rh', 'conformite', 'entretien',
]

const SEV_META_METIER: Record<AlerteSeverite, { label: string; soft: string; dot: string }> = {
  rouge:  { label: 'Rouge',  soft: 'bg-[var(--danger)]/12 text-[var(--danger)]',   dot: 'bg-[var(--danger)]' },
  orange: { label: 'Orange', soft: 'bg-[var(--warning)]/12 text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
  info:   { label: 'Info',   soft: 'bg-[var(--info)]/12 text-[var(--info)]',        dot: 'bg-[var(--info)]' },
}
const SEV_ORDER_METIER: AlerteSeverite[] = ['rouge', 'orange', 'info']

// ── Métadonnées d'affichage (version condensée de Alertes.tsx) ────────────────

const SEVERITY_ORDER: AlertSeverity[] = ['critique', 'urgent', 'warning', 'info']

const SEVERITY_META: Record<AlertSeverity, { label: string; soft: string; dot: string }> = {
  critique: { label: 'Critique',     soft: 'bg-[var(--danger)]/12 text-[var(--danger)]',   dot: 'bg-[var(--danger)]' },
  urgent:   { label: 'Urgent',       soft: 'bg-[var(--danger)]/12 text-[var(--danger)]',   dot: 'bg-[var(--danger)]' },
  warning:  { label: 'À surveiller', soft: 'bg-[var(--warning)]/12 text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
  info:     { label: 'Info',         soft: 'bg-[var(--info)]/12 text-[var(--info)]',        dot: 'bg-[var(--info)]' },
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

// Route par table source (pages liste — pas de deep-link /:id).
const TABLE_ROUTE: Record<string, string> = {
  vehicles: '/vehicules',
  team_members: '/equipe',
  vehicle_maintenances: '/entretiens',
  deliveries: '/livraisons',
  incidents: '/incidents',
  inspections: '/inspections',
  companies: '/parametres',
}

/** Échéance lisible à partir de daysLeft. */
function dueText(a: Alert): string | null {
  if (a.daysLeft == null) return null
  if (a.daysLeft < 0) return `en retard de ${-a.daysLeft} j`
  if (a.daysLeft === 0) return "aujourd'hui"
  return `dans ${a.daysLeft} j`
}

// ── Ligne condensée ───────────────────────────────────────────────────────────

function BellRow({ alert, onNavigate }: { alert: Alert; onNavigate: () => void }) {
  const navigate = useNavigate()
  const m = SEVERITY_META[alert.severity]
  const due = dueText(alert)
  const route = TABLE_ROUTE[alert.ref.table]
  const overdue = alert.daysLeft != null && alert.daysLeft < 0
  return (
    <button
      type="button"
      onClick={() => { if (route) { navigate(route); onNavigate() } }}
      disabled={!route}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors enabled:hover:bg-[var(--bg-card-hover)] disabled:cursor-default"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[var(--fs-sm)] font-medium text-[var(--text)]">{alert.title}</span>
          <span className="shrink-0 text-[var(--fs-xs)] text-[var(--text-disabled)]">{CATEGORY_LABEL[alert.category]}</span>
        </div>
        <p className="mt-0.5 truncate text-[var(--fs-xs)] text-[var(--text-muted)]">{alert.detail}</p>
      </div>
      {due && (
        <span className={`mt-0.5 shrink-0 font-mono text-[var(--fs-xs)] ${overdue ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
          {due}
        </span>
      )}
    </button>
  )
}

// ── Cloche + popover ──────────────────────────────────────────────────────────

export function AlertesBell() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [metier, setMetier] = useState<AlerteMetier[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, metierAlertes] = await Promise.all([
      getAlertesDetectionData(),
      getAlertesMetier(),
    ])
    setAlerts(detectAlerts(data))
    setMetier(metierAlertes)
    setLoading(false)
  }, [])

  // Recalcul temps réel : au montage + à chaque OUVERTURE de la cloche.
  useEffect(() => { load() }, [load])
  useEffect(() => { if (open) load() }, [open, load])

  // Fermeture : clic hors du composant + touche Échap. Listeners nettoyés au démontage.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const all = useMemo(() => alerts ?? [], [alerts])

  // Échéances détaillées : SEULEMENT les catégories hors moteur (incidents,
  // inspections, RH, entretien, conformité) — le reste vient du moteur unifié.
  const echeancesDetail = useMemo(
    () => all.filter(a => CATEGORIES_HORS_MOTEUR.includes(a.category)),
    [all],
  )
  const echeanceGroups = useMemo(
    () => SEVERITY_ORDER
      .map(sev => ({ sev, items: echeancesDetail.filter(a => a.severity === sev) }))
      .filter(g => g.items.length > 0),
    [echeancesDetail],
  )
  // Badge échéances = critique/urgent/warning (info exclu), aligné sur la règle moteur.
  const echeanceBadge = useMemo(
    () => echeancesDetail.filter(a => a.severity !== 'info').length,
    [echeancesDetail],
  )

  // Moteur métier — source unifiée (finance, encaissement, véhicules, devis…).
  const metierAll = useMemo(() => metier ?? [], [metier])
  const metierGroups = useMemo(
    () => SEV_ORDER_METIER
      .map(sev => ({ sev, items: metierAll.filter(a => a.severite === sev) }))
      .filter(g => g.items.length > 0),
    [metierAll],
  )
  const metierResume = useMemo(() => resumeAlertes(metierAll), [metierAll])

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

  // Badge global = badge moteur (rouge+orange) + échéances non-info hors moteur.
  // Les alertes 'info' n'incrémentent JAMAIS le badge (règle du moteur).
  const count = metierResume.badge + echeanceBadge

  return (
    <div ref={rootRef} className="relative">
      {/* Bouton cloche */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Alertes & échéances"
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text)]"
      >
        <Bell size={17} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-semibold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.25))]">
          {/* En-tête */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[var(--fs-sm)] font-semibold text-[var(--text)]">Alertes &amp; échéances</span>
              {count > 0 && (
                <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[var(--fs-xs)] font-medium text-[var(--brand)]">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                aria-label="Actualiser"
                className="flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text)] disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Corps scrollable */}
          <div className="max-h-[70vh] overflow-y-auto">
            {loading && alerts === null ? (
              <div className="px-3 py-8 text-center text-[var(--fs-sm)] text-[var(--text-muted)]">Chargement…</div>
            ) : count === 0 && metierAll.length === 0 && echeancesDetail.length === 0 ? (
              <EmptyState
                icon={<Bell size={36} />}
                title="Tout est en ordre ✓"
                description="Aucune action requise pour le moment."
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {/* Moteur métier unifié — groupé par sévérité (rouge → info). */}
                {metierGroups.map(({ sev, items }) => (
                  <div key={`m-${sev}`}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 ${SEV_META_METIER[sev].soft}`}>
                      <Link2 size={12} />
                      <span className="text-[var(--fs-xs)] font-semibold">{SEV_META_METIER[sev].label}</span>
                      <span className="text-[var(--fs-xs)] opacity-70">({items.length})</span>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {items.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { navigate(a.lien); setOpen(false) }}
                          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-card-hover)]"
                        >
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_META_METIER[sev].dot}`} />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[var(--fs-sm)] font-medium text-[var(--text)]">{a.label}</span>
                            {a.montantCts != null && a.montantCts > 0 && (
                              <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{formatMoney(a.montantCts)}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Échéances détaillées (incidents, inspections, RH, entretien…). */}
                {echeanceGroups.map(({ sev, items }) => (
                  <div key={sev}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 ${SEVERITY_META[sev].soft}`}>
                      <span className={`h-2 w-2 rounded-full ${SEVERITY_META[sev].dot}`} />
                      <span className="text-[var(--fs-xs)] font-semibold">{SEVERITY_META[sev].label}</span>
                      <span className="text-[var(--fs-xs)] opacity-70">({items.length})</span>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {items.map(a => <BellRow key={a.id} alert={a} onNavigate={() => setOpen(false)} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Brief du jour — À LA DEMANDE uniquement */}
          {count > 0 && (
            <div className="border-t border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[var(--fs-sm)] font-medium text-[var(--text)]">
                  <Brain size={14} className="text-[var(--brand)]" /> Brief du jour
                </span>
                <Button variant="ghost" size="compact" onClick={runBriefing} disabled={briefingLoading}>
                  {briefingLoading ? 'Génération…' : briefing !== null ? 'Régénérer' : 'Générer le briefing'}
                </Button>
              </div>

              {briefingError && (
                <p className="mt-2 rounded-[var(--r-md)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-[var(--fs-xs)] text-[var(--danger)]">
                  {briefingError}
                </p>
              )}

              {briefing !== null && (
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[var(--r-md)] border border-[var(--brand)]/30 bg-[var(--brand-soft)] px-3 py-2 text-[var(--fs-xs)] text-[var(--text)]">
                  {briefing}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
