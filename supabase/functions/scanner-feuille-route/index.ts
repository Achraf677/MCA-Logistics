// Edge Function `scanner-feuille-route` — lit TOUTES les pages d'un scan de feuille de route en
// ARRIÈRE-PLAN côté serveur : le navigateur envoie les photos (table `scans_feuille_route_pages`),
// appelle cette fonction, puis peut changer d'onglet, fermer la page, éteindre l'écran : la lecture
// continue ici. L'écran suit l'avancement dans la table (`etat` de chaque page, `battement` du scan).
//
// Entrée : { scan_id, pages?: number[] }
//   - sans `pages` : lit les pages pas encore lues (reprise après une coupure) ;
//   - avec `pages` : relit ces pages-là (bouton « Relire »).
// Sortie : 202 { ok: true } tout de suite ; le travail se poursuit (EdgeRuntime.waitUntil).
// Résultat : par page `etat` ok | erreur, `arrets` / `entete` / `page_lue` ; scan `pret` quand toutes
//   les pages sont traitées (au moins une lue), `erreur` si aucune n'a pu être lue.
//
// Lecture d'une page : `_shared/lireFeuilleCore.ts` (la même que `lire-feuille-route`).
// Accès (verify_jwt = true) : la RLS de `scans_feuille_route` décide (le salarié sur SES scans, le
// bureau avec `planning.tournees : update`). Les résultats sont écrits avec la clé de service.
// Reprise : si l'exécution est coupée (limite de durée), le navigateur relance la fonction quand le
// `battement` a plus de 90 s ; une exécution déjà vivante (battement < 60 s) n'est pas doublée.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { ErreurLecture, chargerReferentiel, indexer, lirePage } from '../_shared/lireFeuilleCore.ts'

// deno-lint-ignore no-explicit-any
type Service = any

async function battre(service: Service, scanId: string) {
  await service.from('scans_feuille_route').update({ battement: new Date().toISOString() }).eq('id', scanId)
}

async function traiter(service: Service, apiKey: string, scanId: string, companyId: string, seulement: number[] | null) {
  try {
    const ref = indexer(await chargerReferentiel(service, companyId))
    const { data: liste } = await service.from('scans_feuille_route_pages')
      .select('numero, etat').eq('scan_id', scanId).order('numero')
    const aLire = ((liste ?? []) as Array<{ numero: number; etat: string }>)
      .filter(p => (seulement ? seulement.includes(p.numero) : p.etat !== 'ok')).map(p => p.numero)

    for (const numero of aLire) {
      const { data: s } = await service.from('scans_feuille_route').select('statut').eq('id', scanId).maybeSingle()
      if (!s || s.statut === 'annule' || s.statut === 'termine') return
      await service.from('scans_feuille_route_pages')
        .update({ etat: 'lecture', erreur: null, updated_at: new Date().toISOString() }).eq('scan_id', scanId).eq('numero', numero)
      await battre(service, scanId)
      const { data: cur } = await service.from('scans_feuille_route_pages')
        .select('image').eq('scan_id', scanId).eq('numero', numero).maybeSingle()
      const { data: prec } = numero > 1
        ? await service.from('scans_feuille_route_pages').select('commune_fin').eq('scan_id', scanId).eq('numero', numero - 1).maybeSingle()
        : { data: null }
      try {
        if (!cur?.image) throw new ErreurLecture('Photo introuvable : reprends-la.', 422)
        const lue = await lirePage({
          apiKey, image: cur.image as string, communePrecedente: (prec?.commune_fin as string | null) ?? null, ref,
        })
        const fin = [...lue.arrets].reverse().find(a => a.commune)?.commune ?? (prec?.commune_fin as string | null) ?? null
        await service.from('scans_feuille_route_pages').update({
          etat: 'ok', erreur: null, nb: lue.arrets.length, page_lue: lue.page, entete: lue.entete,
          arrets: lue.arrets, commune_fin: fin, updated_at: new Date().toISOString(),
        }).eq('scan_id', scanId).eq('numero', numero)
      } catch (e) {
        const message = e instanceof ErreurLecture ? e.message : 'Lecture impossible : relance.'
        if (!(e instanceof ErreurLecture)) console.error('scanner-feuille-route: page', numero, (e as Error)?.message)
        await service.from('scans_feuille_route_pages').update({
          etat: 'erreur', erreur: message, updated_at: new Date().toISOString(),
        }).eq('scan_id', scanId).eq('numero', numero)
      }
      await battre(service, scanId)
    }

    const { data: fin } = await service.from('scans_feuille_route_pages').select('etat, erreur').eq('scan_id', scanId)
    const pages = (fin ?? []) as Array<{ etat: string; erreur: string | null }>
    const ok = pages.filter(p => p.etat === 'ok').length
    const encore = pages.some(p => p.etat === 'attente' || p.etat === 'lecture')
    if (encore) return
    await service.from('scans_feuille_route').update(ok > 0
      ? { statut: 'pret', erreur: null, updated_at: new Date().toISOString() }
      : { statut: 'erreur', erreur: pages.find(p => p.erreur)?.erreur ?? 'Aucune page lue : reprends les photos à plat, bien éclairées.', updated_at: new Date().toISOString() },
    ).eq('id', scanId).eq('statut', 'en_cours')
  } catch (e) {
    console.error('scanner-feuille-route: échec', (e as Error)?.message)
    await service.from('scans_feuille_route').update({
      statut: 'erreur', erreur: 'Lecture interrompue : relance.', updated_at: new Date().toISOString(),
    }).eq('id', scanId).eq('statut', 'en_cours')
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  const apiKey = Deno.env.get('MISTRAL_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anon || !svcKey) return jsonResponse({ ok: false, error: 'server misconfiguration' }, 500)
  const auth = req.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ ok: false, error: 'Session requise.' }, 401)

  let body: { scan_id?: unknown; pages?: unknown }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }
  const scanId = typeof body.scan_id === 'string' ? body.scan_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) return jsonResponse({ ok: false, error: 'scan_id attendu.' }, 400)
  const seulement = Array.isArray(body.pages) && body.pages.every(n => Number.isInteger(n) && n >= 1)
    ? (body.pages as number[]) : null

  // La RLS de l'appelant prouve qu'il a le droit sur ce scan.
  const db = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } })
  const { data: scan, error } = await db.from('scans_feuille_route')
    .select('id, company_id, statut, battement').eq('id', scanId).maybeSingle()
  if (error) return jsonResponse({ ok: false, error: error.message }, 400)
  if (!scan) return jsonResponse({ ok: false, error: 'Scan introuvable.' }, 404)
  if (scan.statut === 'termine' || scan.statut === 'annule') return jsonResponse({ ok: false, error: 'Scan terminé.' }, 409)
  if (scan.statut === 'en_cours' && !seulement && Date.now() - new Date(scan.battement).getTime() < 60_000) {
    return jsonResponse({ ok: true, deja_en_cours: true }, 202)
  }

  const service = createClient(url, svcKey, { auth: { persistSession: false } })
  if (seulement) {
    await service.from('scans_feuille_route_pages').update({ etat: 'attente', erreur: null })
      .eq('scan_id', scanId).in('numero', seulement)
  }
  await service.from('scans_feuille_route').update({
    statut: 'en_cours', erreur: null, battement: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', scanId)

  const travail = traiter(service, apiKey, scanId, scan.company_id as string, seulement)
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(travail)
  else await travail
  return jsonResponse({ ok: true, en_arriere_plan: true }, 202)
})
