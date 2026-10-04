import { supabase } from '../../app/providers'
import type { Tour, TourDelivery, TourStatus } from './tournees.types'
import type { Assignment, DispatchData } from './tournees.types'
import type { LigneHeuresTournee } from './tournees.logic'
import { majTourneeApresRetrait } from './tournees.logic'

// ── Société / dépôt ───────────────────────────────────────────────────────────
// (feature étanche : on ne ré-importe pas les queries d'autres features)

export async function getCompanyDepot(companyId: string) {
  return supabase
    .from('companies')
    .select('id, name, depot_lat, depot_lng')
    .eq('id', companyId)
    .single()
}

// ── Référentiels ──────────────────────────────────────────────────────────────

export async function getActiveVehicles() {
  return supabase
    .from('vehicles')
    // Échéances lues pour le contrôle des documents à l'affectation (T2).
    .select('id, label, ct_expiry, insurance_expiry')
    .eq('status', 'active')
    .order('label')
}

export async function getActiveDrivers() {
  return supabase
    .from('team_members')
    .select('id, full_name, licence_b_expiry, medical_visit_expiry')
    .eq('active', true)
    .eq('role', 'chauffeur')
    .order('full_name')
}

// ── Livraisons d'une journée (statuts éligibles) ──────────────────────────────

const DELIVERY_COLS =
  'id, date, statut, description, weight_kg, pickup_address, retrait_a_faire, delivery_address, delivery_lat, delivery_lng, tour_id, stop_order, arrival_time, delivered_at, driver_id, vehicle_id, clients!client_id(name)'

export async function getDeliveriesForDate(companyId: string, date: string) {
  return supabase
    .from('deliveries')
    .select(DELIVERY_COLS)
    .eq('company_id', companyId)
    .eq('date', date)
    .in('statut', ['planifiee', 'en_cours', 'livree'])
    // Relevés de messagerie et forfaits : rien à faire sur la route.
    .or('prestation.is.null,prestation.not.in.(messagerie,forfait)')
    .order('stop_order', { ascending: true, nullsFirst: false })
}

// ── Tournées ──────────────────────────────────────────────────────────────────

/** Cherche la tournée d'un (véhicule, date). null si absente. */
export async function findTour(companyId: string, date: string, vehicleId: string) {
  return supabase
    .from('tours')
    .select('*')
    .eq('company_id', companyId)
    .eq('date', date)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
}

export async function getTour(tourId: string) {
  return supabase.from('tours').select('*').eq('id', tourId).single()
}

export async function createTour(data: {
  company_id: string
  date: string
  vehicle_id: string
  driver_id: string | null
  status: TourStatus
  depot_lat: number | null
  depot_lng: number | null
}) {
  return supabase.from('tours').insert(data).select().single()
}

export async function updateTour(id: string, data: Partial<Tour>) {
  return supabase.from('tours').update(data).eq('id', id).select().single()
}

// ── Assignation des livraisons à une tournée ──────────────────────────────────

/**
 * Assigne une liste de livraisons à une tournée. No-op si liste vide.
 * `date` (celle de la tournée) est écrite aussi : une course en retard mise dans
 * la tournée du jour est REPLANIFIÉE à ce jour (sans effet pour celles du jour).
 */
export async function assignDeliveries(
  ids: string[], tourId: string, date: string,
  affectation: { vehicleId: string; driverId: string | null },
) {
  if (ids.length === 0) return { error: null }
  // Chauffeur et véhicule écrits sur la course, comme l'optimiseur : c'est
  // `deliveries.driver_id` qui fait apparaître la course dans « Mes courses ».
  return supabase
    .from('deliveries')
    .update({ tour_id: tourId, date, vehicle_id: affectation.vehicleId, driver_id: affectation.driverId })
    .in('id', ids)
}

/**
 * Replanifie à `date` les courses en retard que l'optimiseur (Edge optimize-tours,
 * qui n'écrit pas `date`) a effectivement rattachées à une tournée. Celles restées
 * hors tournée (non réparties) gardent leur date d'origine.
 */
export async function replanifierRetardsAffectes(ids: string[], date: string) {
  if (ids.length === 0) return { error: null }
  return supabase
    .from('deliveries')
    .update({ date })
    .in('id', ids)
    .not('tour_id', 'is', null)
}

/**
 * Retire UNE course de sa tournée (lot T2) : elle revient dans le pool. Les
 * chiffres de la tournée (km, durée, tracé) sont effacés : ils ne valent plus.
 * Le chauffeur reste posé sur la course (elle lui reste attribuée).
 */
export async function retirerDeTournee(deliveryId: string, tour: Pick<Tour, 'id' | 'status'>) {
  const { error } = await unassignDeliveries([deliveryId])
  if (error) return { error }
  const { error: majErr } = await supabase.from('tours').update(majTourneeApresRetrait(tour.status)).eq('id', tour.id)
  return { error: majErr }
}

/** Supprime une tournée non démarrée : ses courses reviennent dans le pool d'abord. */
export async function supprimerTournee(tourId: string) {
  const { error } = await supabase
    .from('deliveries')
    .update({ tour_id: null, stop_order: null, arrival_time: null })
    .eq('tour_id', tourId)
  if (error) return { error }
  return supabase.from('tours').delete().eq('id', tourId)
}

/** Détache des livraisons (tour_id, stop_order, arrival_time remis à null). No-op si vide. */
export async function unassignDeliveries(ids: string[]) {
  if (ids.length === 0) return { error: null }
  return supabase
    .from('deliveries')
    .update({ tour_id: null, stop_order: null, arrival_time: null })
    .in('id', ids)
}

// ── Suivi : marquer un arrêt livré ────────────────────────────────────────────
// La garde de transition (canTransition) est vérifiée côté appelant via
// livraisons.logic.ts (machine d'états unique, pas de duplication).

export async function markDelivered(deliveryId: string, when: string) {
  return supabase
    .from('deliveries')
    // Lève l'échec éventuel (relivraison réussie), comme Mes courses.
    .update({ statut: 'livree', delivered_at: when, probleme_le: null })
    .eq('id', deliveryId)
}

// ── Cycle de vie de la tournée ────────────────────────────────────────────────

export async function setTourStatus(tourId: string, status: TourStatus) {
  return supabase.from('tours').update({ status }).eq('id', tourId).select().single()
}

// ── Multi-véhicule (dispatch + optimisation) ──────────────────────────────────

/** Tente de lire le corps JSON d'une erreur HTTP de Function (ex. 409 / 422).
 *  Priorité : data.message (payload structuré) → message (top-level) → error.
 *  Retourne null si le corps est illisible ou vide, laissant l'appelant retomber
 *  sur error.message ("Edge Function returned a non-2xx status code", générique). */
async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).json()
      return body?.data?.message ?? body?.message ?? body?.error ?? null
    } catch {
      // corps illisible : on retombera sur error.message
    }
  }
  return null
}

/**
 * Dispatch multi-véhicule : invoque optimize-tours.
 * Retourne `data` si ok. Sinon throw Error(message) — remonte data.message
 * (notamment sur 409 : une tournée de ces véhicules est déjà en_cours/terminee).
 */
export async function dispatchAndOptimize(
  date: string,
  assignments: Assignment[],
  deliveryIds: string[],
): Promise<DispatchData> {
  const { data, error } = await supabase.functions.invoke('optimize-tours', {
    body: { date, assignments, delivery_ids: deliveryIds },
  })

  if (error) {
    const msg = await readFunctionErrorMessage(error)
    throw new Error(msg ?? error.message)
  }

  const res = data as { ok?: boolean; data?: DispatchData & { message?: string }; error?: string; message?: string }
  if (!res?.ok) {
    throw new Error(res?.data?.message ?? res?.message ?? res?.error ?? 'Optimisation multi-véhicule échouée')
  }
  return res.data as DispatchData
}

/** Toutes les tournées d'une date (ordre stable par création). */
export async function fetchToursByDate(companyId: string, date: string) {
  return supabase
    .from('tours')
    .select('*')
    .eq('company_id', companyId)
    .eq('date', date)
    .order('created_at', { ascending: true })
}

/** Pool sélectionnable : livraisons 'planifiee' de la date (même projection que TourDelivery). */
export async function fetchPlannableDeliveries(companyId: string, date: string) {
  return supabase
    .from('deliveries')
    .select(DELIVERY_COLS)
    .eq('company_id', companyId)
    .eq('date', date)
    .eq('statut', 'planifiee')
    // Relevés de messagerie et forfaits : rien à faire sur la route.
    .or('prestation.is.null,prestation.not.in.(messagerie,forfait)')
    .order('created_at', { ascending: true })
}

/**
 * Courses en RETARD : `planifiee` / `en_cours` datées avant `aujourdHui`, même
 * filtre « sur la route ». La jointure `tours` sert à écarter celles d'une
 * tournée terminée (filtrage dans `coursesEnRetard`, logic). Plafonné aux 100
 * plus récentes : des résidus très anciens ne doivent pas noyer le pool.
 */
export async function fetchLateDeliveries(companyId: string, aujourdHui: string) {
  return supabase
    .from('deliveries')
    .select(`${DELIVERY_COLS}, tours!tour_id(status)`)
    .eq('company_id', companyId)
    .lt('date', aujourdHui)
    .in('statut', ['planifiee', 'en_cours'])
    .or('prestation.is.null,prestation.not.in.(messagerie,forfait)')
    .order('date', { ascending: false })
    .limit(100)
}

// ── Heures du chauffeur (table work_hours, onglet Heures) ─────────────────────
// Requêtes écrites ici (features étanches : pas d'import de features/heures).

/** Lignes d'heures existantes d'un chauffeur à une date (détection de doublon). */
export async function getHeuresChauffeurJour(companyId: string, memberId: string, date: string) {
  return supabase
    .from('work_hours')
    .select('id, member_id, date')
    .eq('company_id', companyId)
    .eq('member_id', memberId)
    .eq('date', date)
}

export async function creerHeuresTournee(ligne: LigneHeuresTournee) {
  return supabase.from('work_hours').insert(ligne).select('id').single()
}

export type { TourDelivery }

/** Coche ou décoche l'arrêt de retrait d'une course. */
export async function setRetraitAFaire(deliveryId: string, valeur: boolean) {
  return supabase
    .from('deliveries')
    .update({ retrait_a_faire: valeur })
    .eq('id', deliveryId)
}

/**
 * Enregistre l'ordre manuel des arrêts d'une tournée.
 *
 * `stop_order` part de 1 et suit l'ordre du tableau reçu. Les écritures
 * partent en parallèle : sur une tournée de vingt arrêts, les faire en série
 * ferait attendre le chauffeur sans raison — aucune ne dépend d'une autre.
 *
 * Ce que l'appelant doit savoir : cet ordre est celui que l'humain impose. Une
 * ré-optimisation l'écrasera, puisqu'elle recalcule `stop_order`. C'est
 * volontaire — sinon « optimiser » ne voudrait plus rien dire — et l'écran le
 * dit avant de lancer une optimisation.
 */
export async function enregistrerOrdreArrets(idsDansLOrdre: string[]) {
  const resultats = await Promise.all(
    idsDansLOrdre.map((id, i) =>
      supabase.from('deliveries').update({ stop_order: i + 1 }).eq('id', id),
    ),
  )
  const echec = resultats.find(r => r.error)
  return { error: echec?.error ?? null }
}

/**
 * Compose une tournée SANS optimisation, dans l'ordre imposé à la main.
 *
 * Pourquoi ce chemin existe : l'optimiseur calcule le trajet le plus court,
 * mais il ne sait rien de ce qu'il faut charger en premier, d'un client qui
 * n'ouvre qu'à 14 h, ou d'une palette qui doit rester accessible. Quand ces
 * contraintes commandent, l'ordre humain doit gagner — et il ne peut pas
 * gagner en passant par « Répartir & optimiser », qui recalcule `stop_order`
 * et effacerait l'ordre choisi à la seconde même où il est posé.
 *
 * Ce qu'on N'ÉCRIT PAS, et c'est délibéré : la tournée reste `brouillon`, et
 * distance, durée et tracé sont remis à `null`. Les laisser à leur ancienne
 * valeur afficherait des kilomètres calculés pour un ORDRE QUI N'EXISTE PLUS —
 * un chiffre faux est pire qu'un tiret. `canStartTour` accepte justement un
 * brouillon qui a des arrêts, pour que la tournée reste démarrable.
 *
 * Refuse une tournée déjà en cours ou terminée : la recomposer sous les pieds
 * du chauffeur qui roule est exactement ce que l'Edge Function interdit déjà
 * de son côté (409).
 */
export async function repartirDansMonOrdre(params: {
  companyId: string
  date: string
  vehicleId: string
  driverId: string | null
  depotLat: number | null
  depotLng: number | null
  idsDansLOrdre: string[]
}): Promise<{ error: { message: string } | null }> {
  const { companyId, date, vehicleId, driverId, depotLat, depotLng, idsDansLOrdre } = params
  if (idsDansLOrdre.length === 0) return { error: { message: 'Aucune livraison sélectionnée' } }

  const { data: existante, error: findErr } = await findTour(companyId, date, vehicleId)
  if (findErr) return { error: findErr }

  let tourId = existante?.id as string | undefined
  if (existante && (existante.status === 'en_cours' || existante.status === 'terminee')) {
    return {
      error: {
        message: `La tournée de ce véhicule est déjà ${existante.status === 'en_cours' ? 'en cours' : 'terminée'} — elle ne peut plus être recomposée.`,
      },
    }
  }

  if (!tourId) {
    const { data: creee, error: createErr } = await createTour({
      company_id: companyId,
      date,
      vehicle_id: vehicleId,
      driver_id: driverId,
      status: 'brouillon',
      depot_lat: depotLat,
      depot_lng: depotLng,
    })
    if (createErr) return { error: createErr }
    tourId = creee.id as string
  }

  const { error: assignErr } = await assignDeliveries(idsDansLOrdre, tourId, date, { vehicleId, driverId })
  if (assignErr) return { error: assignErr }

  const { error: ordreErr } = await enregistrerOrdreArrets(idsDansLOrdre)
  if (ordreErr) return { error: ordreErr }

  const { error: majErr } = await updateTour(tourId, {
    driver_id: driverId,
    status: 'brouillon',
    total_km: null,
    total_duration_min: null,
    geometry: null,
    optimized_at: null,
  })
  return { error: majErr }
}
