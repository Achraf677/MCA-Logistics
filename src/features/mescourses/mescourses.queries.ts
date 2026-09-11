import { supabase } from '../../app/providers'
import type { CourseChauffeur } from './mescourses.types'

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
      'pod_captured_at', 'weight_kg',
      'clients!client_id(name, phone)',
      'vehicles!vehicle_id(label, plate)',
    ].join(', '))
    .gte('date', debut)
    .lte('date', fin)
    .order('date', { ascending: true })
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
