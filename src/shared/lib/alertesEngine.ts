// Moteur d'alertes MÉTIER unifié — PUR (sans DB ni DOM), testable.
// Source de vérité unique consommée par AlertesBell ET Dashboard.
//
// Vit dans shared/ (pas de couplage cross-feature) : chaque feature fournit
// ses lignes brutes via la query `alertesEngine.queries.ts`, le moteur agrège.
//
// Sévérités : 'rouge' (bloquant / en retard), 'orange' (à traiter bientôt),
// 'info' (visibilité, n'incrémente PAS le badge global).

import type { ARapprocherCounts } from './aRapprocher'
import {
  countLivraisonsSansJustif, type DeliveryForJustif, type DocumentForJustif,
} from './livraisonsSansJustif'

export type AlerteSeverite = 'rouge' | 'orange' | 'info'

export interface AlerteMetier {
  /** Clé stable (dédup / React key). */
  id: string
  /** Domaine fonctionnel (regroupement + libellé). */
  domaine: 'tresorerie' | 'charges' | 'encaissement' | 'facturation' | 'devis' | 'vehicule' | 'notes_frais'
  /** Libellé précis affiché à l'utilisateur. */
  label: string
  /** Nombre d'éléments concernés. */
  count: number
  severite: AlerteSeverite
  /** Route de navigation (vue filtrée). */
  lien: string
  /** Montant total concerné en centimes (optionnel — encours, notes de frais). */
  montantCts?: number
}

// ── Entrées brutes ────────────────────────────────────────────────────────────

/** Facture émise non encore payée (pour l'encours en retard). */
export interface FactureImpayeeRow {
  id: string
  /** Date de facturation (ISO) — base du délai de paiement. */
  invoiced_at: string | null
  amount_ttc_cts: number | null
  montant_ttc_cts?: number | null
  /** Délai de paiement du client en jours (payment_terms). */
  payment_terms: number | null
}

/** Livraison livrée, en attente de facturation. */
export interface LivreeNonFactureeRow {
  id: string
  /** Date de livraison effective (ISO). */
  delivered_at: string | null
}

/** Devis en attente de réponse. */
export interface DevisEnAttenteRow {
  id: string
  statut: string
  /** Date d'émission (ISO). */
  date: string | null
}

/** Véhicule + échéances réglementaires. */
export interface VehiculeEcheanceRow {
  id: string
  label: string | null
  ct_expiry: string | null
  insurance_expiry: string | null
  next_revision_date: string | null
}

/** Note de frais non remboursée. */
export interface NoteFraisRow {
  id: string
  mode_paiement: string | null
  rembourse_le: string | null
  montant_ttc_cts: number | null
}

export interface AlertesEngineInput {
  aRapprocher?: ARapprocherCounts | null
  facturesImpayees?: FactureImpayeeRow[]
  livreesNonFacturees?: LivreeNonFactureeRow[]
  devisEnAttente?: DevisEnAttenteRow[]
  vehicules?: VehiculeEcheanceRow[]
  notesDeFrais?: NoteFraisRow[]
  livraisonsPourJustif?: DeliveryForJustif[]
  documentsLivraison?: DocumentForJustif[]
}

export interface AlertesEngineOptions {
  /** Seuil livrées non facturées (jours). Défaut 3. */
  seuilFacturationJours?: number
  /** Seuil devis en attente (jours). Défaut 14. */
  seuilDevisJours?: number
  /** Fenêtre d'anticipation échéances véhicule (jours). Défaut 30. */
  seuilVehiculeJours?: number
}

const DEFAULTS: Required<AlertesEngineOptions> = {
  seuilFacturationJours: 3,
  seuilDevisJours: 14,
  seuilVehiculeJours: 30,
}

// ── Helpers purs ──────────────────────────────────────────────────────────────

/** Jours écoulés depuis `iso` jusqu'à `today` (positif = passé). null si absent. */
export function joursEcoules(iso: string | null | undefined, today: Date): number | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((ref.getTime() - d.getTime()) / 86_400_000)
}

/** Jours restants avant `iso` (négatif = dépassé). null si absent. */
export function joursRestants(iso: string | null | undefined, today: Date): number | null {
  const e = joursEcoules(iso, today)
  return e === null ? null : -e
}

function ttc(r: { amount_ttc_cts?: number | null; montant_ttc_cts?: number | null }): number {
  return r.amount_ttc_cts ?? r.montant_ttc_cts ?? 0
}

// ── Détecteurs ────────────────────────────────────────────────────────────────

/** Factures impayées EN RETARD : invoiced_at + payment_terms < today. Rouge, montant. */
function detectEncoursRetard(rows: FactureImpayeeRow[], today: Date): AlerteMetier | null {
  let count = 0
  let montantCts = 0
  for (const r of rows) {
    const ecoule = joursEcoules(r.invoiced_at, today)
    if (ecoule === null) continue
    const delai = r.payment_terms ?? 30
    if (ecoule > delai) {           // échéance de paiement dépassée
      count++
      montantCts += ttc(r)
    }
  }
  if (count === 0) return null
  return {
    id: 'encours-retard',
    domaine: 'encaissement',
    label: `${count} facture${count > 1 ? 's' : ''} client en retard de paiement`,
    count, severite: 'rouge', montantCts,
    lien: '/encaissement',
  }
}

/** Livrées non facturées depuis > seuil jours. Orange. */
function detectLivreesNonFacturees(rows: LivreeNonFactureeRow[], today: Date, seuil: number): AlerteMetier | null {
  const count = rows.filter(r => {
    const j = joursEcoules(r.delivered_at, today)
    return j !== null && j > seuil
  }).length
  if (count === 0) return null
  return {
    id: 'livrees-non-facturees',
    domaine: 'facturation',
    label: `${count} livraison${count > 1 ? 's' : ''} livrée${count > 1 ? 's' : ''} non facturée${count > 1 ? 's' : ''} (> ${seuil} j)`,
    count, severite: 'orange',
    lien: '/livraisons',
  }
}

/** Devis en attente depuis > seuil jours. Info. */
function detectDevisEnAttente(rows: DevisEnAttenteRow[], today: Date, seuil: number): AlerteMetier | null {
  const EN_ATTENTE = new Set(['brouillon', 'envoye'])
  const count = rows.filter(r => {
    if (!EN_ATTENTE.has(r.statut)) return false
    const j = joursEcoules(r.date, today)
    return j !== null && j > seuil
  }).length
  if (count === 0) return null
  return {
    id: 'devis-en-attente',
    domaine: 'devis',
    label: `${count} devis en attente depuis plus de ${seuil} jours`,
    count, severite: 'info',
    lien: '/devis',
  }
}

/** Véhicules : ct/assurance/révision dépassés (rouge) ou < seuil jours (orange). */
function detectVehicules(rows: VehiculeEcheanceRow[], today: Date, seuil: number): AlerteMetier[] {
  let depasse = 0
  let bientot = 0
  const champs: Array<keyof VehiculeEcheanceRow> = ['ct_expiry', 'insurance_expiry', 'next_revision_date']
  for (const v of rows) {
    for (const c of champs) {
      const jr = joursRestants(v[c] as string | null, today)
      if (jr === null) continue
      if (jr < 0) depasse++
      else if (jr <= seuil) bientot++
    }
  }
  const out: AlerteMetier[] = []
  if (depasse > 0) out.push({
    id: 'vehicules-depasse',
    domaine: 'vehicule',
    label: `${depasse} échéance${depasse > 1 ? 's' : ''} véhicule dépassée${depasse > 1 ? 's' : ''} (CT / assurance / révision)`,
    count: depasse, severite: 'rouge', lien: '/vehicules',
  })
  if (bientot > 0) out.push({
    id: 'vehicules-bientot',
    domaine: 'vehicule',
    label: `${bientot} échéance${bientot > 1 ? 's' : ''} véhicule dans moins de ${seuil} jours`,
    count: bientot, severite: 'orange', lien: '/vehicules',
  })
  return out
}

/** Notes de frais non remboursées (mode_paiement='note_de_frais', rembourse_le null). Info, montant. */
function detectNotesDeFrais(rows: NoteFraisRow[]): AlerteMetier | null {
  const concernees = rows.filter(r => r.mode_paiement === 'note_de_frais' && !r.rembourse_le)
  if (concernees.length === 0) return null
  const montantCts = concernees.reduce((s, r) => s + (r.montant_ttc_cts ?? 0), 0)
  return {
    id: 'notes-frais',
    domaine: 'notes_frais',
    label: `${concernees.length} note${concernees.length > 1 ? 's' : ''} de frais à rembourser`,
    count: concernees.length, severite: 'info', montantCts,
    lien: '/charges',
  }
}

/** Livraisons livrée/facturée/payée sans aucun justificatif (POD, document, LV). Orange. */
function detectLivraisonsSansJustif(
  deliveries: DeliveryForJustif[],
  documents: DocumentForJustif[],
): AlerteMetier | null {
  const count = countLivraisonsSansJustif(deliveries, documents)
  if (count === 0) return null
  return {
    id: 'livraisons-sans-justif',
    domaine: 'facturation',
    label: `${count} livraison${count > 1 ? 's' : ''} sans justificatif`,
    count, severite: 'orange',
    lien: '/livraisons?filtre=sans_justif',
  }
}

/** Alertes issues des compteurs de rapprochement (source existante aRapprocher). */
function fromARapprocher(c: ARapprocherCounts): AlerteMetier[] {
  const out: AlerteMetier[] = []
  if (c.tresorerie > 0) out.push({
    id: 'tresorerie', domaine: 'tresorerie',
    label: `${c.tresorerie} mouvement${c.tresorerie > 1 ? 's' : ''} bancaire${c.tresorerie > 1 ? 's' : ''} à rapprocher`,
    count: c.tresorerie, severite: 'orange', lien: '/tresorerie',
  })
  if (c.encaissements > 0) out.push({
    id: 'encaissements', domaine: 'encaissement',
    label: `${c.encaissements} encaissement${c.encaissements > 1 ? 's' : ''} à identifier`,
    count: c.encaissements, severite: 'orange', lien: '/tresorerie',
  })
  if (c.categorisation > 0) out.push({
    id: 'categorisation', domaine: 'charges',
    label: `${c.categorisation} charge${c.categorisation > 1 ? 's' : ''} à catégoriser`,
    count: c.categorisation, severite: 'info', lien: '/charges',
  })
  if (c.pennylane_supprimees > 0) out.push({
    id: 'pennylane-supprimees', domaine: 'charges',
    label: `${c.pennylane_supprimees} facture${c.pennylane_supprimees > 1 ? 's' : ''} supprimée${c.pennylane_supprimees > 1 ? 's' : ''} dans Pennylane`,
    count: c.pennylane_supprimees, severite: 'rouge', lien: '/charges?filtre=pennylane_supprimees',
  })
  if (c.avoirs > 0) out.push({
    id: 'avoirs', domaine: 'charges',
    label: `${c.avoirs} avoir${c.avoirs > 1 ? 's' : ''} fournisseur à vérifier`,
    count: c.avoirs, severite: 'info', lien: '/charges',
  })
  return out
}

// ── Agrégation ────────────────────────────────────────────────────────────────

const SEVERITE_ORDER: Record<AlerteSeverite, number> = { rouge: 0, orange: 1, info: 2 }

export function buildAlertes(
  input: AlertesEngineInput,
  today: Date,
  options: AlertesEngineOptions = {},
): AlerteMetier[] {
  const opt = { ...DEFAULTS, ...options }
  const alertes: AlerteMetier[] = []

  if (input.aRapprocher) alertes.push(...fromARapprocher(input.aRapprocher))

  const encours = detectEncoursRetard(input.facturesImpayees ?? [], today)
  if (encours) alertes.push(encours)

  const livrees = detectLivreesNonFacturees(input.livreesNonFacturees ?? [], today, opt.seuilFacturationJours)
  if (livrees) alertes.push(livrees)

  const devis = detectDevisEnAttente(input.devisEnAttente ?? [], today, opt.seuilDevisJours)
  if (devis) alertes.push(devis)

  alertes.push(...detectVehicules(input.vehicules ?? [], today, opt.seuilVehiculeJours))

  const nf = detectNotesDeFrais(input.notesDeFrais ?? [])
  if (nf) alertes.push(nf)

  const sansJustif = detectLivraisonsSansJustif(input.livraisonsPourJustif ?? [], input.documentsLivraison ?? [])
  if (sansJustif) alertes.push(sansJustif)

  // Tri : rouge → orange → info, puis par count décroissant.
  return alertes.sort((a, b) =>
    SEVERITE_ORDER[a.severite] - SEVERITE_ORDER[b.severite] || b.count - a.count)
}

export interface AlertesResume {
  rouge: number
  orange: number
  info: number
  /** Badge global = nombre d'alertes rouge + orange (les info ne comptent pas). */
  badge: number
}

/** Résumé pondéré. Le badge compte les ALERTES (pas les éléments) rouge+orange. */
export function resumeAlertes(alertes: AlerteMetier[]): AlertesResume {
  let rouge = 0, orange = 0, info = 0
  for (const a of alertes) {
    if (a.severite === 'rouge') rouge++
    else if (a.severite === 'orange') orange++
    else info++
  }
  return { rouge, orange, info, badge: rouge + orange }
}
