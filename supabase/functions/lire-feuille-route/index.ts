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
import { generateJsonFromImage } from '../_shared/mistral.ts'
import { ExternalApiError } from '../_shared/http.ts'
import { lignesEnArrets, nettoyerLecture, type ArretFeuille } from '../_shared/feuilleRoute.ts'
import { geocoderArret, type PointArret } from '../_shared/geocodeArret.ts'
import { appliquerReferentiel, indexer, type RueRef } from '../_shared/referentiel.ts'

/** ~2 Mo de base64 : une page compressée en pèse ~180 Ko ; au-delà, refus net. */
const TAILLE_MAX = 2_000_000
/** Appels BAN en parallèle (limite publique : 50 / s par IP). */
const PARALLELE = 6

const SYSTEM = `Tu lis UNE page photographiée d'une feuille de route Colissimo (La Poste) d'un chauffeur-livreur en France.
Tu RECOPIES ce qui est imprimé. Tu n'estimes rien, tu ne complètes rien, tu ne corriges pas l'orthographe.

MISE EN PAGE
- Le tableau « ADRESSES DE LIVRAISON » a les colonnes : District | Rue | Nb Colis | Nb PGEO | N° | CRBT/taxes.
- Des BANDEAUX en gras « 67170 KRIEGSHEIM » (code postal + commune) coupent le tableau : chaque bandeau ouvre un groupe de lignes.
- La colonne District n'est PAS la commune : c'est le SECTEUR (ex. « (HC) 610 - KRIEGSHEIM », « 601 - GEUDERTHEIM EGLISE »), répété sur chaque ligne du secteur. Un mot coupé sur deux lignes se recolle.

RÈGLES, pour CHAQUE ligne du tableau, de haut en bas (une entrée de "lignes" par ligne, ni fusion, ni saut, ni invention) :
- "commune_bandeau" : le texte du bandeau (ex. "67170 KRIEGSHEIM") SEULEMENT sur la première ligne qui suit ce bandeau ; null sur toutes les autres lignes.
- "secteur" : le contenu de la colonne District.
- "rue" : le nom de la rue tel qu'écrit.
- "nb_colis" : la colonne Nb Colis (entier). "nb_pgeo" : la colonne Nb PGEO (entier).
- "numeros" : la cellule N° recopiée exactement, numéros séparés par des virgules :
  - petits chiffres en exposant après un numéro = nombre de colis, à noter entre parenthèses : « 5(2) » ;
  - préfixe RC = point relais : « RC13(21) » ;
  - numéro imprimé en clair dans un petit carré NOIR (case inversée) = collecte, à noter « [C]11 » ;
  - cellule vide = "" ; chiffre illisible = « ? » à sa place (ex. « 1? »).
- "crbt" : la colonne CRBT/taxes si elle est remplie, sinon null.
- Une case illisible vaut null. Mieux vaut null qu'une valeur plausible et fausse.

ALIGNEMENT (photo de biais) : dans chaque secteur il y a autant de noms de rue que de lignes de chiffres ; associe la n-ième rue à la n-ième ligne de chiffres, sans décaler.

AUTO-CONTRÔLE, ligne par ligne, avant de répondre : la somme des colis de la cellule N° (1 par numéro sans parenthèses, sinon le nombre entre parenthèses) doit égaler Nb Colis, et le nombre de numéros doit égaler Nb PGEO. Si ce n'est pas le cas, relis la ligne sur la photo ; si l'écart reste, recopie ce que tu lis sans l'ajuster.

PAGE : "page" = le « x/y » imprimé en bas à droite (ex. "2/3"), null s'il n'est pas visible.

EN-TÊTE : seulement si le cadre « Feuille de route » (logo Colissimo) est sur la photo, sinon "entete": null. Champs : date (JJ/MM/AAAA), societe, vehicule, imei, circuit, operateur, depart (HH:MM), remettant (nom du site qui remet les colis), adresse_remettant (adresse postale de ce site si elle est imprimée, sinon null), nb_colis (entier), nb_pgeo (entier), livreur. Absent = null.
Ignore les totaux et tout ce qui est hors du tableau et de l'en-tête.

Réponds UNIQUEMENT en JSON :
{"entete": {"date": …, "societe": …, "vehicule": …, "imei": …, "circuit": …, "operateur": …, "depart": …, "remettant": …, "adresse_remettant": …, "nb_colis": …, "nb_pgeo": …, "livreur": …} | null,
 "page": "<x/y>" | null,
 "lignes": [{"commune_bandeau": <texte|null>, "secteur": <texte|null>, "rue": <texte|null>, "nb_colis": <entier|null>, "nb_pgeo": <entier|null>, "numeros": <texte>, "crbt": <texte|null>}]}`

/** Référentiel de la société (rues, numéros, ordre habituel, relais), par paquets de 1 000. */
// deno-lint-ignore no-explicit-any
async function chargerReferentiel(service: any, companyId: string): Promise<RueRef[]> {
  const out: RueRef[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await service.from('referentiel_rues')
      .select('commune, commune_cle, rue, rue_cle, rue_souple, rang, numeros, centre, relais')
      .eq('company_id', companyId).order('id').range(de, de + 999)
    if (error) { console.warn('lire-feuille-route: référentiel', error.message); return out }
    out.push(...((data ?? []) as RueRef[]))
    if (!data || data.length < 1000) return out
  }
}

/** Géocode les arrêts (même adresse = un seul appel), quelques-uns à la fois. */
async function geocoderTous(arrets: ArretFeuille[]): Promise<Array<PointArret | null>> {
  const cache = new Map<string, Promise<PointArret | null>>()
  const cle = (a: ArretFeuille) => [a.numero, a.rue, a.cp, a.commune].map(v => (v ?? '').toUpperCase()).join('|')
  const out: Array<PointArret | null> = new Array(arrets.length).fill(null)
  let i = 0
  const ouvrier = async () => {
    while (i < arrets.length) {
      const k = i++
      const a = arrets[k]
      const c = cle(a)
      if (!cache.has(c)) cache.set(c, geocoderArret(a))
      out[k] = await cache.get(c)!
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLELE, arrets.length) }, ouvrier))
  return out
}

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

  let brut: unknown
  try {
    brut = await generateJsonFromImage<unknown>(
      apiKey, SYSTEM, 'Voici la page à lire. Recopie chaque ligne du tableau.', image, 8192,
    )
  } catch (e) {
    console.error('lire-feuille-route: lecture vision', (e as Error)?.message,
      e instanceof ExternalApiError ? JSON.stringify(e.responseBody) : '')
    const surcharge = e instanceof ExternalApiError && e.status === 429
    return jsonResponse({
      ok: false,
      error: surcharge ? 'Service de lecture surchargé : réessaie dans une minute.'
        : 'Page illisible : reprends la photo à plat, bien éclairée, une page entière.',
    }, surcharge ? 503 : 422)
  }

  const lecture = nettoyerLecture(brut)
  // Référentiel : commune par le secteur, rue officielle, position, relais connus, ordre habituel.
  const ref = indexer(companyId ? await chargerReferentiel(service, companyId) : [])
  const precedente = typeof body.commune_precedente === 'string' ? body.commune_precedente : null
  const arrets = appliquerReferentiel(lignesEnArrets(lecture.lignes), ref, precedente)
  // Seuls les arrêts que le référentiel ne place pas partent au géocodage BAN.
  const aGeocoder = arrets.filter(a => a.lat == null)
  const trouves = await geocoderTous(aGeocoder)
  const parArret = new Map(aGeocoder.map((a, i) => [a, trouves[i]]))
  const points = arrets.map(a => (a.lat != null && a.lng != null
    ? { lat: a.lat, lng: a.lng, precision: a.geo_precision ?? 'rue' } as PointArret
    : parArret.get(a) ?? null))
  console.log('lire-feuille-route: page lue', lecture.page ? `${lecture.page.numero}/${lecture.page.total}` : '?/?', lecture.lignes.length, 'lignes,', arrets.length, 'arrêts,',
    points.filter(Boolean).length, 'localisés,', arrets.filter(a => a.rue_connue).length, 'rues du référentiel')

  return jsonResponse({
    ok: true,
    entete: lecture.entete,
    page: lecture.page,
    arrets: arrets.map((a, i) => ({
      ...a,
      lat: points[i]?.lat ?? null,
      lng: points[i]?.lng ?? null,
      geo_precision: points[i]?.precision ?? null,
    })),
  })
})
