import { supabase } from '../../app/providers'
import { facturerCourse } from '../../shared/lib/facturation.queries'
import { lireErreurEdge } from '../../shared/lib/erreurEdge'
import { canTransition, nettoyerRecherche, messageDepuisCorps } from './livraisons.logic'
import type { ComputedAmount } from './livraisons.logic'
import type {
  DeliveryFilters, DeliveryInsert, DeliveryStatus,
} from './livraisons.types'

const WITH_JOINS = `
  *,
  clients!client_id(name, tariff_mode, tariff_rate_cts, email),
  vehicles!vehicle_id(label, plate),
  team_members!driver_id(full_name)
`.trim()

/** Envoie au client la facture Pennylane par email (Edge send-client-email). */
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

// ── Facturation Pennylane : shared/lib/facturation.queries (partagée avec le devis) ──
export { facturerCourse, facturerGroupe } from '../../shared/lib/facturation.queries'
export type { ResultatFacturation } from '../../shared/lib/facturation.queries'

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

/**
 * Colonnes client lues par la fiche livraison : tarif, délai, TVA, et les
 * DÉFAUTS de ses courses (lot B : pays, retrait habituel, exécution habituelle,
 * prestation, référence obligatoire, suppléments).
 */
// Une seule chaîne littérale : supabase-js en déduit le type des lignes.
const CLIENT_FICHE_COLS = 'id, name, tariff_mode, tariff_rate_cts, phone, email, payment_terms, payment_terms_label, tva_intra, pays, retrait_adresse, retrait_contact, retrait_tel, chauffeur_habituel_id, vehicule_habituel_id, prestation_defaut, reference_obligatoire, supplements' as const

const CLIENT_BASE_COLS = 'id, name, tariff_mode, tariff_rate_cts, phone, email, payment_terms, payment_terms_label, tva_intra' as const

/** Client par id — sert à la fiche quand le client est INACTIF (absent des sélecteurs). */
export async function getClientLookup(id: string) {
  const complet = await supabase
    .from('clients')
    .select(CLIENT_FICHE_COLS)
    .eq('id', id)
    .maybeSingle()
  if (complet.error?.code === '42703') {
    return supabase.from('clients').select(CLIENT_BASE_COLS).eq('id', id).maybeSingle()
  }
  return complet
}

// ── Clients actifs (pour les sélecteurs du drawer) ────────────────────────────
export async function getActiveClients() {
  const complet = await supabase
    .from('clients')
    // `payment_terms` et `tva_intra` : le delai de paiement s'affiche des la
    // creation, et le numero de TVA conditionne l'autoliquidation.
    .select(CLIENT_FICHE_COLS)
    .eq('active', true)
    .order('name')
  // Base en retard sur le front (migration pas encore appliquée, preview) :
  // une colonne manquante (42703) vidait la liste SANS message. On relit les
  // colonnes de base : la liste reste là, seuls les défauts manquent.
  if (complet.error?.code === '42703') {
    console.warn('getActiveClients : colonnes absentes en base, lecture minimale', complet.error.message)
    return supabase
      .from('clients')
      .select(CLIENT_BASE_COLS)
      .eq('active', true)
      .order('name')
  }
  return complet
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

// ── Preuve de livraison (POD) ─────────────────────────────────────────────────
// Reexport : l'ecriture reelle a demenage dans shared/lib/pod.queries.ts,
// parce que l'ecran chauffeur l'ecrit lui aussi et qu'il ne peut pas
// importer cette feature. Le nom `savePod` est conserve pour ne pas
// toucher aux appelants existants.
export { enregistrerPod as savePod } from '../../shared/lib/pod.queries'

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
