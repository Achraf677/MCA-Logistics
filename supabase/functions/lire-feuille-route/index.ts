// Edge Function `lire-feuille-route` — lit UNE page photographiée d'une feuille de route de
// messagerie (Colissimo : tableau « ADRESSES DE LIVRAISON ») et renvoie les arrêts lus,
// géocodés. RIEN n'est écrit en base : l'écran montre un aperçu modifiable, le salarié (ou le
// bureau) vérifie, puis crée la tournée (RLS de `tournees_colis`).
//
// Entrée : { image: "data:image/jpeg;base64,…" } (une page, compressée côté front ~130 Ko).
// Sortie : { ok: true, entete: {…} | null, arrets: [{ commune, cp, rue, numero, quantite,
//            type, note, a_verifier, lat, lng, geo_precision }] }
//
// Garanties (comme `lire-facture`) :
//   - rien d'inventé : la vision recopie, case illisible = null ; le découpage de la case
//     « N° » (un arrêt par numéro) est fait en code, testé (`_shared/feuilleRoute.ts`) ;
//   - contrôle « Nb Colis » de chaque ligne → arrêts « à vérifier » en cas d'écart ;
//   - géocodage BAN : numéro, sinon centre de la rue, sinon rien (`_shared/geocodeArret.ts`).
// Accès (verify_jwt = true) : compte actif relié à une fiche Équipe (le salarié scanne pour
//   lui-même), président, ou droit `planning.tournees : update` (le bureau scanne pour un
//   salarié). Un compte d'une autre société n'écrit rien de toute façon (rien n'est écrit).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { exigerPermission } from '../_shared/auth.ts'
import { generateJsonFromImage } from '../_shared/mistral.ts'
import { ExternalApiError } from '../_shared/http.ts'
import { lignesEnArrets, nettoyerLecture, type ArretFeuille } from '../_shared/feuilleRoute.ts'
import { geocoderArret, type PointArret } from '../_shared/geocodeArret.ts'

/** ~2 Mo de base64 : une page compressée en pèse ~180 Ko ; au-delà, refus net. */
const TAILLE_MAX = 2_000_000
/** Appels BAN en parallèle (limite publique : 50 / s par IP). */
const PARALLELE = 6

const SYSTEM = `Tu lis UNE page photographiée d'une feuille de route de messagerie (Colissimo, La Poste) d'un chauffeur-livreur en France.
La page contient un tableau « ADRESSES DE LIVRAISON » avec les colonnes : District | Rue | Nb Colis | Nb PGEO | N° | CRBT.
Tu RECOPIES ce qui est imprimé. Tu n'estimes rien, tu ne complètes rien, tu ne corriges pas l'orthographe des rues.

Règles strictes :
- Une entrée de "lignes" par LIGNE du tableau, dans l'ordre de haut en bas. Ne fusionne pas deux lignes, n'en saute aucune, n'en invente aucune.
- La photo peut être prise de biais : pour CHAQUE ligne, suis la ligne d'un bord à l'autre et vérifie que la rue, le « Nb Colis » et la case « N° » sont bien sur la MÊME ligne avant de les écrire ensemble.
- "commune" : le contenu de la case District (commune, avec code postal s'il est écrit). Case vide = null.
- "cp" : le code postal à 5 chiffres s'il est écrit séparément, sinon null.
- "rue" : le nom de la rue tel qu'écrit (ex. "RUE DES VOSGES").
- "nb_colis" : le nombre de la colonne Nb Colis (entier).
- "numeros" : le contenu EXACT de la case N°, caractère pour caractère, y compris les virgules, les « (3) », les préfixes « RC » et les « [C] ». Exemple : "12, 14 (2), RC 3".
- "crbt" : le contenu de la case CRBT s'il y en a un, sinon null.
- Une case illisible vaut null. Mieux vaut null qu'une valeur plausible et fausse.
- Ignore la colonne Nb PGEO, les totaux, les en-têtes répétés et tout ce qui est hors du tableau (sauf l'en-tête de page ci-dessous).
- "entete" : en haut de la page, si c'est écrit : date de la feuille ("date"), véhicule ("vehicule"), circuit ou tournée ("circuit"), agence ("agence"), nombre total de colis ("nb_colis"), nombre d'arrêts ("nb_arrets"). Absent = null ; aucun en-tête = null.

Réponds UNIQUEMENT en JSON :
{"entete": {"date": <texte|null>, "vehicule": <texte|null>, "circuit": <texte|null>, "agence": <texte|null>, "nb_colis": <entier|null>, "nb_arrets": <entier|null>} | null,
 "lignes": [{"commune": <texte|null>, "cp": <texte|null>, "rue": <texte|null>, "nb_colis": <entier|null>, "numeros": <texte|null>, "crbt": <texte|null>}]}`

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

  let body: { image?: unknown }
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
  const arrets = lignesEnArrets(lecture.lignes)
  const points = await geocoderTous(arrets)
  console.log('lire-feuille-route: page lue', lecture.lignes.length, 'lignes,', arrets.length, 'arrêts,',
    points.filter(Boolean).length, 'localisés')

  return jsonResponse({
    ok: true,
    entete: lecture.entete,
    arrets: arrets.map((a, i) => ({
      ...a,
      lat: points[i]?.lat ?? null,
      lng: points[i]?.lng ?? null,
      geo_precision: points[i]?.precision ?? null,
    })),
  })
})
