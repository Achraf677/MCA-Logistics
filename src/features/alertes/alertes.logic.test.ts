import { describe, it, expect } from 'vitest'
import { detectAlerts, summarizeAlerts } from './alertes.logic'
import { toLocalISO } from '../../shared/lib/dates'
import type { AlertsInput } from './alertes.types'

// Date de référence fixe pour des tests déterministes.
const TODAY = new Date(2026, 5, 7) // 2026-06-07 (mois 0-indexé)

/** Date décalée de `n` jours par rapport à TODAY, en ISO local. */
function rel(n: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return toLocalISO(d)
}

/** Construit un AlertsInput vide, surchargé par `p`. */
function input(p: Partial<AlertsInput>): AlertsInput {
  return {
    vehicles: [],
    drivers: [],
    maintenances: [],
    deliveries: [],
    incidents: [],
    inspections: [],
    ...p,
  }
}

// ── Seuils d'échéance (véhicule) ─────────────────────────────────────────────
describe('détection véhicule — seuils critique/urgent/warning', () => {
  it('échéance dépassée → critique', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: rel(-1), insurance_expiry: null, next_revision_date: null }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].severity).toBe('critique')
    expect(a[0].category).toBe('vehicule')
    expect(a[0].daysLeft).toBe(-1)
    expect(a[0].ref).toEqual({ table: 'vehicles', id: 'v1' })
  })

  it('échéance dans ≤7j → urgent', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: null, insurance_expiry: rel(7), next_revision_date: null }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].severity).toBe('urgent')
  })

  it('échéance dans ≤30j → warning', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: null, insurance_expiry: null, next_revision_date: rel(30) }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].severity).toBe('warning')
  })

  it('échéance > 30j → aucune alerte', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: rel(31), insurance_expiry: null, next_revision_date: null }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })

  it('date absente → aucune alerte (statut none)', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: null, insurance_expiry: null, next_revision_date: null }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })

  it('seuils paramétrables', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: rel(10), insurance_expiry: null, next_revision_date: null }] }),
      TODAY,
      { urgentDays: 14, warningDays: 30, lateDeliveryUrgentDays: 3, invoiceUrgentDays: 15, incidentUrgentDays: 14 },
    )
    expect(a[0].severity).toBe('urgent') // 10 ≤ 14
  })
})

// ── Chauffeur ────────────────────────────────────────────────────────────────
describe('détection chauffeur', () => {
  it('permis + visite médicale produisent deux alertes', () => {
    const a = detectAlerts(
      input({ drivers: [{ id: 'd1', full_name: 'Jean', licence_b_expiry: rel(-2), medical_visit_expiry: rel(5) }] }),
      TODAY,
    )
    expect(a).toHaveLength(2)
    expect(a.every(x => x.category === 'chauffeur')).toBe(true)
    expect(a.map(x => x.severity).sort()).toEqual(['critique', 'urgent'])
  })
})

// ── Entretien ────────────────────────────────────────────────────────────────
describe('détection entretien', () => {
  it('next_due_date dépassé → critique', () => {
    const a = detectAlerts(
      input({ maintenances: [{ id: 'm1', type: 'vidange', next_due_date: rel(-3), vehicleLabel: 'Master' }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].category).toBe('entretien')
    expect(a[0].severity).toBe('critique')
  })
})

// ── Livraison en retard ──────────────────────────────────────────────────────
describe('détection livraison en retard', () => {
  it('planifiée et dépassée ≤3j → warning', () => {
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'planifiee', date: rel(-2), invoiced_at: null, paid_at: null, payment_terms: 30 }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].category).toBe('livraison')
    expect(a[0].severity).toBe('warning')
  })

  it('planifiée et dépassée >3j → urgent', () => {
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'planifiee', date: rel(-4), invoiced_at: null, paid_at: null, payment_terms: 30 }] }),
      TODAY,
    )
    expect(a[0].severity).toBe('urgent')
  })

  it('planifiée non dépassée → aucune alerte', () => {
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'planifiee', date: rel(2), invoiced_at: null, paid_at: null, payment_terms: 30 }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })
})

// ── Facture impayée ──────────────────────────────────────────────────────────
describe('détection facture impayée', () => {
  it('échéance (invoiced_at + payment_terms) dépassée → warning', () => {
    // facturée il y a 35j, termes 30j → dépassée de 5j
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'facturee', date: rel(-40), invoiced_at: rel(-35), paid_at: null, payment_terms: 30 }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].category).toBe('facture')
    expect(a[0].severity).toBe('warning')
  })

  it('dépassée de plus de 15j → urgent', () => {
    // facturée il y a 50j, termes 30j → dépassée de 20j
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'facturee', date: rel(-55), invoiced_at: rel(-50), paid_at: null, payment_terms: 30 }] }),
      TODAY,
    )
    expect(a[0].severity).toBe('urgent')
  })

  it('payée (paid_at présent) → aucune alerte', () => {
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'facturee', date: rel(-50), invoiced_at: rel(-50), paid_at: rel(-1), payment_terms: 30 }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })

  it('échéance non dépassée → aucune alerte', () => {
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'facturee', date: rel(-10), invoiced_at: rel(-10), paid_at: null, payment_terms: 30 }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })

  it('payment_terms par défaut 30j appliqué', () => {
    const a = detectAlerts(
      input({ deliveries: [{ id: 'l1', statut: 'facturee', date: rel(-35), invoiced_at: rel(-35), paid_at: null, payment_terms: 0 as unknown as number }] }),
      TODAY,
    )
    // payment_terms 0 → ?? n'intervient pas (0 est valide), donc dépassée de 35j → urgent
    expect(a[0].severity).toBe('urgent')
  })
})

// ── Incident ─────────────────────────────────────────────────────────────────
describe('détection incident', () => {
  it('ouvert récemment → warning', () => {
    const a = detectAlerts(
      input({ incidents: [{ id: 'i1', status: 'ouvert', date: rel(-3) }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].category).toBe('incident')
    expect(a[0].severity).toBe('warning')
  })

  it('ouvert depuis > 14j → urgent', () => {
    const a = detectAlerts(
      input({ incidents: [{ id: 'i1', status: 'en_cours', date: rel(-20) }] }),
      TODAY,
    )
    expect(a[0].severity).toBe('urgent')
  })

  it('clos → aucune alerte', () => {
    const a = detectAlerts(
      input({ incidents: [{ id: 'i1', status: 'clos', date: rel(-30) }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })
})

// ── Inspection ───────────────────────────────────────────────────────────────
describe('détection inspection', () => {
  it('défauts → urgent', () => {
    const a = detectAlerts(
      input({ inspections: [{ id: 's1', status: 'defauts', date: rel(-1) }] }),
      TODAY,
    )
    expect(a).toHaveLength(1)
    expect(a[0].severity).toBe('urgent')
    expect(a[0].category).toBe('inspection')
  })

  it('refusé → urgent', () => {
    const a = detectAlerts(
      input({ inspections: [{ id: 's1', status: 'refuse', date: rel(-1) }] }),
      TODAY,
    )
    expect(a[0].severity).toBe('urgent')
  })

  it('ok → aucune alerte', () => {
    const a = detectAlerts(
      input({ inspections: [{ id: 's1', status: 'ok', date: rel(-1) }] }),
      TODAY,
    )
    expect(a).toHaveLength(0)
  })
})

// ── Déduplication ────────────────────────────────────────────────────────────
describe('déduplication', () => {
  it('une seule alerte par (table, id, type)', () => {
    const dup = { id: 'v1', label: 'Kangoo', ct_expiry: rel(-1), insurance_expiry: null, next_revision_date: null }
    const a = detectAlerts(input({ vehicles: [dup, dup] }), TODAY)
    expect(a).toHaveLength(1)
  })

  it('types différents sur même véhicule ne sont pas dédupliqués', () => {
    const a = detectAlerts(
      input({ vehicles: [{ id: 'v1', label: 'Kangoo', ct_expiry: rel(-1), insurance_expiry: rel(-1), next_revision_date: null }] }),
      TODAY,
    )
    expect(a).toHaveLength(2)
    expect(new Set(a.map(x => x.id)).size).toBe(2)
  })
})

// ── Tri ──────────────────────────────────────────────────────────────────────
describe('tri', () => {
  it('par sévérité (critique→info) puis dueDate croissant', () => {
    const a = detectAlerts(
      input({
        vehicles: [
          { id: 'v1', label: 'A', ct_expiry: rel(20), insurance_expiry: null, next_revision_date: null }, // warning, due +20
          { id: 'v2', label: 'B', ct_expiry: rel(-5), insurance_expiry: null, next_revision_date: null }, // critique
          { id: 'v3', label: 'C', ct_expiry: rel(3), insurance_expiry: null, next_revision_date: null },  // urgent
          { id: 'v4', label: 'D', ct_expiry: rel(10), insurance_expiry: null, next_revision_date: null }, // warning, due +10
        ],
      }),
      TODAY,
    )
    expect(a.map(x => x.severity)).toEqual(['critique', 'urgent', 'warning', 'warning'])
    // entre les deux warning : dueDate croissant → +10 (v4) avant +20 (v1)
    expect(a[2].ref.id).toBe('v4')
    expect(a[3].ref.id).toBe('v1')
  })
})

// ── summarizeAlerts ──────────────────────────────────────────────────────────
describe('summarizeAlerts', () => {
  it('compte total, par sévérité et par catégorie', () => {
    const alerts = detectAlerts(
      input({
        vehicles: [{ id: 'v1', label: 'A', ct_expiry: rel(-1), insurance_expiry: null, next_revision_date: null }],
        inspections: [{ id: 's1', status: 'refuse', date: rel(-1) }],
        incidents: [{ id: 'i1', status: 'ouvert', date: rel(-1) }],
      }),
      TODAY,
    )
    const s = summarizeAlerts(alerts)
    expect(s.total).toBe(3)
    expect(s.parSeverite.critique).toBe(1)
    expect(s.parSeverite.urgent).toBe(1)
    expect(s.parSeverite.warning).toBe(1)
    expect(s.parCategorie.vehicule).toBe(1)
    expect(s.parCategorie.inspection).toBe(1)
    expect(s.parCategorie.incident).toBe(1)
  })

  it('résumé vide pour aucune alerte', () => {
    const s = summarizeAlerts([])
    expect(s.total).toBe(0)
    expect(s.parSeverite).toEqual({ info: 0, warning: 0, urgent: 0, critique: 0 })
  })
})
