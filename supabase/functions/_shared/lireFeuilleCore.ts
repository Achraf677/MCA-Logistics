// Lecture d'UNE page de feuille de route (vision + référentiel + géocodage), partagée par
// l'Edge `lire-feuille-route` (une page, à la demande) et `scanner-feuille-route` (toutes les
// pages, en arrière-plan côté serveur). Aucune écriture en base ici.
import { generateJsonFromImage } from './mistral.ts'
import { ExternalApiError } from './http.ts'
import { cpDeCommune, forcerBrumath, lignesEnArrets, nettoyerLecture, type ArretFeuille } from './feuilleRoute.ts'
import { geocoderArret, type PointArret } from './geocodeArret.ts'
import { appliquerReferentiel, indexer, type RueRef } from './referentiel.ts'

/** ~2 Mo de base64 : une page compressée en pèse ~180 Ko ; au-delà, refus net. */
export const TAILLE_MAX = 2_000_000
/** Appels BAN en parallèle (limite publique : 50 / s par IP). */
const PARALLELE = 6

const SYSTEM = `Tu lis UNE page photographiée d'une feuille de route Colissimo (La Poste) d'un chauffeur-livreur en France.
Tu RECOPIES ce qui est imprimé. Tu n'estimes rien, tu ne complètes rien, tu ne corriges pas l'orthographe.

MISE EN PAGE
- Le tableau « ADRESSES DE LIVRAISON » a les colonnes : District | Rue | Nb Colis | Nb PGEO | N° | CRBT/taxes.
- Des BANDEAUX en gras « 67170 KRIEGSHEIM » (code postal + commune) coupent le tableau : chaque bandeau ouvre un groupe de lignes.
- La colonne District n'est PAS la commune : c'est le SECTEUR (ex. « (HC) 610 - KRIEGSHEIM », « 601 - GEUDERTHEIM EGLISE »), répété sur chaque ligne du secteur. Un mot coupé sur deux lignes se recolle.

TOURNÉE DE BRUMATH (cas fréquent) : le bandeau « 67170 BRUMATH » n'est que sur la 1re page ; les pages suivantes n'en ont pas et TOUT reste à Brumath (67170). La colonne District contient des ZONES : « 630 - ZONE 1 (Brumath) », « 631 - ZONE 2 »… « 636 - ZONE 7 », et « (HC) 0 - District inconnu ». Ces cellules sont FUSIONNÉES sur plusieurs lignes et leur texte est centré dans son bloc : chaque ligne appartient à la zone dont le bloc (délimité par les traits horizontaux) la contient ; recopie ce libellé dans "secteur" pour chacune de ses lignes. Une zone n'est jamais une commune : ne la mets pas dans "commune_bandeau". Des rues portent le nom d'un village (« rue de Krautwiller », « rue de Vendenheim », « rue de Bernolsheim », « rue de Geudertheim », « rue de Hochstett », « rue de Bilwisheim ») : ce sont des rues de Brumath, pas des communes.

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
- « RC » (deux petites lettres collées devant le numéro) = point relais : « RC141(6) » = relais n° 141, 6 colis ; « RC4(4) » = relais n° 4, 4 colis ; « RC4A(4) » = relais n° 4A, 4 colis. Ne transforme jamais « RC4A » en « 85A » ni « RC4 » en « 4 ».
- COLLECTE = un numéro ENCADRÉ / surligné en NOIR avec le numéro de l'adresse écrit à l'intérieur (blanc sur fond noir), même s'il est seul au milieu d'une liste (« 6, [C]10, 25 », « [C]28A », « [C]1, 6, 12 ») : note-le « [C] » devant son numéro. Un numéro seulement en GRAS (« 41E », « 19B ») n'est PAS une collecte.
- RELAIS = « RC » + numéro + nombre de colis du relais entre parenthèses : « RC141(8) » = relais n° 141, 8 colis ; « RC4(22) » = relais n° 4, 22 colis.
- Une lettre collée au numéro (3A, 5B, 14B, 19B, 41E, 1B) est une LETTRE : « 3A » n'est pas « 34 », « 1B » n'est pas « 18 ».
- Un petit « (2) » après un numéro est le nombre de colis de ce numéro, pas un autre numéro : « 2(2) » = n° 2, 2 colis.
- "crbt" : la colonne CRBT/taxes si elle est remplie, sinon null.
- Une case illisible vaut null. Mieux vaut null qu'une valeur plausible et fausse.

PHOTO PENCHÉE : le tableau est souvent photographié de biais, donc les chiffres d'une ligne (Nb Colis, Nb PGEO, N°) peuvent se trouver plus HAUT que le nom de la rue. Suis les TRAITS horizontaux du tableau (une ligne = l'espace entre deux traits), pas la hauteur du texte. Vérifie chaque ligne avec le contrôle ci-dessous : si les numéros ne font pas le bon nombre de colis, décale-les vers la ligne voisine qui correspond.

UNE ENTRÉE PAR RUE IMPRIMÉE : ne fusionne jamais les numéros de deux rues, ne saute aucune rue. Dans chaque zone, il y a autant de noms de rue que de cases N° : compte-les avant de répondre.

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
export async function chargerReferentiel(service: any, companyId: string): Promise<RueRef[]> {
  const out: RueRef[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await service.from('referentiel_rues')
      .select('commune, commune_cle, rue, rue_cle, rue_souple, rang, numeros, centre, relais')
      .eq('company_id', companyId).order('id').range(de, de + 999)
    if (error) { console.warn('feuille de route : référentiel', error.message); return out }
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


/** Erreur de lecture avec un message prêt à afficher et le code HTTP à renvoyer. */
export class ErreurLecture extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export interface PageLue {
  entete: unknown
  page: { numero: number; total: number } | null
  arrets: Array<ArretFeuille & { lat: number | null; lng: number | null; geo_precision: string | null }>
}

/** Lit une page : `image` = data URL. `ref` = référentiel déjà chargé (indexé) ou null. */
export async function lirePage(p: {
  apiKey: string
  image: string
  communePrecedente: string | null
  ref: ReturnType<typeof indexer>
}): Promise<PageLue> {
  let brut: unknown
  try {
    brut = await generateJsonFromImage<unknown>(
      p.apiKey, SYSTEM, 'Voici la page à lire. Recopie chaque ligne du tableau.', p.image, 8192,
    )
  } catch (e) {
    console.error('feuille de route : lecture vision', (e as Error)?.message,
      e instanceof ExternalApiError ? JSON.stringify(e.responseBody) : '')
    const surcharge = e instanceof ExternalApiError && e.status === 429
    throw new ErreurLecture(
      surcharge ? 'Service de lecture surchargé : réessaie dans une minute.'
        : 'Page illisible : reprends la photo à plat, bien éclairée, une page entière.',
      surcharge ? 503 : 422,
    )
  }
  const lecture = nettoyerLecture(brut)
  const arrets = appliquerReferentiel(lignesEnArrets(forcerBrumath(lecture.lignes)), p.ref, p.communePrecedente)
    // Commune retrouvée sans bandeau (page suivante, secteur) : son code postal est complété.
    .map(a => (a.cp ? a : { ...a, cp: cpDeCommune(a.commune) }))
  // Seuls les arrêts que le référentiel ne place pas partent au géocodage BAN.
  const aGeocoder = arrets.filter(a => a.lat == null)
  const trouves = await geocoderTous(aGeocoder)
  const parArret = new Map(aGeocoder.map((a, i) => [a, trouves[i]]))
  const points = arrets.map(a => (a.lat != null && a.lng != null
    ? { lat: a.lat, lng: a.lng, precision: a.geo_precision ?? 'rue' } as PointArret
    : parArret.get(a) ?? null))
  console.log('feuille de route : page lue', lecture.page ? `${lecture.page.numero}/${lecture.page.total}` : '?/?', lecture.lignes.length, 'lignes,', arrets.length, 'arrêts,',
    points.filter(Boolean).length, 'localisés,', arrets.filter(a => a.rue_connue).length, 'rues du référentiel')
  return {
    entete: lecture.entete,
    page: lecture.page,
    arrets: arrets.map((a, i) => ({
      ...a,
      lat: points[i]?.lat ?? null,
      lng: points[i]?.lng ?? null,
      geo_precision: points[i]?.precision ?? null,
    })),
  }
}

export { indexer }
