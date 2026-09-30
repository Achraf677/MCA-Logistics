import { supabase } from '../../app/providers'
import { canTransition, nettoyerRecherche, messageDepuisCorps } from './livraisons.logic'
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

// Liste : mêmes jointures + le délai de paiement du client (retard d'encaissement).
const LISTE_JOINS = `
  *,
  clients!client_id(name, tariff_mode, tariff_rate_cts, email, payment_terms),
  vehicles!vehicle_id(label, plate),
  team_members!driver_id(full_name)
`.trim()

/**
 * Livraisons filtrées. Tout est fait CÔTÉ BASE (pas de filtrage en mémoire sur
 * tout l'historique) :
 * - `q` : recherche insensible à la casse dans la description, les deux
 *   adresses, le n° de facture et le NOM DU CLIENT. Le nom étant dans une autre
 *   table, on cherche d'abord les clients correspondants (1 petite requête),
 *   puis on les ajoute au `or(…)` par `client_id.in.(…)`.
 * - `echecs` : courses ouvertes (planifiée / en cours) avec un problème signalé
 *   par le chauffeur, quelle que soit la date.
 */
export async function getDeliveries(filters: DeliveryFilters = {}) {
  let q = supabase
    .from('deliveries')
    .select(LISTE_JOINS)
    .order('date', { ascending: false })
    .order('arrival_time', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') q = q.eq('statut', filters.status)
  if (filters.client_id)  q = q.eq('client_id', filters.client_id)
  if (filters.vehicle_id) q = q.eq('vehicle_id', filters.vehicle_id)
  if (filters.driver_id)  q = q.eq('driver_id', filters.driver_id)
  if (filters.date_from)  q = q.gte('date', filters.date_from)
  if (filters.date_to)    q = q.lte('date', filters.date_to)
  if (filters.echecs)     q = q.not('probleme_le', 'is', null).in('statut', ['planifiee', 'en_cours'])

  const texte = nettoyerRecherche(filters.q)
  if (texte) {
    const motif = `*${texte}*`
    const { data: clients } = await supabase.from('clients').select('id').ilike('name', `%${texte}%`).limit(200)
    const ids = ((clients as { id: string }[] | null) ?? []).map(c => c.id)
    const conditions = [
      `description.ilike.${motif}`,
      `pickup_address.ilike.${motif}`,
      `delivery_address.ilike.${motif}`,
      `pennylane_invoice_number.ilike.${motif}`,
      ...(ids.length ? [`client_id.in.(${ids.join(',')})`] : []),
    ]
    q = q.or(conditions.join(','))
  }

  return q
}

/** Nombre de courses ouvertes avec un échec terrain signalé (pastille du filtre « Échecs »). */
export async function compterEchecs() {
  return supabase
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .not('probleme_le', 'is', null)
    .in('statut', ['planifiee', 'en_cours'])
}

/** Listes des filtres Client / Chauffeur : tous les clients (même inactifs,
 *  l'historique en contient), les chauffeurs actifs d'abord. */
export async function getListesFiltres() {
  const [clients, chauffeurs] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name, active').eq('role', 'chauffeur')
      .order('active', { ascending: false }).order('full_name'),
  ])
  return {
    clients: (clients.data as { id: string; name: string }[] | null) ?? [],
    chauffeurs: (chauffeurs.data as { id: string; full_name: string }[] | null) ?? [],
  }
}

/** Facturation groupée (N livraisons livrées d'un même client → 1 facture Pennylane). */
export async function facturerGroupe(ids: string[]) {
  return supabase.functions.invoke('pennylane-invoice', { body: { delivery_ids: ids } })
}

/**
 * Message PRÉCIS d'un échec d'Edge Function. Sur une réponse non-2xx,
 * supabase-js ne donne que « Edge Function returned a non-2xx status code » :
 * le vrai motif (`{ error: "…" }`) est dans `error.context` (la Response).
 * Local à la feature (un helper partagé pourra le remplacer).
 */
export async function messageErreurEdge(error: unknown, data?: unknown, repli = 'Erreur inattendue.'): Promise<string> {
  const d = data as { error?: unknown } | null | undefined
  if (d && typeof d.error === 'string' && d.error.trim()) return d.error
  const ctx = (error as { context?: unknown } | null)?.context as Response | undefined
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const m = messageDepuisCorps(await ctx.clone().text())
      if (m) return m
    } catch { /* corps déjà lu ou illisible : repli ci-dessous */ }
  }
  const msg = (error as Error | null)?.message
  return msg?.trim() || repli
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
 * - Bloque livree→facturee si montant absent.
 * - Pose invoiced_at (→facturee) ou paid_at (→payee).
 * - À →facturee : tente Edge Function `pennylane-invoice`, sinon sync_pending=true.
 * - À →payee : tente Edge Function `pennylane-register-payment` en best-effort
 *   (encaissement hors rapprochement bancaire, ex. Cocolis). Aucun blocage si KO.
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

  if (to === 'facturee' && (!amount || amount.amount_ht_cts <= 0)) {
    return { data: null, error: new Error('Montant requis avant de facturer') }
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { statut: to }

  if (to === 'facturee' && amount) {
    updates.invoiced_at    = now
    updates.amount_ht_cts  = amount.amount_ht_cts
    updates.tva_cts        = amount.tva_cts
    updates.amount_ttc_cts = amount.amount_ttc_cts
    // montant_ttc_cts est GENERATED ALWAYS — ne jamais l'écrire.
    // montant_ht_cts a DEFAULT 0 depuis la migration — ne pas l'écrire non plus.
  }

  if (to === 'payee') {
    updates.paid_at = now
  }

  const { data, error } = await supabase
    .from('deliveries')
    .update(updates)
    .eq('id', id)
    .select(WITH_JOINS)
    .single()

  if (error) return { data: null, error: new Error(error.message) }

  // Push Pennylane à →facturee (crée la facture) ou →payee (enregistre le paiement).
  if (to === 'facturee') {
    const pushed = await tryPushPennylane(id)
    if (!pushed) {
      // Edge Function absente ou KO → sync_queue (rattrapée par resyncPending).
      await supabase.from('deliveries').update({ sync_pending: true }).eq('id', id)
    }
  } else if (to === 'payee') {
    // Best-effort : le paiement est déjà effectif côté MCA, on informe Pennylane.
    // Un échec ne remonte pas comme erreur (pas de sync_pending détourné : cette
    // colonne est dédiée à la facturation, `resyncPending` ne réagit qu'à ça).
    await tryPushPaymentPennylane(id)
  }

  return { data, error: null }
}

async function tryPushPennylane(deliveryId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('pennylane-invoice', {
      body: { delivery_id: deliveryId },
    })
    return !error
  } catch {
    return false
  }
}

async function tryPushPaymentPennylane(deliveryId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('pennylane-register-payment', {
      body: { delivery_id: deliveryId },
    })
    return !error
  } catch {
    return false
  }
}

// ── Rattrapage Pennylane (resync des livraisons bloquées) ─────────────────────
// Une livraison passée `facturee` dont l'appel Pennylane a échoué reste
// sync_pending=true sans pennylane_invoice_id. pennylane-invoice étant idempotent
// et gérant lui-même sync_pending=false au succès, le resync = re-invoquer.

export async function getPendingSyncDeliveries() {
  return supabase
    .from('deliveries')
    .select('id')
    .eq('statut', 'facturee')
    .eq('sync_pending', true)
    .is('pennylane_invoice_id', null)
}

export async function resyncPending(): Promise<{ resynced: number; failed: number }> {
  const { data } = await getPendingSyncDeliveries()
  const ids = (data as { id: string }[] | null)?.map(d => d.id) ?? []

  let resynced = 0
  let failed = 0
  for (const id of ids) {
    try {
      const { error } = await supabase.functions.invoke('pennylane-invoice', {
        body: { delivery_id: id },
      })
      if (error) failed++
      else resynced++
    } catch {
      failed++
    }
  }
  return { resynced, failed }
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
