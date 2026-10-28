// Itinéraire IGN (Géoplateforme, sans clé). Ressource vérifiée sur /navigation/getCapabilities le 28/10/2026 :
// `bdtopo-osrm` a été SUPPRIMÉE par l'IGN (erreur « Parameter 'resource' is invalid ») → `bdtopo-valhalla`.
// Une seule source pour toutes les Edge qui tracent un itinéraire (optimiser-tournee-colis, route-calc).
export const IGN_ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire'
export const IGN_RESSOURCE = 'bdtopo-valhalla'
