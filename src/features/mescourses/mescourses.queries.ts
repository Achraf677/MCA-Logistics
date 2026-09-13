import { supabase } from '../../app/providers'
import type { CourseChauffeur, TourneeChauffeur } from './mescourses.types'

/**
 * Courses du chauffeur connecté sur une plage de dates.
 *
 * Aucun filtre sur le chauffeur n'est écrit ici : la policy RLS
 * `deliveries_select_own` s'en charge côté base — un compte `chauffeur` ne voit
 * que les livraisons dont il est le conducteur, un président ou un DG voit
 * tout. Filtrer aussi côté client donnerait l'illusion que c'est l'écran qui
 * protège les données, et ferait diverger les deux règles le jour où l'une
 * change.
 *
 * Conséquence assumée : un président qui ouvre cet écran y voit toutes les
 * courses de la période, pas seulement les siennes.
 */
export async function getMesCourses(debut: string, fin: string) {
  return supabase
    .from('deliveries')
    .select([
      'id', 'date', 'statut', 'description',
      'pickup_address', 'delivery_address',
      'delivery_lat', 'delivery_lng',
      'pod_captured_at', 'weight_kg', 'charge_le', 'lv_signatures',
      'expediteur_nom', 'destinataire_nom', 'pod_recipient_name', 'stop_order', 'tour_id',
      'clients!client_id(name, phone)',
      'vehicles!vehicle_id(label, plate)',
    ].join(', '))
    .gte('date', debut)
    .lte('date', fin)
    .order('date', { ascending: true })
    // `stop_order` d'abord : c'est l'ordre que le chauffeur a impose lui-meme.
    // `nullsFirst: false` place les courses jamais ordonnees APRES celles qui
    // le sont — sinon une nouvelle course viendrait se planter en tete d'une
    // journee deja organisee.
    .order('stop_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .returns<CourseChauffeur[]>()
}

/**
 * Fait avancer une course depuis l'écran chauffeur.
 *
 * Volontairement limitée aux transitions qu'un chauffeur déclenche sur le
 * terrain : démarrer et livrer. Facturer et encaisser ne passent PAS par ici —
 * ces transitions touchent aux montants et à Pennylane, et n'ont rien à faire
 * dans l'écran d'un chauffeur. La règle de transition elle-même reste celle de
 * `shared/lib/livraisonStatuts` : aucune règle n'est réécrite ici.
 *
 * L'écriture est de toute façon bornée par la policy RLS `deliveries_update_perm`.
 */
export async function avancerCourse(id: string, cible: 'en_cours' | 'livree') {
  return supabase
    .from('deliveries')
    .update({ statut: cible })
    .eq('id', id)
    .select('id, statut')
    .single()
}

/**
 * Documents rattachés aux courses affichées.
 *
 * Ce sont les pièces déposées côté bureau — bon de commande, étiquette,
 * consignes du client, lettre de voiture — plus les photos de preuve prises
 * sur le terrain. Le chauffeur en avait besoin AVANT d'arriver, et il n'avait
 * jusqu'ici aucun moyen de les consulter depuis son téléphone.
 *
 * Une seule requête pour toute la période, pas une par course : sur une
 * semaine chargée, cela fait une requête au lieu de trente.
 *
 * La RLS fait le tri : `documents_select_company` autorise tout membre de la
 * société, chauffeur compris. Aucune policy à ajouter.
 */
export async function getDocumentsDesCourses(deliveryIds: string[]) {
  if (deliveryIds.length === 0) return { data: [], error: null }
  return supabase
    .from('documents')
    .select('id, entity_id, file_name, mime_type, category, storage_path, drive_link, created_at')
    .eq('entity_type', 'delivery')
    .in('entity_id', deliveryIds)
    .order('created_at', { ascending: false })
}

/**
 * Marque le CHARGEMENT au point de retrait.
 *
 * Ne touche PAS `statut` : la course reste `en_cours`. Le chargement est une
 * information de terrain, pas un état comptable — voir la migration
 * 20260913090000 pour le raisonnement complet.
 */
export async function marquerCharge(id: string, expediteurNom: string | null) {
  return supabase
    .from('deliveries')
    .update({
      charge_le: new Date().toISOString(),
      // On n'écrase pas un nom déjà saisi au bureau par une valeur vide.
      ...(expediteurNom ? { expediteur_nom: expediteurNom } : {}),
    })
    .eq('id', id)
    .select('id, charge_le')
    .single()
}

/**
 * Ajoute une signature à la lettre de voiture, sans écraser les autres.
 *
 * `lv_signatures` est un objet jsonb à trois clés (expediteur, transporteur,
 * destinataire). On RELIT avant d'écrire : un `update` direct remplacerait
 * l'objet entier et effacerait la signature de l'autre partie. Le format est
 * exactement celui de la lettre de voiture du bureau — même PNG, même
 * horodatage, même géoloc — pour qu'une signature prise sur le téléphone soit
 * indiscernable d'une signature prise sur l'ordinateur.
 */
export async function ajouterSignature(
  id: string,
  role: 'expediteur' | 'transporteur' | 'destinataire',
  data: { png: string; ts: string; geo?: { lat: number; lng: number; acc?: number } },
) {
  const { data: ligne, error: lErr } = await supabase
    .from('deliveries').select('lv_signatures').eq('id', id).single()
  if (lErr) return { error: lErr }

  const actuelles = (ligne?.lv_signatures ?? {}) as Record<string, unknown>
  return supabase
    .from('deliveries')
    .update({ lv_signatures: { ...actuelles, [role]: data } })
    .eq('id', id)
}

/**
 * Ordre des courses dans la journée du chauffeur.
 *
 * Réutilise `stop_order`, déjà porté par `deliveries` pour les tournées : une
 * course sans tournée peut avoir un ordre, et une course en tournée garde le
 * sien. Deux colonnes d'ordre auraient fini par se contredire.
 */
export async function enregistrerOrdreCourses(idsDansLOrdre: string[]) {
  const resultats = await Promise.all(
    idsDansLOrdre.map((id, i) =>
      supabase.from('deliveries').update({ stop_order: i + 1 }).eq('id', id),
    ),
  )
  const echec = resultats.find(r => r.error)
  return { error: echec?.error ?? null }
}

// ── La tournée, vue du chauffeur ──────────────────────────────────────────────

/**
 * Tournées de la période.
 *
 * Aucun filtre sur le chauffeur ici non plus : la policy `tours_select_own`
 * ne rend à un chauffeur que les tournées dont il est le conducteur
 * (`driver_id`), et tout à un président, un DG ou un comptable. Même règle,
 * même endroit qu'ailleurs : la base.
 *
 * Pourquoi cette requête existe dans « Mes courses » alors que l'écran
 * Tournées la fait déjà : les features sont étanches. Le bureau prépare la
 * tournée sur grand écran ; le chauffeur, lui, a besoin sur son téléphone des
 * deux seules choses qui servent en roulant — l'itinéraire complet et le
 * démarrage/arrêt de la tournée.
 */
export async function getTourneesDuChauffeur(debut: string, fin: string) {
  return supabase
    .from('tours')
    .select('id, date, status, vehicle_id, depot_lat, depot_lng, total_km, total_duration_min, eviter_peages')
    .gte('date', debut)
    .lte('date', fin)
    .order('date', { ascending: true })
    .returns<TourneeChauffeur[]>()
}

/**
 * Démarre ou termine la tournée depuis le téléphone.
 *
 * ATTENTION, et l'écran doit le refléter : `tours_update_perm` exige d'être
 * président ou d'avoir la permission `planning.tournees:update`. Un chauffeur
 * qui ne l'a pas verra l'écriture refusée par la base. L'écran masque donc les
 * boutons dans ce cas plutôt que de proposer un geste qui échouera.
 */
export async function changerStatutTournee(tourId: string, status: 'en_cours' | 'terminee') {
  return supabase.from('tours').update({ status }).eq('id', tourId)
}

/** Dépôt de la société — origine et destination de l'itinéraire complet. */
export async function getDepot(companyId: string) {
  return supabase
    .from('companies')
    .select('depot_lat, depot_lng')
    .eq('id', companyId)
    .single()
}
