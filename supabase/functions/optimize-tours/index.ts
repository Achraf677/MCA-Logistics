// Edge Function `optimize-tours` — répartition MULTI-véhicule (Tournée V3).
// Entrée : { date: 'YYYY-MM-DD', heure_depart?: 'HH:MM', assignments: [{ vehicle_id, driver_id? }], delivery_ids: string[] }
// Équilibrage : amount:[1] par livraison + capacity:[ceil(N/V)] par véhicule → force l'usage équilibré.
// Heures justes (lot T3) : départ choisi (défaut 08:00, gardé sur `tours.heure_depart`), 5 min
// d'arrêt, créneaux de la fiche en fenêtres horaires, urgent prioritaire, durée = conduite +
// arrêts + attente. Express (lot T4) : un retrait à faire est géocodé ici (BAN) et envoyé en paire
// retrait → livraison ; retraits et livraisons numérotés dans une seule séquence
// (`pickup_order` / `stop_order`, comme Mes courses). Règles pures : `_shared/vroom.ts`.
// IDEMPOTENT : avant réaffectation, détache TOUTES les livraisons des tournées concernées (date+véhicules),
// pas seulement le pool reçu — évite les résidus d'un essai précédent. Supprime les tournées devenues vides.
// Garde-fou : refuse (409) si une tournée de ces véhicules à cette date est déjà en_cours/terminee.
// Contrôle d'accès (lot T1, revue 04a) : le service role contourne la RLS → appelant vérifié
// (président ou `planning.tournees` / update), société = celle de l'appelant ; courses,
// véhicules et chauffeurs d'une autre société ignorés / refusés.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { optimize } from '../_shared/ors.ts';
import { geocode } from '../_shared/geocode.ts';
import { DEPART_DEFAUT, construireProbleme, coursesNonPlacees, dureeRouteMin, heureEnSecondes, lireRoute, secondesEnHeure } from '../_shared/vroom.ts';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
  const departSec = body.heure_depart == null || body.heure_depart === '' ? heureEnSecondes(DEPART_DEFAUT) : heureEnSecondes(body.heure_depart);
  if (departSec == null) return jsonResponse({
    ok: false,
    error: 'heure_depart (HH:MM) invalide'
  }, 400);
  const heureDepart = secondesEnHeure(departSec);
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
  const acces = await exigerPermission(req, supabase, 'planning.tournees', 'update');
  if (!acces.ok) return acces.response;
  const companyId = acces.companyId;
  // ── Véhicules et chauffeurs : de la société de l'appelant, sinon refus ──
  {
    const vids = assignments.map((a)=>a.vehicle_id);
    const { data: vehs, error: vErr } = await supabase.from('vehicles').select('id').eq('company_id', companyId).in('id', vids);
    if (vErr) return jsonResponse({ ok: false, error: vErr.message }, 500);
    if ((vehs ?? []).length !== vids.length) return jsonResponse({ ok: false, error: 'véhicule inconnu pour cette société' }, 403);
    const dids = assignments.map((a)=>a.driver_id).filter((d)=>!!d);
    if (dids.length > 0) {
      const { data: drv, error: drErr } = await supabase.from('team_members').select('id').eq('company_id', companyId).in('id', dids);
      if (drErr) return jsonResponse({ ok: false, error: drErr.message }, 500);
      if ((drv ?? []).length !== new Set(dids).size) return jsonResponse({ ok: false, error: 'chauffeur inconnu pour cette société' }, 403);
    }
  }
  // ── Livraisons du pool, géocodées (société de l'appelant uniquement) ──
  const { data: deliveries, error: dErr } = await supabase.from('deliveries').select('id, company_id, delivery_lat, delivery_lng, pickup_address, retrait_a_faire, urgent, creneau_retrait_debut, creneau_retrait_fin, creneau_livraison_debut, creneau_livraison_fin').eq('company_id', companyId).in('id', deliveryIds);
  if (dErr) return jsonResponse({
    ok: false,
    error: dErr.message
  }, 500);
  const geocoded = (deliveries ?? []).filter((d)=>d.delivery_lat != null && d.delivery_lng != null);
  if (geocoded.length === 0) return jsonResponse({
    ok: false,
    error: 'no geocoded deliveries in pool',
    message: "Aucune livraison sélectionnée n'est localisée — clique sur « Géocoder les adresses manquantes » puis réessaie."
  }, 422);
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
      error: 'depot not geocoded (companies.depot_lat/lng)',
      message: "Dépôt non localisé — renseigne/valide l'adresse du dépôt dans Paramètres, puis clique sur « Géocoder les adresses manquantes »."
    }, 422);
  }
  // ── Retraits à faire : géocodés maintenant (adresse du jour, jamais une position périmée) ──
  const retraitsNonLocalises = [];
  const courses = [];
  for (const d of geocoded){
    let retrait = null;
    const adr = typeof d.pickup_address === 'string' ? d.pickup_address.trim() : '';
    if (d.retrait_a_faire === true && adr) {
      retrait = await geocode(adr);
      if (!retrait) retraitsNonLocalises.push(d.id);
    }
    courses.push({ ...d, retrait });
  }
  const cap = Math.max(1, Math.ceil(geocoded.length / assignments.length));
  const vroomVehToAssign = new Map();
  assignments.forEach((a, i)=>vroomVehToAssign.set(i + 1, a));
  const probleme = construireProbleme(courses, assignments.map((_, i)=>({ ref: i + 1 })), {
    depot: { lat: depotLat, lng: depotLng },
    departSec,
    capacite: cap
  });
  try {
    const result = await optimize(apiKey, probleme.jobs, probleme.vehicles, probleme.shipments);
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
      }).eq('company_id', companyId).in('id', deliveryIds);
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
      const totalMin = dureeRouteMin(route);
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
        heure_depart: heureDepart,
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
      let stops = 0;
      for (const pos of lireRoute(route.steps ?? [], probleme.refs)){
        const { error } = await supabase.from('deliveries').update({
          tour_id: tourId,
          vehicle_id: assign.vehicle_id,
          driver_id: assign.driver_id,
          stop_order: pos.stop_order,
          pickup_order: pos.pickup_order,
          arrival_time: pos.arrival_time
        }).eq('id', pos.courseId).eq('company_id', companyId);
        if (error) return jsonResponse({
          ok: false,
          error: `update delivery: ${error.message}`
        }, 500);
        stops += 1;
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
    const unassigned = coursesNonPlacees(result.unassigned ?? [], probleme.refs).length;
    return jsonResponse({
      ok: true,
      data: {
        date,
        vehicles_used: summary.length,
        cap_per_vehicle: cap,
        tours: summary,
        unassigned,
        heure_depart: heureDepart,
        retraits_non_localises: retraitsNonLocalises.length
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
