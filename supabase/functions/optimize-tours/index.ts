// Edge Function `optimize-tours` — répartition MULTI-véhicule (Tournée V3).
// Entrée : { date: 'YYYY-MM-DD', assignments: [{ vehicle_id, driver_id? }], delivery_ids: string[] }
// Équilibrage : amount:[1] par livraison + capacity:[ceil(N/V)] par véhicule → force l'usage équilibré.
// IDEMPOTENT : avant réaffectation, détache TOUTES les livraisons des tournées concernées (date+véhicules),
// pas seulement le pool reçu — évite les résidus d'un essai précédent. Supprime les tournées devenues vides.
// Garde-fou : refuse (409) si une tournée de ces véhicules à cette date est déjà en_cours/terminee.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { optimize } from '../_shared/ors.ts';
const DEPART_DEFAULT = '08:00:00';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function secondsToTime(base, addSeconds) {
  const [h, m, s] = base.split(':').map(Number);
  const total = h * 3600 + m * 60 + (s || 0) + addSeconds;
  const hh = Math.floor(total / 3600) % 24;
  const mm = Math.floor(total % 3600 / 60);
  const ss = Math.floor(total % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return optionsResponse();
  const apiKey = Deno.env.get('ORS_API_KEY');
  if (!apiKey) return jsonResponse({
    ok: false,
    error: 'missing ORS_API_KEY'
  }, 500);
  let body;
  try {
    body = await req.json();
  } catch  {
    return jsonResponse({
      ok: false,
      error: 'invalid JSON body'
    }, 400);
  }
  const date = typeof body.date === 'string' && DATE_RE.test(body.date) ? body.date : '';
  if (!date) return jsonResponse({
    ok: false,
    error: 'date (YYYY-MM-DD) required'
  }, 400);
  const rawAssign = Array.isArray(body.assignments) ? body.assignments : [];
  const seen = new Set();
  const assignments = [];
  for (const a of rawAssign){
    if (!a || typeof a !== 'object') continue;
    const vid = a.vehicle_id;
    const did = a.driver_id;
    if (typeof vid !== 'string' || !vid || seen.has(vid)) continue;
    seen.add(vid);
    assignments.push({
      vehicle_id: vid,
      driver_id: typeof did === 'string' && did ? did : null
    });
  }
  if (assignments.length === 0) return jsonResponse({
    ok: false,
    error: 'at least one assignment (vehicle_id) required'
  }, 400);
  const deliveryIds = Array.isArray(body.delivery_ids) ? [
    ...new Set(body.delivery_ids.filter((x)=>typeof x === 'string' && !!x))
  ] : [];
  if (deliveryIds.length === 0) return jsonResponse({
    ok: false,
    error: 'delivery_ids required'
  }, 400);
  const supabase = getServiceClient();
  // ── Livraisons du pool, géocodées ──
  const { data: deliveries, error: dErr } = await supabase.from('deliveries').select('id, company_id, delivery_lat, delivery_lng').in('id', deliveryIds);
  if (dErr) return jsonResponse({
    ok: false,
    error: dErr.message
  }, 500);
  const geocoded = (deliveries ?? []).filter((d)=>d.delivery_lat != null && d.delivery_lng != null);
  if (geocoded.length === 0) return jsonResponse({
    ok: false,
    error: 'no geocoded deliveries in pool'
  }, 422);
  const companyId = geocoded[0].company_id;
  const vehicleIds = assignments.map((a)=>a.vehicle_id);
  // ── Tournées existantes de ces véhicules à cette date (tous statuts) ──
  const { data: existingTours, error: eErr } = await supabase.from('tours').select('id, vehicle_id, status').eq('company_id', companyId).eq('date', date).in('vehicle_id', vehicleIds);
  if (eErr) return jsonResponse({
    ok: false,
    error: eErr.message
  }, 500);
  const locked = (existingTours ?? []).filter((t)=>t.status === 'en_cours' || t.status === 'terminee');
  if (locked.length > 0) {
    return jsonResponse({
      ok: false,
      error: 'locked',
      message: 'Une tournée de ces véhicules à cette date est déjà démarrée ou terminée — ré-optimisation impossible.',
      locked
    }, 409);
  }
  const existingTourIds = (existingTours ?? []).map((t)=>t.id);
  const vehToExistingTour = new Map();
  for (const t of existingTours ?? [])vehToExistingTour.set(t.vehicle_id, t.id);
  // ── Dépôt société ──
  const { data: company } = await supabase.from('companies').select('depot_lat, depot_lng').eq('id', companyId).single();
  const depotLat = company?.depot_lat ?? null;
  const depotLng = company?.depot_lng ?? null;
  if (depotLat == null || depotLng == null) {
    return jsonResponse({
      ok: false,
      error: 'depot not geocoded (companies.depot_lat/lng)'
    }, 422);
  }
  // ── jobs (amount:[1]) + vehicles (capacity:[plafond]) ──
  const jobIdToDelivery = new Map();
  const jobs = geocoded.map((d, i)=>{
    const jid = i + 1;
    jobIdToDelivery.set(jid, d.id);
    return {
      id: jid,
      location: [
        d.delivery_lng,
        d.delivery_lat
      ],
      amount: [
        1
      ]
    };
  });
  const cap = Math.max(1, Math.ceil(geocoded.length / assignments.length));
  const vroomVehToAssign = new Map();
  const vehicles = assignments.map((a, i)=>{
    const vid = i + 1;
    vroomVehToAssign.set(vid, a);
    return {
      id: vid,
      profile: 'driving-car',
      start: [
        depotLng,
        depotLat
      ],
      end: [
        depotLng,
        depotLat
      ],
      capacity: [
        cap
      ]
    };
  });
  try {
    const result = await optimize(apiKey, jobs, vehicles);
    const routes = result.routes ?? [];
    if (routes.length === 0) return jsonResponse({
      ok: false,
      error: 'no route returned by ORS'
    }, 502);
    // ── Repartir VRAIMENT propre : détacher (a) toutes les livraisons des tournées concernées, (b) le pool ──
    if (existingTourIds.length > 0) {
      const { error } = await supabase.from('deliveries').update({
        tour_id: null,
        stop_order: null,
        arrival_time: null
      }).in('tour_id', existingTourIds);
      if (error) return jsonResponse({
        ok: false,
        error: `detach tours: ${error.message}`
      }, 500);
    }
    {
      const { error } = await supabase.from('deliveries').update({
        tour_id: null,
        stop_order: null,
        arrival_time: null
      }).in('id', deliveryIds);
      if (error) return jsonResponse({
        ok: false,
        error: `detach pool: ${error.message}`
      }, 500);
    }
    const summary = [];
    const usedTourIds = new Set();
    for (const route of routes){
      const assign = vroomVehToAssign.get(route.vehicle);
      if (!assign) continue;
      const totalKm = Math.round(route.distance / 1000 * 10) / 10;
      const totalMin = Math.round(route.duration / 60);
      const tourPayload = {
        company_id: companyId,
        date,
        vehicle_id: assign.vehicle_id,
        driver_id: assign.driver_id,
        depot_lat: depotLat,
        depot_lng: depotLng,
        total_km: totalKm,
        total_duration_min: totalMin,
        geometry: route.geometry ?? null,
        status: 'optimisee',
        optimized_at: new Date().toISOString()
      };
      let tourId = vehToExistingTour.get(assign.vehicle_id) ?? '';
      if (tourId) {
        const { error } = await supabase.from('tours').update(tourPayload).eq('id', tourId);
        if (error) return jsonResponse({
          ok: false,
          error: `update tour: ${error.message}`
        }, 500);
      } else {
        const { data: created, error } = await supabase.from('tours').insert(tourPayload).select('id').single();
        if (error || !created) return jsonResponse({
          ok: false,
          error: `insert tour: ${error?.message}`
        }, 500);
        tourId = created.id;
      }
      usedTourIds.add(tourId);
      let order = 0;
      let stops = 0;
      for (const step of route.steps){
        if (step.type === 'job' && step.id != null) {
          order += 1;
          const did = jobIdToDelivery.get(step.id);
          if (!did) continue;
          const arrival = typeof step.arrival === 'number' ? secondsToTime(DEPART_DEFAULT, step.arrival) : null;
          const { error } = await supabase.from('deliveries').update({
            tour_id: tourId,
            vehicle_id: assign.vehicle_id,
            driver_id: assign.driver_id,
            stop_order: order,
            arrival_time: arrival
          }).eq('id', did);
          if (error) return jsonResponse({
            ok: false,
            error: `update delivery: ${error.message}`
          }, 500);
          stops += 1;
        }
      }
      summary.push({
        tour_id: tourId,
        vehicle_id: assign.vehicle_id,
        stops,
        total_km: totalKm,
        total_duration_min: totalMin
      });
    }
    // ── Nettoyage : supprimer les tournées concernées non utilisées (devenues vides) ──
    const orphanIds = existingTourIds.filter((id)=>!usedTourIds.has(id));
    if (orphanIds.length > 0) {
      const { error } = await supabase.from('tours').delete().in('id', orphanIds);
      if (error) return jsonResponse({
        ok: false,
        error: `delete orphan tours: ${error.message}`
      }, 500);
    }
    const unassigned = (result.unassigned ?? []).length;
    return jsonResponse({
      ok: true,
      data: {
        date,
        vehicles_used: summary.length,
        cap_per_vehicle: cap,
        tours: summary,
        unassigned
      }
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({
        ok: false,
        error: err.message,
        status: err.status,
        body: err.responseBody
      }, 502);
    }
    return jsonResponse({
      ok: false,
      error: err.message
    }, 500);
  }
});
