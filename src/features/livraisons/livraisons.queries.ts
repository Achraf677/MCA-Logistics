import { supabase } from '../../app/providers'
import { lireErreurEdge } from '../../shared/lib/erreurEdge'
import type { NatureEchec } from '../../shared/lib/erreurEdge'
import { canTransition } from './livraisons.logic'
import type { ComputedAmount } from './livraisons.logic'
import type { DeliveryFilters, DeliveryInsert, DeliveryStatus } from './livraisons.types'

const WITH_JOINS = `
  *,
  clients!client_id(name, tariff_mode, tariff_rate_cts, email),
  vehicles!vehicle_id(label, plate),
  team_members!driver_id(full_name)
`.trim()

/** Envoie au client la facture Pennylane + BL par email (Edge send-client-email). */
export async function sendClientEmail(deliveryId: string) {
  return supabase.functions.invoke('send-client-email', { body: { delivery_id: deliveryId } })
}

export async function getDeliveries(filters: DeliveryFilters = {}) {
  let q = supabase
    .from('deliveries')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') q = q.eq('statut', filters.status)
  if (filters.client_id)  q = q.eq('client_id', filters.client_id)
  if (filters.vehicle_id) q = q.eq('vehicle_id', filters.vehicle_id)
  if (filters.driver_id)  q = q.eq('driver_id', filters.driver_id)
  if (filters.date_from)  q = q.gte('date', filters.date_from)
  if (filters.date_to)    q = q.lte('date', filters.date_to)

  return q
}

/** Une livraison par son id — ouverture directe via `/livraisons?ouvrir=<id>` (Dashboard). */
export async function getDelivery(id: string) {
  return supabase.from('deliveries').select(WITH_JOINS).eq('id', id).maybeSingle()
}

/** Livraisons ayant un bon de livraison (lv_numero attribué) — alimente l'onglet
 *  "Bons de livraison". Aucune nouvelle table/colonne : filtre sur deliveries. */
export async function getDeliveriesWithLv(filters: Pick<DeliveryFilters, 'date_from' | 'date_to'> = {}) {
  let q = supabase
    .from('deliveries')
    .select(WITH_JOINS)
    .not('lv_numero', 'is', null)
    .order('date', { ascending: false })

  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createDelivery(data: DeliveryInsert) {
  return supabase.from('deliveries').insert(data).select(WITH_JOINS).single()
}

export async function updateDelivery(id: string, data: Partial<DeliveryInsert>) {
  return supabase.from('deliveries').update(data).eq('id', id).select(WITH_JOINS).single()
}

// Suppression (RLS : président uniquement, via deliveries_delete_president).
export async function deleteDelivery(id: string) {
  return supabase.from('deliveries').delete().eq('id', id)
}

/**
 * Orchestre une transition gardée.
 * - Vérifie canTransition() → erreur si saut illégal.
 * - →livree : pose delivered_at.
 * - →facturee : N'ÉCRIT PAS le statut. C'est l'Edge `pennylane-invoice` qui le
 *   passe à `facturee`, et seulement une fois la facture créée chez Pennylane.
 *   Voir `facturerCourse`.
 * - →payee : pose paid_at, puis informe Pennylane en best-effort
 *   (`pennylane-register-payment`). Aucun blocage si KO.
 *
 * `amount` n'est plus écrit : la facture est construite par l'Edge depuis les
 * montants EN BASE. Il ne sert plus qu'au contrôle « montant requis ».
 */
export async function transitionDelivery(
  id: string,
  from: string,
  to: DeliveryStatus,
  amount?: ComputedAmount,
): Promise<{ data: unknown; error: Error | null }> {
  if (!canTransition(from, to)) {
    return { data: null, error: new Error(`Transition ${from} → ${to} interdite`) }
  }

  if (to === 'facturee') {
    if (!amount || amount.amount_ht_cts <= 0) {
      return { data: null, error: new Error('Montant requis avant de facturer') }
    }
    const r = await facturerCourse(id)
    if (!r.ok) return { data: null, error: new Error(r.message) }
    return getDelivery(id).then(({ data, error }) => ({
      data, error: error ? new Error(error.message) : null,
    }))
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { statut: to }
  if (to === 'livree') updates.delivered_at = now
  if (to === 'payee')  updates.paid_at = now

  const { data, error } = await supabase
    .from('deliveries')
    .update(updates)
    .eq('id', id)
    .eq('statut', from) // garde : personne n'a changé le statut entre-temps
    .select(WITH_JOINS)
    .maybeSingle()

  if (error) return { data: null, error: new Error(error.message) }
  if (!data) {
    return { data: null, error: new Error('Le statut a changé entre-temps (ou droits insuffisants) — rechargez la liste.') }
  }

  if (to === 'payee') {
    // Best-effort : le paiement est déjà effectif côté MCA, on informe Pennylane.
    // L'Edge déclare la FACTURE entière une seule fois (courses groupées comprises).
    // Un échec ne remonte pas comme erreur (pas de sync_pending détourné : cette
    // colonne est dédiée à la facturation, `resyncPending` ne réagit qu'à ça).
    await tryPushPaymentPennylane(id)
  }

  return { data, error: null }
}

async function tryPushPaymentPennylane(deliveryId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('pennylane-register-payment', {
      body: { delivery_id: deliveryId },
    })
    return (await lireErreurEdge(data, error)) === null
  } catch {
    return false
  }
}

// ── Facturation Pennylane ────────────────────────────────────────────────────
//
// Trois issues possibles quand on appelle `pennylane-invoice` :
//   1. Succès : l'Edge a créé la facture ET passé les courses à `facturee`.
//   2. Refus MÉTIER (4xx, ou Pennylane qui refuse la facture) : rien n'a été
//      émis. Le statut ne bouge PAS (la course reste `livree`), la cause est
//      renvoyée telle quelle à l'écran (l'Edge l'a aussi écrite dans
//      `sync_error` pour une course seule). Il faut corriger, puis refacturer.
//   3. Échec TECHNIQUE (réseau, délai, 5xx) : on ne sait pas trancher. Repli
//      `sync_pending = true` + `sync_error` = cause, le statut reste `livree` ;
//      le bouton « Resynchroniser » de la liste relancera l'appel.
// Cas particulier : `enregistrement_echoue` — la facture EXISTE chez Pennylane
// mais l'Edge n'a pas pu l'écrire en base. On l'écrit d'ici ; surtout pas de
// `sync_pending`, sinon le rattrapage la refacturerait (double facture).

export type ResultatFacturation =
  | { ok: true; data: Record<string, unknown> | null }
  | { ok: false; message: string; nature: NatureEchec }

async function appelerFacturation(
  body: Record<string, unknown>,
  ids: string[],
): Promise<ResultatFacturation> {
  let data: unknown
  let error: unknown
  try {
    const r = await supabase.functions.invoke('pennylane-invoice', { body })
    data = r.data
    error = r.error
  } catch (e) {
    data = null
    error = e
  }

  const echec = await lireErreurEdge(data, error)
  if (!echec) {
    const d = data as { data?: Record<string, unknown> } | null
    return { ok: true, data: d?.data ?? null }
  }

  if (echec.code === 'enregistrement_echoue' && echec.corps?.pennylane_invoice_id) {
    const c = echec.corps
    const now = new Date().toISOString()
    const { error: upErr } = await supabase.from('deliveries').update({
      pennylane_invoice_id: String(c.pennylane_invoice_id),
      pennylane_invoice_number: (c.pennylane_invoice_number as string | null) ?? null,
      invoice_group_id: (c.invoice_group_id as string | null) ?? null,
      statut: 'facturee',
      invoiced_at: now,
      pennylane_synced_at: now,
      sync_pending: false,
      sync_error: null,
    }).in('id', ids)
    if (!upErr) return { ok: true, data: c }
    return {
      ok: false,
      nature: 'metier',
      message: `Facture Pennylane ${String(c.pennylane_invoice_number ?? c.pennylane_invoice_id)} créée `
        + 'mais non enregistrée ici. NE PAS refacturer : noter ce numéro et prévenir le support.',
    }
  }

  return { ok: false, message: echec.message, nature: echec.nature }
}

/** Facture UNE course (livree → facturee via l'Edge). */
export async function facturerCourse(id: string): Promise<ResultatFacturation> {
  const r = await appelerFacturation({ delivery_id: id }, [id])
  if (!r.ok && r.nature === 'technique') {
    // Repli : l'état reste `livree`, la course est marquée à resynchroniser.
    await supabase.from('deliveries')
      .update({ sync_pending: true, sync_error: `Facturation non aboutie : ${r.message}` })
      .eq('id', id)
      .is('pennylane_invoice_id', null)
    return { ...r, message: `Pennylane injoignable — facturation en attente, à resynchroniser. (${r.message})` }
  }
  return r
}

/**
 * Facture PLUSIEURS courses du même client sur UNE facture (liste Livraisons).
 * Aucun repli `sync_pending` ici : le rattrapage re-facture course par course,
 * il éclaterait la facture groupée en N factures. L'échec est renvoyé tel quel.
 */
export async function facturerGroupe(ids: string[]): Promise<ResultatFacturation> {
  if (ids.length === 0) return { ok: false, message: 'Aucune course sélectionnée.', nature: 'metier' }
  if (ids.length === 1) return facturerCourse(ids[0])
  return appelerFacturation({ delivery_ids: ids }, ids)
}

/**
 * Répare une course « facturée sans facture » (voir `estFacturationBloquee`) :
 * retour à `livree`, marqueurs de synchro effacés. Transition EXCEPTIONNELLE,
 * hors canTransition, gardée ici par les mêmes conditions (et jamais si une
 * facture Pennylane est rattachée).
 */
export async function revenirALivree(id: string) {
  return supabase.from('deliveries')
    .update({ statut: 'livree', sync_pending: false, sync_error: null, invoiced_at: null })
    .eq('id', id)
    .eq('statut', 'facturee')
    .eq('sync_pending', true)
    .is('pennylane_invoice_id', null)
    .select('id')
}

// ── Rattrapage Pennylane (resync des livraisons en attente) ───────────────────
// Une course dont l'appel Pennylane a échoué TECHNIQUEMENT reste `livree` avec
// sync_pending=true. L'Edge gère sync_pending=false au succès : le resync =
// re-invoquer. Les courses de l'ancien fonctionnement (`facturee` +
// sync_pending) sont comptées aussi, pour rester visibles, mais l'Edge les
// refuse (statut ≠ livree) : elles se réparent par « Revenir à livrée ».

export async function getPendingSyncDeliveries() {
  return supabase
    .from('deliveries')
    .select('id')
    .in('statut', ['livree', 'facturee'])
    .eq('sync_pending', true)
    .is('pennylane_invoice_id', null)
}

export async function resyncPending(): Promise<{ resynced: number; failed: number }> {
  const { data } = await supabase
    .from('deliveries')
    .select('id, statut')
    .in('statut', ['livree', 'facturee'])
    .eq('sync_pending', true)
    .is('pennylane_invoice_id', null)
  const rows = (data as { id: string; statut: string }[] | null) ?? []

  let resynced = 0
  let failed = 0
  for (const r of rows) {
    if (r.statut !== 'livree') { failed++; continue } // à réparer : « Revenir à livrée »
    const res = await facturerCourse(r.id)
    if (res.ok) resynced++
    else failed++
  }
  return { resynced, failed }
}

/** Client par id — sert à la fiche quand le client est INACTIF (absent des sélecteurs). */
export async function getClientLookup(id: string) {
  return supabase
    .from('clients')
    .select('id, name, tariff_mode, tariff_rate_cts, phone, email, payment_terms, payment_terms_label, tva_intra')
    .eq('id', id)
    .maybeSingle()
}

// ── Clients actifs (pour les sélecteurs du drawer) ────────────────────────────
export async function getActiveClients() {
  return supabase
    .from('clients')
    // `payment_terms` et `tva_intra` : le delai de paiement s'affiche des la
    // creation, et le numero de TVA conditionne l'autoliquidation.
    .select('id, name, tariff_mode, tariff_rate_cts, phone, email, payment_terms, payment_terms_label, tva_intra')
    .eq('active', true)
    .order('name')
}

// ── Véhicules actifs ──────────────────────────────────────────────────────────
export async function getActiveVehicles() {
  return supabase
    .from('vehicles')
    .select('id, label')
    .eq('status', 'active')
    .order('label')
}

// ── Chauffeurs actifs (rôle chauffeur uniquement) ─────────────────────────────
export async function getActiveDrivers() {
  return supabase
    .from('team_members')
    .select('id, full_name')
    .eq('active', true)
    .eq('role', 'chauffeur')
    .order('full_name')
}

// ── Modèles de course (pré-remplissage en création) ──────────────────────────
// Lecture locale de delivery_templates : on NE dépend PAS de features/modeles
// (étanchéité entre features). Lecture seule, version allégée pour le formulaire.
export interface DeliveryTemplateLite {
  id: string; label: string; client_id: string | null;
  description: string | null; pickup_address: string | null; delivery_address: string | null;
  amount_ht_cts: number | null; tva_rate: number | null; type: string | null;
  weight_kg: number | null; km: number | null; empty_km: number | null;
  vehicle_id: string | null; driver_id: string | null;
}

export async function listDeliveryTemplates(): Promise<{ data: DeliveryTemplateLite[] | null; error: unknown }> {
  return supabase.from('delivery_templates')
    .select('id, label, client_id, description, pickup_address, delivery_address, amount_ht_cts, tva_rate, type, weight_kg, km, empty_km, vehicle_id, driver_id')
    .order('label')
}

export interface DeliveryTemplateInsert {
  company_id: string; label: string; client_id: string | null;
  description: string | null; pickup_address: string | null; delivery_address: string | null;
  amount_ht_cts: number | null; tva_rate: number; type: string | null;
  weight_kg: number | null; km: number | null; empty_km: number | null;
  vehicle_id: string | null; driver_id: string | null;
}

export async function createDeliveryTemplate(payload: DeliveryTemplateInsert) {
  return supabase.from('delivery_templates').insert(payload).select().single()
}

// ── Preuve de livraison (POD) ─────────────────────────────────────────────────
// Reexport : l'ecriture reelle a demenage dans shared/lib/pod.queries.ts,
// parce que l'ecran chauffeur l'ecrit lui aussi et qu'il ne peut pas
// importer cette feature. Le nom `savePod` est conserve pour ne pas
// toucher aux appelants existants.
export { enregistrerPod as savePod } from '../../shared/lib/pod.queries'

// ── Lettre de voiture — récupération des numéros LV attribués sur l'année ───
// Sert à alimenter lvNumero() côté logic : la fonction reste pure, l'appelant
// ici fournit la liste des lv_numero déjà attribués sur l'année en cours.
export async function getLvNumerosForYear(year: number): Promise<{ data: string[] | null; error: unknown }> {
  const prefix = `LV-${year}-`
  const { data, error } = await supabase
    .from('deliveries')
    .select('lv_numero')
    .like('lv_numero', `${prefix}%`)
  if (error) return { data: null, error }
  const list = ((data as { lv_numero: string | null }[] | null) ?? [])
    .map(r => r.lv_numero).filter((n): n is string => !!n)
  return { data: list, error: null }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
export async function exportDeliveriesCSV(filters: DeliveryFilters = {}) {
  const { data } = await getDeliveries(filters)
  if (!data) return ''
  const headers = ['Date', 'Client', 'Véhicule', 'Chauffeur', 'HT (cts)', 'TVA (cts)', 'TTC (cts)', 'Statut', 'km']
  const rows = (data as unknown as Record<string, unknown>[]).map(d => [
    d.date,
    (d.clients as { name: string } | null)?.name ?? '',
    (d.vehicles as { label: string } | null)?.label ?? '',
    (d.team_members as { full_name: string } | null)?.full_name ?? '',
    (d.amount_ht_cts as number | null) ?? d.montant_ht_cts ?? '',
    d.tva_cts ?? '',
    (d.amount_ttc_cts as number | null) ?? d.montant_ttc_cts ?? '',
    d.statut,
    d.km ?? '',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}

// ── Derniers numéros Pennylane (badge barre d'onglets) ────────────────────────
export async function getDerniersNumeros(): Promise<{ invoice: string | null; quote: string | null }> {
  const { data, error } = await supabase.functions.invoke('pennylane-last-numbers', { body: {} })
  if (error || !data) return { invoice: null, quote: null }
  return {
    invoice: (data.last_invoice_number as string | null) ?? null,
    quote:   (data.last_quote_number   as string | null) ?? null,
  }
}
