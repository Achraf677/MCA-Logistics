import type { AutreEntreeRow, EncaissementRow, EntreeUnifiee } from './encaissement.types'

export { formatCents } from '../../shared/lib/money'

// ── Badge nature ──────────────────────────────────────────────────────────────

type BadgeColor = 'success' | 'warning' | 'muted'

export const NATURE_BADGE: Record<string, { label: string; color: BadgeColor }> = {
  client:        { label: 'Encaissement client', color: 'success' },
  cca:           { label: 'Apport CCA',          color: 'success' },
  remboursement: { label: 'Remboursement',        color: 'success' },
  autre:         { label: 'Autre',                color: 'muted'   },
  non_identifie: { label: 'Non identifié',        color: 'warning' },
}

export function natureBadge(nature: string): { label: string; color: BadgeColor } {
  return NATURE_BADGE[nature] ?? { label: nature, color: 'muted' }
}

// ── Liste unifiée ─────────────────────────────────────────────────────────────

export function buildEntreesUnifiees(
  encaissements: EncaissementRow[],
  autres: AutreEntreeRow[],
): EntreeUnifiee[] {
  const fromEnc: EntreeUnifiee[] = encaissements.map(r => ({
    key:         `enc-${r.id}`,
    date:        r.paid_at,
    libelle:     r.client_name,
    montant_cts: r.effective_ttc_cts,
    nature:      'client',
  }))
  const fromAutres: EntreeUnifiee[] = autres.map(r => ({
    key:         `ae-${r.qonto_id}`,
    date:        r.settled_at,
    libelle:     r.label ?? '—',
    montant_cts: r.amount_cts,
    nature:      r.justif_type ?? 'non_identifie',
  }))
  return [...fromEnc, ...fromAutres].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export function kpiSummaryUnifie(entrees: EntreeUnifiee[]) {
  const clients = entrees.filter(e => e.nature === 'client')
  const autres  = entrees.filter(e => e.nature !== 'client')
  return {
    totalClientsCts: clients.reduce((s, e) => s + e.montant_cts, 0),
    totalAutresCts:  autres.reduce((s, e) => s + e.montant_cts, 0),
  }
}
