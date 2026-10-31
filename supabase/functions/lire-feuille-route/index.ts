// Edge Function `lire-feuille-route` — lit UNE page photographiée d'une feuille de route de
// messagerie Colissimo et renvoie les arrêts lus, géocodés. RIEN n'est écrit en base : l'écran
// montre un aperçu modifiable, le salarié (ou le bureau) vérifie, puis crée la tournée (RLS de
// `tournees_colis`).
//
// La feuille réelle (validée le 17/10/2026, détail dans `_shared/feuilleRoute.ts`) :
//   - bandeau en gras « 67170 KRIEGSHEIM » = commune des lignes qui suivent, jusqu'au bandeau
//     suivant ; colonne District = SECTEUR (« (HC) 610 - KRIEGSHEIM »), pas la commune ;
//   - par ligne : Rue | Nb Colis | Nb PGEO | N° | CRBT/taxes ; dans N° : « 5(2) » (exposant =
//     colis), « RC13(21) » (relais), « [C]11 » (collecte : numéro dans un carré noir), « ? » ;
//   - « x/y » en bas à droite (n° de page) ; en-tête « Feuille de route » sur la 1re page.
//
// Entrée : { image: "data:image/jpeg;base64,…", commune_precedente?: "Kriegsheim" } (une page,
//          compressée côté front ~130 Ko ; commune de la fin de la page d'avant).
// Sortie : { ok: true, entete: {…} | null, page: { numero, total } | null,
//            arrets: [{ commune, cp, secteur, rue, numero, quantite, type, note, a_verifier,
//                       motif, lat, lng, geo_precision, rue_connue, ref_rang, ref_rang_commune }] }
//
// Garanties (comme `lire-facture`) :
//   - rien d'inventé : la vision recopie, case illisible = null, chiffre illisible = « ? » ;
//     le découpage de la case N° (un arrêt par numéro), le report de la commune et
//     l'auto-contrôle Nb Colis / Nb PGEO sont faits en code, testés ;
//   - référentiel de la société (`referentiel_rues`, `_shared/referentiel.ts`, repris de l'outil
//     de tournée d'origine) : commune retrouvée par le secteur, nom officiel de la rue, position
//     du numéro (ou du voisin), relais connus, ordre habituel ; numéros manquants ajoutés
//     d'office (« n° illisible : regarde l'étiquette ») ;
//   - géocodage BAN pour le reste : numéro, sinon centre de la rue, sinon rien ; communes
//     déléguées par alias (`_shared/geocodeArret.ts`), filtre par CP du bandeau.
// Accès (verify_jwt = true) : compte actif relié à une fiche Équipe (le salarié scanne pour
//   lui-même), président, ou droit `planning.tournees : update` (le bureau scanne pour un
//   salarié).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { exigerPermission } from '../_shared/auth.ts'
import { ErreurLecture, TAILLE_MAX, chargerHistorique, chargerReferentiel, indexer, indexerHistorique, lirePage } from '../_shared/lireFeuilleCore.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  const apiKey = Deno.env.get('MISTRAL_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !svcKey) return jsonResponse({ ok: false, error: 'server misconfiguration' }, 500)

  let body: { image?: unknown; commune_precedente?: unknown }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }
  const image = typeof body.image === 'string' ? body.image : ''
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return jsonResponse({ ok: false, error: 'Image attendue (photo JPEG, PNG ou WebP).' }, 400)
  }
  if (image.length > TAILLE_MAX) {
    return jsonResponse({ ok: false, error: 'Photo trop lourde : reprends-la (une page par photo).' }, 413)
  }

  // Accès : président / droit Tournées, sinon un compte relié à une fiche Équipe.
  const service = createClient(url, svcKey, { auth: { persistSession: false } })
  const acces = await exigerPermission(req, service, 'planning.tournees', 'update')
  let companyId = acces.ok ? acces.companyId : ''
  if (!acces.ok) {
    if (acces.response.status !== 403) return acces.response
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    const { data: u } = await service.auth.getUser(jwt)
    const userId = u?.user?.id
    const { data: profil } = userId
      ? await service.from('profiles').select('company_id, active').eq('id', userId).maybeSingle()
      : { data: null }
    const { data: fiche } = userId && profil?.company_id && profil.active !== false
      ? await service.from('team_members').select('id').eq('profile_id', userId)
          .eq('company_id', profil.company_id).limit(1).maybeSingle()
      : { data: null }
    if (!fiche) return jsonResponse({ ok: false, error: 'Compte non relié à une fiche Équipe : préviens le bureau.' }, 403)
    companyId = String(profil?.company_id ?? '')
  }

  const precedente = typeof body.commune_precedente === 'string' ? body.commune_precedente : null
  const ref = indexer(companyId ? await chargerReferentiel(service, companyId) : [])
  const hist = indexerHistorique(companyId ? await chargerHistorique(service, companyId) : [])
  try {
    const lue = await lirePage({ apiKey, image, communePrecedente: precedente, ref, hist })
    return jsonResponse({ ok: true, entete: lue.entete, page: lue.page, arrets: lue.arrets })
  } catch (e) {
    if (e instanceof ErreurLecture) return jsonResponse({ ok: false, error: e.message }, e.status)
    throw e
  }
})
