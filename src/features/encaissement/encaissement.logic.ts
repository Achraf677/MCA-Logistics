import type { AutreEntreeRow, EncaissementRow } from './encaissement.types'

export { formatCents } from '../../shared/lib/money'

export function kpiSummary(rows: EncaissementRow[]) {
  const totalEncaisseCts = rows.reduce((s, r) => s + r.effective_ttc_cts, 0)
  return { nb: rows.length, totalEncaisseCts }
}

export const AUTRE_ENTREE_LABELS: Record<string, string> = {
  cca:          'Apport CCA',
  remboursement: 'Remboursement',
  autre:        'Autre',
}

export function autreEntreeLabel(justifType: string | null): string {
  if (!justifType) return 'Non identifié'
  return AUTRE_ENTREE_LABELS[justifType] ?? justifType
}

export function autresEntreesTotal(rows: AutreEntreeRow[]): number {
  return rows.reduce((s, r) => s + r.amount_cts, 0)
}
