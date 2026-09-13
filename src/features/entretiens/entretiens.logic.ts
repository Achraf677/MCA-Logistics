import type { MaintenanceRow, MaintenanceType } from './entretiens.types'

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  vidange:            'Vidange',
  pneus:              'Pneus',
  freins:             'Freins',
  controle_technique: 'Contrôle technique',
  revision:           'Révision',
  reparation:         'Réparation',
  inspection:         'Inspection',
  autre:              'Autre',
}

export const MAINTENANCE_TYPE_COLOR: Record<MaintenanceType, 'muted' | 'info' | 'warning' | 'danger' | 'success'> = {
  vidange:            'info',
  pneus:              'warning',
  freins:             'danger',
  controle_technique: 'warning',
  revision:           'info',
  reparation:         'danger',
  inspection:         'muted',
  autre:              'muted',
}

export { formatCents } from '../../shared/lib/money'

export function formatMileage(km: number): string {
  return km.toLocaleString('fr-FR') + ' km'
}

export function kpiSummary(rows: MaintenanceRow[]) {
  const totalCostCts = rows.reduce((s, r) => s + (r.cost_cts ?? 0), 0)
  const withNextDue = rows.filter(r => r.next_due_date != null)
  const overdue = withNextDue.filter(r => r.next_due_date! < new Date().toISOString().slice(0, 10))
  return { nb: rows.length, totalCostCts, withNextDue: withNextDue.length, overdue: overdue.length }
}

// ── Récap par poste ───────────────────────────────────────────────────────────

/** Une ligne du récap : un poste, ce qu'il a coûté, et ce qu'on n'en sait pas. */
export interface LigneRecap {
  /** Identifiant stable du poste (type d'entretien, ou id du véhicule). */
  cle: string
  libelle: string
  total_cts: number
  /** Nombre d'opérations dans ce poste. */
  nb: number
  /**
   * Opérations SANS coût saisi, comptées à part.
   *
   * Sans ce compteur, une ligne « Freins · 0 € » se lirait comme « les freins
   * ne m'ont rien coûté », alors qu'elle peut vouloir dire « trois passages
   * chez le garagiste dont personne n'a saisi la facture ». La différence
   * entre zéro et inconnu doit rester visible.
   */
  nbSansCout: number
  /** Part du total général, entre 0 et 1. Pour la barre de proportion. */
  part: number
}

/**
 * Regroupe des opérations par poste et classe les plus chères en tête.
 *
 * Le tri est décroissant sur le montant, puis sur le nombre d'opérations, puis
 * alphabétique : à égalité de coût, un poste qui revient dix fois mérite
 * d'être vu avant un poste unique, et l'ordre reste stable d'un rendu à l'autre.
 */
function regrouper(
  rows: MaintenanceRow[],
  cleDe: (r: MaintenanceRow) => { cle: string; libelle: string },
): LigneRecap[] {
  const par = new Map<string, LigneRecap>()
  for (const r of rows) {
    const { cle, libelle } = cleDe(r)
    const ligne = par.get(cle) ?? { cle, libelle, total_cts: 0, nb: 0, nbSansCout: 0, part: 0 }
    ligne.total_cts += r.cost_cts ?? 0
    ligne.nb += 1
    if (r.cost_cts == null) ligne.nbSansCout += 1
    par.set(cle, ligne)
  }

  const general = [...par.values()].reduce((s, l) => s + l.total_cts, 0)
  return [...par.values()]
    .map(l => ({ ...l, part: general > 0 ? l.total_cts / general : 0 }))
    .sort((a, b) =>
      b.total_cts - a.total_cts ||
      b.nb - a.nb ||
      a.libelle.localeCompare(b.libelle, 'fr'),
    )
}

/**
 * Dépenses par TYPE d'entretien : pneus, freins, vidange…
 *
 * C'est la question qu'on se pose devant une flotte — « où part l'argent ? ».
 * Un type absent de la base (`null`) est regroupé sous « Non typé » plutôt
 * qu'écarté : une opération sans type reste de l'argent dépensé.
 */
export function recapParType(rows: MaintenanceRow[]): LigneRecap[] {
  return regrouper(rows, r => ({
    cle: r.type ?? '__sans_type__',
    libelle: r.type ? MAINTENANCE_TYPE_LABELS[r.type] : 'Non typé',
  }))
}

/**
 * Dépenses par VÉHICULE : l'autre question, « quel camion me coûte cher ? ».
 *
 * Même remarque pour un véhicule supprimé ou non joint : « Véhicule inconnu »
 * plutôt qu'une ligne muette.
 */
export function recapParVehicule(rows: MaintenanceRow[]): LigneRecap[] {
  return regrouper(rows, r => ({
    cle: r.vehicle_id ?? '__sans_vehicule__',
    libelle: r.vehicles?.label ?? 'Véhicule inconnu',
  }))
}
