// Edge Function `optimize-tour` — optimise l'ordre des arrêts d'une tournée (mono-véhicule).
// Entrée : { tour_id }. Lit la tournée + ses livraisons géocodées + le dépôt, appelle
// OpenRouteService /optimization, puis ÉCRIT : stop_order + arrival_time sur chaque livraison,
// et total_km / durée / geometry / status sur la tournée. La clé ORS n'est jamais logguée.
// Profil "driving-car" (VUL < 3,5 t, pas de restriction poids lourd). Départ estimé à 08:00.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { optimize } from '../_shared/ors.ts';
const DEPART_DEFAULT = '08:00:00';
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
  const tourId = typeof body.tour_id === 'string' ? body.tour_id : '';
  if (!tourId) return jsonResponse({
    ok: false,
    error: 'tour_id required'
  }, 400);
  const supabase = getServiceClient();
  // ── Tournée ──
  const { data: tour, error: tErr } = await supabase.from('tours').select('id, company_id, depot_lat, depot_lng').eq('id', tourId).single();
  if (tErr || !tour) return jsonResponse({
    ok: false,
    error: 'tour not found'
  }, 404);
  // ── Dépôt : celui figé sur la tournée, sinon celui de la société ──
  let depotLat = tour.depot_lat;
  let depotLng = tour.depot_lng;
  if (depotLat == null || depotLng == null) {
    const { data: company } = await supabase.from('companies').select('depot_lat, depot_lng').eq('id', tour.company_id).single();
    depotLat = company?.depot_lat ?? null;
    depotLng = company?.depot_lng ?? null;
  }
  if (depotLat == null || depotLng == null) {
    return jsonResponse({
      ok: false,
      error: 'depot not geocoded (companies.depot_lat/lng)'
    }, 422);
  }
  // ── Livraisons de la tournée, géocodées ──
  const { data: deliveries, error: dErr } = await supabase.from('deliveries').select('id, delivery_lat, delivery_lng').eq('tour_id', tourId);
  if (dErr) return jsonResponse({
    ok: false,
    error: dErr.message
  }, 500);
  const geocoded = (deliveries ?? []).filter((d)=>d.delivery_lat != null && d.delivery_lng != null);
  if (geocoded.length === 0) {
    return jsonResponse({
      ok: false,
      error: 'no geocoded deliveries on this tour'
    }, 422);
  }
  const jobIdToDelivery = new Map();
  const jobs = geocoded.map((d, i)=>{
    const jid = i + 1;
    jobIdToDelivery.set(jid, d.id);
    return {
      id: jid,
      location: [
        d.delivery_lng,
        d.delivery_lat
      ]
    };
  });
  const vehicles = [
    {
      id: 1,
      profile: 'driving-car',
      start: [
        depotLng,
        depotLat
      ],
      end: [
        depotLng,
        depotLat
      ]
    }
  ];
  try {
    const result = await optimize(apiKey, jobs, vehicles);
    const route = result.routes?.[0];
    if (!route) return jsonResponse({
      ok: false,
      error: 'no route returned by ORS'
    }, 502);
    let order = 0;
    const updates = [];
    for (const step of route.steps){
      if (step.type === 'job' && step.id != null) {
        order += 1;
        const deliveryId = jobIdToDelivery.get(step.id);
        if (!deliveryId) continue;
        const arrival = typeof step.arrival === 'number' ? secondsToTime(DEPART_DEFAULT, step.arrival) : null;
        updates.push({
          id: deliveryId,
          stop_order: order,
          arrival_time: arrival
        });
      }
    }
    for (const u of updates){
      const { error } = await supabase.from('deliveries').update({
        stop_order: u.stop_order,
        arrival_time: u.arrival_time
      }).eq('id', u.id);
      if (error) return jsonResponse({
        ok: false,
        error: `update delivery: ${error.message}`
      }, 500);
    }
    const totalKm = Math.round(route.distance / 1000 * 10) / 10;
    const totalMin = Math.round(route.duration / 60);
    const { error: upErr } = await supabase.from('tours').update({
      total_km: totalKm,
      total_duration_min: totalMin,
      geometry: route.geometry ?? null,
      depot_lat: depotLat,
      depot_lng: depotLng,
      status: 'optimisee',
      optimized_at: new Date().toISOString()
    }).eq('id', tourId);
    if (upErr) return jsonResponse({
      ok: false,
      error: `update tour: ${upErr.message}`
    }, 500);
    return jsonResponse({
      ok: true,
      data: {
        stops: updates.length,
        total_km: totalKm,
        total_duration_min: totalMin,
        order: updates
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
