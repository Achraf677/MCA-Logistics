// Edge Function `geocode`
// Deux modes :
//   a) { address }        → { ok:true, lat, lng } | { ok:false } (BAN muette)
//   b) { backfill: true } → géocode le dépôt (companies.address → depot_lat/lng)
//      + toutes les deliveries de la company de l'appelant dont l'adresse est
//      remplie mais delivery_lat/lng est NULL. Écrit les coords côté serveur
//      (service_role). Retourne un compte { depot_ok, deliveries_ok,
//      deliveries_echec }.
//
// verify_jwt = true : la company de l'appelant est déduite de son JWT
// (profiles.company_id). Le service_role ne sert que pour l'écriture DB, pas
// pour élargir les droits.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { geocode } from '../_shared/geocode.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  let body: { address?: string; backfill?: boolean }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }

  try {
    // ── Mode a : géocode d'une adresse (usage à l'enregistrement) ────────────
    if (typeof body.address === 'string' && body.address.trim().length > 0) {
      const coords = await geocode(body.address)
      if (!coords) return jsonResponse({ ok: false, error: 'adresse introuvable' })
      return jsonResponse({ ok: true, lat: coords.lat, lng: coords.lng })
    }

    // ── Mode b : backfill company ────────────────────────────────────────────
    if (body.backfill === true) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (!authHeader) return jsonResponse({ ok: false, error: 'missing Authorization' }, 401)

      const url = Deno.env.get('SUPABASE_URL')
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !anonKey || !svcKey) {
        return jsonResponse({ ok: false, error: 'server misconfiguration' }, 500)
      }

      // Auth JWT → user + company_id (jamais depuis le body).
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      })
      const { data: { user }, error: uErr } = await userClient.auth.getUser()
      if (uErr || !user) return jsonResponse({ ok: false, error: 'invalid session' }, 401)

      const service = createClient(url, svcKey, { auth: { persistSession: false } })
      const { data: me } = await service
        .from('profiles').select('company_id').eq('id', user.id).single()
      const companyId = me?.company_id as string | undefined
      if (!companyId) return jsonResponse({ ok: false, error: 'société introuvable' }, 400)

      // ── Dépôt ────────────────────────────────────────────────────────────
      let depot_ok: 'skipped' | 'ok' | 'echec' = 'skipped'
      const { data: company } = await service
        .from('companies')
        .select('address, depot_lat, depot_lng')
        .eq('id', companyId)
        .single()
      if (company?.address && (company.depot_lat == null || company.depot_lng == null)) {
        const c = await geocode(company.address as string)
        if (c) {
          const { error } = await service
            .from('companies')
            .update({ depot_lat: c.lat, depot_lng: c.lng })
            .eq('id', companyId)
          depot_ok = error ? 'echec' : 'ok'
        } else {
          depot_ok = 'echec'
        }
      }

      // ── Livraisons ───────────────────────────────────────────────────────
      // Cible : delivery_lat OU delivery_lng NULL, delivery_address non vide.
      const { data: deliveries } = await service
        .from('deliveries')
        .select('id, delivery_address, delivery_lat, delivery_lng')
        .eq('company_id', companyId)
        .not('delivery_address', 'is', null)
        .or('delivery_lat.is.null,delivery_lng.is.null')

      let deliveries_ok = 0
      let deliveries_echec = 0
      for (const d of deliveries ?? []) {
        const addr = (d.delivery_address as string | null)?.trim()
        if (!addr) continue
        const c = await geocode(addr)
        if (!c) { deliveries_echec++; continue }
        const { error } = await service
          .from('deliveries')
          .update({ delivery_lat: c.lat, delivery_lng: c.lng })
          .eq('id', d.id)
        if (error) deliveries_echec++
        else deliveries_ok++
      }

      return jsonResponse({
        ok: true,
        data: { depot_ok, deliveries_ok, deliveries_echec },
      })
    }

    return jsonResponse({ ok: false, error: 'address ou backfill requis' }, 400)
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message }, 500)
  }
})
