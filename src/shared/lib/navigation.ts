/**
 * Liens de navigation externes (Google Maps, Waze).
 *
 * Vit dans `shared/` parce que DEUX ecrans en ont besoin : les tournees cote
 * bureau et « Mes courses » sur le telephone. Les features etant etanches,
 * c'est le seul endroit ou les deux peuvent puiser les memes liens — et
 * « Mes courses » s'etait deja mis a reconstruire l'URL a la main dans le JSX,
 * ce qui est precisement comme ca que deux ecrans finissent par ne plus
 * naviguer pareil.
 *
 * Module PUR : aucune base, aucun DOM.
 */

export interface GeoPoint { lat: number; lng: number }
export interface OrderedStop extends GeoPoint { stop_order: number | null }

/**
 * Options de navigation transmises aux applications externes.
 *
 * `eviterPeages` agit UNIQUEMENT ici, dans les liens : c'est l'application du
 * chauffeur qui choisit la route reelle. L'optimisation de l'ordre des arrets
 * ne peut pas en tenir compte — elle passe par l'endpoint /optimization
 * d'OpenRouteService, base sur Vroom, dont le schema n'expose aucune option
 * d'evitement (seul le `profile` du vehicule est parametrable). Verifie dans
 * la documentation Vroom le 11/09/2026.
 */
export interface NavOptions {
  eviterPeages?: boolean
}

/** Lien Google Maps vers un arret unique (destination simple). */
export function googleMapsStopUrl(lat: number, lng: number, opts: NavOptions = {}): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  // Parametre documente par Google : avoid=tolls|highways|ferries.
  return opts.eviterPeages ? `${base}&avoid=tolls` : base
}

/** Lien Waze vers un point, navigation lancee. */
export function wazeUrl(lat: number, lng: number, opts: NavOptions = {}): string {
  const base = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  // Parametre documente par Waze : avoid_tolls=true.
  return opts.eviterPeages ? `${base}&avoid_tolls=true` : base
}

/**
 * Lien Google Maps vers une adresse ECRITE, pas des coordonnees.
 *
 * Necessaire pour les adresses de RETRAIT : `deliveries` porte
 * `pickup_address` en texte mais n'a pas de `pickup_lat`/`pickup_lng` — seule
 * l'adresse de livraison est geocodee. Google resout l'adresse de son cote ;
 * c'est moins precis qu'un point, et c'est la seule option disponible.
 */
export function googleMapsAdresseUrl(adresse: string, opts: NavOptions = {}): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse.trim())}`
  return opts.eviterPeages ? `${base}&avoid=tolls` : base
}

/**
 * Lien Waze vers une adresse ecrite.
 *
 * Waze n'a PAS de parametre d'evitement des peages sur une recherche par
 * adresse : `avoid_tolls` ne s'applique qu'a une navigation lancee sur des
 * coordonnees. On l'omet donc plutot que d'ajouter un parametre ignore qui
 * laisserait croire que la consigne est passee.
 */
export function wazeAdresseUrl(adresse: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(adresse.trim())}&navigate=yes`
}

/**
 * Itineraire complet Google Maps : depot en origine ET destination,
 * arrets geocodes en waypoints dans l'ordre stop_order. null si pas de depot.
 * Le separateur waypoints « | » et les virgules sont encodes (encodeURIComponent).
 */
export function googleMapsRouteUrl(
  depot: GeoPoint | null,
  stops: OrderedStop[],
  opts: NavOptions = {},
): string | null {
  if (!depot) return null
  const ordered = [...stops]
    .filter(s => s.lat != null && s.lng != null)
    .sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
  let url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${depot.lat},${depot.lng}` +
    `&destination=${depot.lat},${depot.lng}`
  if (ordered.length > 0) {
    const waypoints = ordered.map(s => `${s.lat},${s.lng}`).join('|')
    url += `&waypoints=${encodeURIComponent(waypoints)}`
  }
  if (opts.eviterPeages) url += '&avoid=tolls'
  return url
}

// ── Choix de l'application de navigation ──────────────────────────────────────

/**
 * Les trois applications que le chauffeur peut vouloir.
 *
 * `plans` = Plans d'Apple. Le lien `maps.apple.com` ouvre l'application native
 * sur iPhone et un site web ailleurs — c'est le comportement documenté par
 * Apple, et c'est pour ca qu'on ne masque pas le choix selon l'appareil :
 * detecter l'OS depuis le navigateur se trompe (iPad en mode bureau, WebView),
 * et un chauffeur sait mieux que nous ce qu'il a installe.
 */
export type AppNavigation = 'google' | 'waze' | 'plans'

export const APPS_NAVIGATION: Array<{ cle: AppNavigation; libelle: string }> = [
  { cle: 'google', libelle: 'Google Maps' },
  { cle: 'waze',   libelle: 'Waze' },
  { cle: 'plans',  libelle: 'Plans' },
]

/** Lien Plans (Apple) vers un point. */
export function plansStopUrl(lat: number, lng: number): string {
  // `dirflg=d` = itineraire en voiture. Apple n'expose aucune option
  // d'evitement des peages sur ce schema d'URL : on ne l'invente pas.
  return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
}

/** Lien Plans (Apple) vers une adresse ecrite. */
export function plansAdresseUrl(adresse: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(adresse.trim())}&dirflg=d`
}

/** Cible de navigation : un point geocode, ou une adresse ecrite. */
export type CibleNavigation =
  | { lat: number; lng: number; adresse?: string | null }
  | { lat?: null; lng?: null; adresse: string }

/**
 * LE point d'entree unique : « emmene-moi la, avec cette application ».
 *
 * Choisit tout seul entre coordonnees et adresse ecrite — les coordonnees
 * quand on les a, parce qu'elles sont exactes ; l'adresse sinon, parce que
 * `deliveries` ne geocode que la livraison et qu'un point de retrait n'a que
 * son texte.
 *
 * Renvoie `null` quand il n'y a rien a viser, pour que l'ecran masque le
 * bouton plutot que d'ouvrir une carte vide.
 */
export function lienNavigation(
  app: AppNavigation,
  cible: CibleNavigation,
  opts: NavOptions = {},
): string | null {
  const lat = cible.lat
  const lng = cible.lng
  const adresse = cible.adresse?.trim()

  if (lat != null && lng != null) {
    if (app === 'waze')  return wazeUrl(lat, lng, opts)
    if (app === 'plans') return plansStopUrl(lat, lng)
    return googleMapsStopUrl(lat, lng, opts)
  }

  if (!adresse) return null
  if (app === 'waze')  return wazeAdresseUrl(adresse)
  if (app === 'plans') return plansAdresseUrl(adresse)
  return googleMapsAdresseUrl(adresse, opts)
}
