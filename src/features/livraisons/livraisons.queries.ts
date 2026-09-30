import { supabase } from '../../app/providers'
import { lireErreurEdge } from '../../shared/lib/erreurEdge'
import type { NatureEchec } from '../../shared/lib/erreurEdge'
import { canTransition, nettoyerRecherche, messageDepuisCorps } from './livraisons.logic'
import { parseLvPdfRef, lvNumero } from './lettreVoiture.logic'
import { getDocument, getDownloadUrl } from '../../shared/lib/documents.queries'
import type { ComputedAmount } from './livraisons.logic'
import type {
  DeliveryFilters, DeliveryInsert, DeliveryStatus, LvSignatures, LvSignatureData,
} from './livraisons.types'

const WITH_JOINS = `
  *,
  clients!client_id(name, tariff_mode, tariff_rate_cts, email),
  vehicles!vehicle_id(label, plate),
  team_members!driver_id(full_name)
`.trim()

/** Envoie au client la facture Pennylane + la lettre de voiture par email (Edge send-client-email). */
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

/** Livraisons ayant une lettre de voiture (lv_numero attribué) — alimente l'onglet
 *  "Lettres de voiture" (clé `bl`). Aucune nouvelle table/colonne : filtre sur deliveries. */
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

/**
 * Attribue un n° LV à la livraison si elle n'en a pas encore, sans jamais en
 * écraser un existant (update conditionné à `lv_numero is null`).
 *
 * Unicité : index unique partiel `deliveries(company_id, lv_numero)`
 * (migration 20260930120000). Si deux générations simultanées tombent sur le
 * même « max + 1 », la seconde reçoit 23505 : on relit la liste, on recalcule
 * et on réessaie UNE fois. Si la livraison a reçu un numéro entre-temps (autre
 * onglet), on renvoie celui-là.
 */
export async function attribuerNumeroLv(
  id: string,
  year: number,
): Promise<{ data: string | null; error: Error | null }> {
  for (let essai = 0; essai < 2; essai++) {
    const { data: existants, error: lErr } = await getLvNumerosForYear(year)
    if (lErr) return { data: null, error: new Error((lErr as { message?: string }).message ?? 'Lecture des numéros LV échouée') }
    const candidat = lvNumero(existants ?? [], year)
    const { data, error } = await supabase
      .from('deliveries')
      .update({ lv_numero: candidat })
      .eq('id', id)
      .is('lv_numero', null)
      .select('lv_numero')
      .maybeSingle()
    if (error) {
      if (error.code === '23505' && essai === 0) continue // collision : on recalcule
      return { data: null, error: new Error(error.message) }
    }
    if (data?.lv_numero) return { data: data.lv_numero as string, error: null }
    // Aucune ligne modifiée : la livraison a déjà un numéro → on le reprend.
    const { data: ligne, error: rErr } = await supabase
      .from('deliveries').select('lv_numero').eq('id', id).single()
    if (rErr) return { data: null, error: new Error(rErr.message) }
    if (ligne?.lv_numero) return { data: ligne.lv_numero as string, error: null }
    return { data: null, error: new Error('Attribution du numéro LV impossible') }
  }
  return { data: null, error: new Error('Numéro LV déjà pris deux fois de suite — réessaie.') }
}

// ── Lettre de voiture — signatures (relire puis fusionner) ───────────────────
// `lv_signatures` est un jsonb à 3 clés, écrit AUSSI par l'écran chauffeur
// (Mes courses). Un update direct depuis l'état chargé à l'ouverture du tiroir
// effacerait une signature prise entre-temps sur le téléphone : on relit la
// valeur en base, on ne touche qu'au rôle concerné, puis on écrit.
// (Même principe que `ajouterSignature` de Mes courses — recodé ici, les
// features ne s'importent pas entre elles.)

/** Signatures actuellement en base pour une livraison. */
export async function lireSignaturesLv(id: string): Promise<{ data: LvSignatures | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('deliveries').select('lv_signatures').eq('id', id).single()
  if (error) return { data: null, error: new Error(error.message) }
  return { data: ((data?.lv_signatures ?? {}) as LvSignatures), error: null }
}

/**
 * Pose (`entry`) ou retire (`null`) la signature d'UN rôle, sans toucher aux
 * autres. Renvoie l'objet complet tel qu'écrit, pour resynchroniser l'écran.
 */
export async function ecrireSignatureLv(
  id: string,
  role: keyof LvSignatures,
  entry: LvSignatureData | null,
): Promise<{ data: LvSignatures | null; error: Error | null }> {
  const { data: actuelles, error: lErr } = await lireSignaturesLv(id)
  if (lErr || !actuelles) return { data: null, error: lErr ?? new Error('Lecture des signatures échouée') }
  const next: LvSignatures = { ...actuelles }
  if (entry) next[role] = entry
  else delete next[role]
  const { error } = await supabase
    .from('deliveries').update({ lv_signatures: next }).eq('id', id)
  if (error) return { data: null, error: new Error(error.message) }
  return { data: next, error: null }
}

// ── Lettre de voiture — ouverture du PDF archivé ────────────────────────────
/**
 * Lien d'ouverture du PDF à partir de `deliveries.lv_pdf_url` :
 *   - `doc:<id>` → URL signée (1 h) du document dans Storage ;
 *   - `https://…` (anciens liens Drive) → renvoyé tel quel ;
 *   - sinon null.
 */
export async function lienPdfLv(ref: string | null | undefined): Promise<string | null> {
  const parsed = parseLvPdfRef(ref)
  if (!parsed) return null
  if (parsed.kind === 'url') return parsed.url
  const { data: doc } = await getDocument(parsed.documentId)
  if (!doc) return null
  return getDownloadUrl(doc)
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
